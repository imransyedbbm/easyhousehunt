// Emails the other party about a site visit: new request → owner; confirmed/declined → tenant; cancelled → the other side.
// Caller must be the tenant or owner of the visit; recipient is always looked up server-side.
// Secrets: RESEND_API_KEY, EMAIL_FROM, SITE_URL (same as notify-email). Deploy normally (JWT verification on).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmt = (t: string) => new Date(t).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const KEY = Deno.env.get("RESEND_API_KEY");
    if (!KEY) return json({ skipped: "Email not configured" });
    const FROM = Deno.env.get("EMAIL_FROM") ?? "EasyHouseHunt <noreply@easyhousehunt.com>";
    const SITE = (Deno.env.get("SITE_URL") ?? "https://easyhousehunt.com").replace(/\/$/, "");

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { visit_id } = await req.json();
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: v } = await db.from("visit_requests").select("*, properties(title, address)").eq("id", visit_id).maybeSingle();
    if (!v || ![v.tenant_id, v.owner_id].includes(user.id)) return json({ error: "Forbidden" }, 403);

    const toId = user.id === v.tenant_id ? v.owner_id : v.tenant_id;
    const { data: u } = await db.auth.admin.getUserById(toId);
    const to = u?.user?.email;
    if (!to) return json({ skipped: "No email" });
    const title = v.properties?.title || "the home";
    const addr = v.properties?.address || "";

    let subject = "", lead = "";
    if (v.status === "pending") {
      subject = `Visit request: ${title}`;
      lead = `A tenant would like to see <b>${esc(title)}</b>. Any of these times:<br>${v.slots.map((s: string) => `• ${fmt(s)}`).join("<br>")}${v.note ? `<br><br>Note: “${esc(v.note)}”` : ""}<br><br>Pick one under <b>My Dashboard → Visits</b>.`;
    } else if (v.status === "confirmed") {
      subject = `Visit confirmed: ${title}, ${fmt(v.chosen_slot)}`;
      lead = `Your visit to <b>${esc(title)}</b> is confirmed for <b>${fmt(v.chosen_slot)}</b>.${addr ? `<br>${esc(addr)}` : ""}`;
    } else if (v.status === "declined") {
      subject = `Choose another time: ${title}`;
      lead = `The owner of <b>${esc(title)}</b> can't make those times. Request new slots or reply in chat.`;
    } else {
      subject = `Visit cancelled: ${title}`;
      lead = `The visit${v.chosen_slot ? ` on ${fmt(v.chosen_slot)}` : ""} for <b>${esc(title)}</b> was cancelled.`;
    }

    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#0f172a;margin:0 0 12px">${esc(subject)}</h2>
  <p style="color:#334155;line-height:1.6;margin:0 0 20px">${lead}</p>
  <a href="${SITE}/" style="display:inline-block;background:#C2410C;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Open EasyHouseHunt</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:22px">EasyHouseHunt · zero-brokerage homes in Bengaluru</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    return json({ sent: r.ok });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
