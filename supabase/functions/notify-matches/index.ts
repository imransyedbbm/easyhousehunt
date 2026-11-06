// Alerts tenants whose saved requirement matches a listing: when an admin approves it,
// and again (once per drop) when the owner lowers the rent.
// Secrets: RESEND_API_KEY, EMAIL_FROM, SITE_URL (same as notify-email).
// Optional WhatsApp (Meta WhatsApp Cloud API) — sent only if all three are set and the tenant opted in:
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE (an approved template with 4 body
//   variables: {{1}} name, {{2}} home, {{3}} rent, {{4}} link). Optional WHATSAPP_TEMPLATE_LANG (default "en").

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const inr = (n: number | null) => (n == null ? "" : "₹" + Number(n).toLocaleString("en-IN"));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "EasyHouseHunt <noreply@easyhousehunt.com>";
    const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://easyhousehunt.com").replace(/\/$/, "");
    if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { property_id } = await req.json();
    if (typeof property_id !== "string") return json({ error: "Bad request" }, 400);

    const { data: p } = await admin
      .from("properties")
      .select("*")
      .eq("id", property_id)
      .maybeSingle();
    if (!p) return json({ error: "Listing not found" }, 404);

    // Admins (on approval) or the listing's own owner (after editing it) may trigger alerts.
    if (p.landlord_id !== user.id) {
      const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (!me?.is_admin) return json({ error: "Forbidden" }, 403);
    }

    const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
    const WA_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const WA_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE");
    const WA_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";
    const waEnabled = !!(WA_TOKEN && WA_PHONE_ID && WA_TEMPLATE);
    const toWa = (phone: string | null) => {
      const d = (phone || "").replace(/\D/g, "");
      if (d.length === 10) return "91" + d;               // Indian mobile without country code
      if (d.length === 12 && d.startsWith("91")) return d;
      return d.length >= 11 ? d : null;
    };
    const avail = p.availability_date && new Date(p.availability_date) > new Date()
      ? `Available from ${new Date(p.availability_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
      : "Available now";

    const { data: matches, error } = await admin.rpc("requirement_matches_for_property", { _property_id: property_id });
    if (error) return json({ error: error.message }, 500);

    const photo = (p.media_urls || []).find((u: string) => /^https?:\/\//.test(u));
    const size = p.property_type === "Commercial" ? (p.commercial_type || "Commercial space")
      : p.property_type === "PG" ? "PG" : p.bhk ? `${p.bhk} BHK ${p.property_type || ""}`.trim() : p.property_type || "Home";
    const slug = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
    const sizeSlug = p.property_type === "PG" ? "pg" : p.property_type === "Commercial" ? "commercial" : p.bhk ? `${p.bhk}bhk` : "";
    const listingLink = p.share_code ? `${SITE_URL}/l/${slug(`${sizeSlug} ${p.title || "home"}`)}-${p.share_code}` : `${SITE_URL}/?p=${p.id}`;
    let sent = 0, whatsapp = 0;

    for (const m of matches ?? []) {
      const drop = m.reason === "price_drop";
      let delivered = false;

      if (m.email) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#0f172a;margin:0 0 8px">${drop ? "Price drop on a home that matches you" : "A new home matches your requirement"}</h2>
  <p style="color:#475569;margin:0 0 16px">Hi ${esc(m.name || "there")}, ${drop
    ? `the owner reduced the rent from <s>${inr(m.previous_rent)}</s> to <b>${inr(p.rent)}</b>:`
    : "this was just listed on EasyHouseHunt:"}</p>
  ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;border-radius:10px;margin-bottom:12px">` : ""}
  <p style="margin:0;color:#0f172a;font-weight:bold;font-size:16px">${esc(p.title || size)}</p>
  <p style="margin:4px 0;color:#475569">${esc(size)}${p.furnishing ? " · " + esc(p.furnishing) : ""}</p>
  <p style="margin:4px 0;color:#C2410C;font-weight:bold;font-size:18px">${inr(p.rent)}/month</p>
  <p style="margin:0 0 16px;color:#0F766E;font-size:13px;font-weight:bold">${avail}</p>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(p.address || "")}</p>
  <a href="${listingLink}" style="display:inline-block;background:#C2410C;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">See this home</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">You're getting this because you posted a requirement. Pause or close it any time from "My requirements".<br>EasyHouseHunt · easyhousehunt.com</p>
</div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM, to: [m.email], html,
          subject: drop ? `Price drop: ${p.title || size} now ${inr(p.rent)}` : `New match: ${p.title || size} · ${inr(p.rent)}`,
        }),
      });
      if (res.ok) { sent++; delivered = true; }
      }

      const waTo = waEnabled && m.whatsapp_opt_in ? toWa(m.phone) : null;
      if (waTo) {
        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: waTo, type: "template",
            template: {
              name: WA_TEMPLATE, language: { code: WA_LANG },
              components: [{ type: "body", parameters: [
                { type: "text", text: m.name || "there" },
                { type: "text", text: `${p.title || size}${drop ? " (price reduced)" : ""}` },
                { type: "text", text: `${inr(p.rent)}/month · ${avail}` },
                { type: "text", text: listingLink },
              ] }],
            },
          }),
        });
        if (r.ok) { whatsapp++; delivered = true; } else console.warn("WhatsApp send failed", await r.text());
      }

      if (delivered) {
        await admin.from("requirement_notifications").upsert(
          { requirement_id: m.requirement_id, property_id, rent_notified: p.rent, sent_at: new Date().toISOString() },
          { onConflict: "requirement_id,property_id" },
        );
        await admin.from("requirements").update({ last_notified_at: new Date().toISOString() }).eq("id", m.requirement_id);
      }
    }

    return json({ matched: matches?.length ?? 0, sent, whatsapp });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
