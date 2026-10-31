// Emails tenants whose saved requirement matches a newly approved listing.
// Called by the Admin dashboard right after approving a listing.
// Uses the same secrets as notify-email: RESEND_API_KEY, EMAIL_FROM, SITE_URL.

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
    const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!me?.is_admin) return json({ error: "Forbidden" }, 403);

    const { property_id } = await req.json();
    if (typeof property_id !== "string") return json({ error: "Bad request" }, 400);

    const { data: p } = await admin
      .from("properties")
      .select("id, title, address, bhk, rent, property_type, furnishing, media_urls")
      .eq("id", property_id)
      .maybeSingle();
    if (!p) return json({ error: "Listing not found" }, 404);

    const { data: matches, error } = await admin.rpc("requirement_matches_for_property", { _property_id: property_id });
    if (error) return json({ error: error.message }, 500);

    const photo = (p.media_urls || []).find((u: string) => /^https?:\/\//.test(u));
    const size = p.property_type === "PG" ? "PG" : p.bhk ? `${p.bhk} BHK ${p.property_type || ""}`.trim() : p.property_type || "Home";
    let sent = 0;

    for (const m of matches ?? []) {
      if (!m.email) continue;
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#0f172a;margin:0 0 8px">A new home matches your requirement</h2>
  <p style="color:#475569;margin:0 0 16px">Hi ${esc(m.name || "there")}, this was just listed on EasyHouseHunt:</p>
  ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;border-radius:10px;margin-bottom:12px">` : ""}
  <p style="margin:0;color:#0f172a;font-weight:bold;font-size:16px">${esc(p.title || size)}</p>
  <p style="margin:4px 0;color:#475569">${esc(size)}${p.furnishing ? " · " + esc(p.furnishing) : ""}</p>
  <p style="margin:4px 0 16px;color:#C2410C;font-weight:bold;font-size:18px">${inr(p.rent)}/month</p>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(p.address || "")}</p>
  <a href="${SITE_URL}/" style="display:inline-block;background:#C2410C;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">View on EasyHouseHunt</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">You're getting this because you posted a requirement. Pause or close it any time from "My requirements".<br>EasyHouseHunt · easyhousehunt.com</p>
</div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [m.email], subject: `New match: ${p.title || size} · ${inr(p.rent)}`, html }),
      });
      if (res.ok) {
        sent++;
        await admin.from("requirement_notifications").insert({ requirement_id: m.requirement_id, property_id });
        await admin.from("requirements").update({ last_notified_at: new Date().toISOString() }).eq("id", m.requirement_id);
      }
    }

    return json({ matched: matches?.length ?? 0, sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
