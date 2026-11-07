// Weekly "new homes for you" email (Saturdays, via pg_cron with header x-cron-secret).
// One email per tenant with up to 6 new homes from the last 7 days that fit their active requirements.
// No matches → no email. Each email has a one-click unsubscribe (GET ?u=<user>&t=<signature>).
// Secrets: CRON_SECRET, RESEND_API_KEY, EMAIL_FROM, SITE_URL. Deploy with JWT verification OFF.
// Test without sending: POST ?dry=1 (returns who would get what).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_HOMES = 6;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const page = (title: string, msg: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="font-family:system-ui,sans-serif;background:#0b0f19;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:420px;padding:24px;text-align:center"><h1 style="color:#fff;font-size:22px">${esc(title)}</h1><p style="color:#9ca3af">${msg}</p>
<a href="https://easyhousehunt.com/" style="display:inline-block;margin-top:12px;background:#cf460b;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">Open EasyHouseHunt</a></div>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

async function sign(userId: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("digest-unsub:" + userId));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
const inr = (n: number) => "₹" + Number(n).toLocaleString("en-IN");

serve(async (req) => {
  const SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const url = new URL(req.url);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // One-click unsubscribe from the email footer.
  if (req.method === "GET") {
    const u = url.searchParams.get("u") ?? "", t = url.searchParams.get("t") ?? "";
    if (!SECRET || !/^[0-9a-f-]{36}$/i.test(u) || t !== (await sign(u, SECRET))) return page("Link not valid", "This unsubscribe link isn't valid.");
    await db.from("digest_optouts").upsert({ user_id: u });
    return page("You're unsubscribed", "You won't get the weekly “new homes for you” email any more. Instant alerts for your requirements are unaffected; pause those under My Dashboard.");
  }

  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return json({ error: "Unauthorized" }, 401);
  const dry = url.searchParams.get("dry") === "1";
  const KEY = Deno.env.get("RESEND_API_KEY");
  if (!KEY && !dry) return json({ error: "Email not configured" }, 500);
  const FROM = Deno.env.get("EMAIL_FROM") ?? "EasyHouseHunt <noreply@easyhousehunt.com>";
  const SITE = (Deno.env.get("SITE_URL") ?? "https://easyhousehunt.com").replace(/\/$/, "");
  const FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/weekly-digest`;

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db.rpc("weekly_digest_matches", { p_since: since });
  if (error) return json({ error: error.message }, 500);

  type Row = { user_id: string; email: string; name: string | null; area: string | null; property_id: string; title: string; rent: number; bhk: number | null;
    property_type: string | null; furnishing: string | null; address: string | null; media_urls: string[] | null; share_code: string | null; created_at: string };
  const byUser = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) if (r.email) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const preview: unknown[] = [];
  let sent = 0;
  for (const [uid, rows] of byUser) {
    const homes = rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_HOMES);
    const total = rows.length;
    const area = rows.find((r) => r.area)?.area;
    const first = (rows[0].name || "").split(" ")[0] || "there";
    const subject = `${total} new home${total > 1 ? "s" : ""} for you${area ? ` near ${area}` : ""} this week`;
    if (dry) { preview.push({ to: rows[0].email, subject, homes: homes.map((h) => h.title) }); continue; }

    const cards = homes.map((h) => {
      const size = h.property_type === "PG" ? "PG" : h.bhk ? `${h.bhk} BHK` : h.property_type || "Home";
      const link = h.share_code ? `${SITE}/l/${slug(`${h.property_type === "PG" ? "pg" : h.bhk ? `${h.bhk}bhk` : ""} ${h.title || "home"}`)}-${h.share_code}` : `${SITE}/?p=${h.property_id}`;
      const photo = (h.media_urls ?? []).find((u) => /^https:\/\//.test(u));
      return `<a href="${link}" style="display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:0 0 14px">
  ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;height:180px;object-fit:cover;display:block">` : ""}
  <div style="padding:12px 14px"><div style="font-weight:bold;color:#0f172a">${esc(size)} · ${esc(h.title)}</div>
  <div style="color:#C2410C;font-weight:bold;margin:2px 0">${inr(h.rent)}/month${h.furnishing ? ` · ${esc(h.furnishing)}` : ""}</div>
  <div style="color:#64748b;font-size:13px">${esc((h.address || "").split(",").slice(0, 2).join(","))}</div></div></a>`;
    }).join("");
    const unsub = `${FN}?u=${uid}&t=${await sign(uid, SECRET)}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
  <h2 style="color:#0f172a;margin:0 0 6px">${esc(subject)}</h2>
  <p style="color:#475569;margin:0 0 18px">Hi ${esc(first)}, these homes were listed by owners this week and match what you're looking for. Good homes go fast, so message the owner or book a visit soon.</p>
  ${cards}
  ${total > homes.length ? `<p style="margin:0 0 16px;color:#475569">+ ${total - homes.length} more on the map.</p>` : ""}
  <a href="${SITE}/" style="display:inline-block;background:#C2410C;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">See all on EasyHouseHunt</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">You get this because you posted a requirement on EasyHouseHunt. Zero brokerage, direct from owners.<br>
  <a href="${unsub}" style="color:#94a3b8">Unsubscribe from the weekly email</a></p></div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [rows[0].email], subject, html, headers: { "List-Unsubscribe": `<${unsub}>` } }),
    });
    if (r.ok) sent++; else console.warn("Resend failed", await r.text());
  }
  return json(dry ? { dry: true, people: byUser.size, preview } : { people: byUser.size, sent });
});
