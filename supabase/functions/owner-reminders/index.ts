// Weekly email to owners whose live listings haven't been confirmed in 21+ days.
// Shows last week's views/saves/enquiries and one-tap buttons (no sign-in needed):
//   "Still available" / "Let out" → https://easyhousehunt.com/api/confirm?t=<token>&a=...
// Each listing is reminded at most once every 7 days.
// Secrets: RESEND_API_KEY, EMAIL_FROM, SITE_URL (same as notify-email) and CRON_SECRET (any long random string).
// Invoked by pg_cron (see migration 20261106120000_owner_reminders.sql) with header x-cron-secret.
// Deploy with: supabase functions deploy owner-reminders --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STALE_DAYS = 21;
const REMIND_EVERY_DAYS = 7;
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const inr = (n: number | null) => (n ? "₹" + Number(n).toLocaleString("en-IN") : "");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "EasyHouseHunt <noreply@easyhousehunt.com>";
  const SITE = (Deno.env.get("SITE_URL") ?? "https://easyhousehunt.com").replace(/\/$/, "");
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error } = await db
    .from("properties")
    .select("id, title, rent, sale_price, listing_type, bhk, property_type, landlord_id, confirmed_at, reminded_at, media_urls")
    .eq("status", "approved")
    .eq("is_sample", false)
    .neq("availability", "let_out")
    .lt("confirmed_at", daysAgo(STALE_DAYS))
    .or(`reminded_at.is.null,reminded_at.lt.${daysAgo(REMIND_EVERY_DAYS)}`)
    .limit(500);
  if (error) return json({ error: error.message }, 500);

  // Ensure each listing has a secret token, then load them.
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) await db.from("listing_tokens").upsert(ids.map((property_id) => ({ property_id })), { onConflict: "property_id", ignoreDuplicates: true });
  const { data: toks } = ids.length ? await db.from("listing_tokens").select("property_id, token").in("property_id", ids) : { data: [] };
  const tokenOf = new Map((toks ?? []).map((t: { property_id: string; token: string }) => [t.property_id, t.token]));

  const byOwner = new Map<string, typeof rows>();
  for (const r of rows ?? []) {
    if (!r.landlord_id || !tokenOf.has(r.id)) continue;
    byOwner.set(r.landlord_id, [...(byOwner.get(r.landlord_id) ?? []), r]);
  }

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  let sent = 0;
  for (const [ownerId, listings] of byOwner) {
    const { data: u } = await db.auth.admin.getUserById(ownerId);
    const to = u?.user?.email;
    if (!to) continue;
    const name = (u.user.user_metadata?.full_name || u.user.user_metadata?.name || "").split(" ")[0] || "there";

    const cards = [];
    for (const l of listings!) {
      const [{ count: views }, { count: saves }, { data: msgs }] = await Promise.all([
        db.from("listing_views").select("*", { count: "exact", head: true }).eq("property_id", l.id).gte("day", since),
        db.from("saved_properties").select("*", { count: "exact", head: true }).eq("property_id", l.id),
        db.from("messages").select("sender_id").eq("property_id", l.id).neq("sender_id", ownerId).gte("created_at", since + "T00:00:00Z"),
      ]);
      const enquiries = new Set((msgs ?? []).map((m: { sender_id: string }) => m.sender_id)).size;
      const days = Math.floor((Date.now() - new Date(l.confirmed_at).getTime()) / 86_400_000);
      const price = l.listing_type === "sale" ? inr(l.sale_price) : l.rent ? `${inr(l.rent)}/month` : "";
      const link = (a: string) => `${SITE}/api/confirm?t=${tokenOf.get(l.id)}&a=${a}`;
      const photo = (l.media_urls || []).find((x: string) => /^https:\/\//.test(x));
      cards.push(`<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 14px">
  ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:10px">` : ""}
  <p style="margin:0;font-weight:bold;color:#0f172a;font-size:16px">${esc(l.title || "Your listing")}</p>
  <p style="margin:2px 0 10px;color:#C2410C;font-weight:bold">${esc(price)}</p>
  <p style="margin:0 0 12px;color:#475569;font-size:14px">Last 7 days: <b>${views ?? 0}</b> views · <b>${enquiries}</b> new enquiries · <b>${saves ?? 0}</b> saved in total<br>
  <span style="color:#94a3b8;font-size:12px">Last confirmed ${days} days ago</span></p>
  <a href="${link("available")}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold;margin:0 6px 6px 0">✓ Still available</a>
  <a href="${link("let_out")}" style="display:inline-block;background:#334155;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold;margin:0 0 6px">${l.listing_type === "sale" ? "It's sold" : "It's let out"}</a>
</div>`);
    }

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px">
  <h2 style="color:#0f172a;margin:0 0 8px">Is your listing still available?</h2>
  <p style="color:#475569;margin:0 0 18px">Hi ${esc(name)}, tenants contact owners with recently confirmed listings first. One tap keeps yours at the top — no sign-in needed.</p>
  ${cards.join("")}
  <p style="color:#94a3b8;font-size:12px;margin-top:20px">Manage your listings any time under My Dashboard on <a href="${SITE}/" style="color:#94a3b8">easyhousehunt.com</a>.<br>You get this at most once a week while a listing is unconfirmed.</p>
</div>`;

    if (!dryRun) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM, to: [to], html,
          subject: listings!.length === 1 ? `Is "${listings![0].title}" still available?` : `Are your ${listings!.length} listings still available?`,
        }),
      });
      if (!r.ok) { console.warn("Resend failed", await r.text()); continue; }
      await db.from("properties").update({ reminded_at: new Date().toISOString() }).in("id", listings!.map((l) => l.id));
    }
    sent++;
  }
  return json({ owners: byOwner.size, sent, dryRun });
});
