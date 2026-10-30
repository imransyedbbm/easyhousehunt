// Sends transactional emails via Resend for enquiry events.
// Secrets required (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   – Resend key with sending access
//   EMAIL_FROM       – e.g. "EasyHouseHunt <noreply@easyhousehunt.com>"
//   SITE_URL         – e.g. "https://easyhousehunt.com"
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// The caller can only trigger emails about enquiries they are part of, and
// recipients are always looked up server-side, never taken from the request.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

function layout(title: string, bodyHtml: string, ctaText: string, ctaUrl: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#0f172a;margin:0 0 12px">${title}</h2>
  ${bodyHtml}
  <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:8px">${ctaText}</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">EasyHouseHunt · easyhousehunt.com</p>
</div>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "EasyHouseHunt <noreply@easyhousehunt.com>";
    const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://easyhousehunt.com").replace(/\/$/, "");
    if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

    // Identify the caller from their JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { type, enquiry_id } = await req.json();
    if (!["enquiry_created", "enquiry_status"].includes(type) || typeof enquiry_id !== "string") {
      return json({ error: "Bad request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: enq, error: enqErr } = await admin
      .from("enquiries")
      .select("id, status, message, visit_date, tenant_id, property_id, properties(id, title, address, landlord_id)")
      .eq("id", enquiry_id)
      .single();
    if (enqErr || !enq) return json({ error: "Enquiry not found" }, 404);

    const prop = (enq as any).properties;
    const landlordId: string = prop?.landlord_id;
    const tenantId: string = enq.tenant_id;

    // Authorisation: tenant may announce a new enquiry; landlord may announce a status change.
    let recipientId: string;
    if (type === "enquiry_created") {
      if (user.id !== tenantId) return json({ error: "Forbidden" }, 403);
      recipientId = landlordId;
    } else {
      if (user.id !== landlordId) {
        const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
      }
      recipientId = tenantId;
    }

    const { data: recipient } = await admin.auth.admin.getUserById(recipientId);
    const to = recipient?.user?.email;
    if (!to) return json({ skipped: "Recipient has no email" });

    const { data: tenantProfile } = await admin
      .from("profiles").select("full_name").eq("user_id", tenantId).maybeSingle();

    const propertyUrl = `${SITE_URL}/`;
    const title = esc(prop?.title ?? "your property");
    let subject: string, html: string;

    if (type === "enquiry_created") {
      subject = `New enquiry for ${prop?.title ?? "your property"}`;
      html = layout(
        "You have a new enquiry",
        `<p style="color:#475569">${esc(tenantProfile?.full_name || "A tenant")} is interested in <b>${title}</b>${prop?.address ? ` (${esc(prop.address)})` : ""}.</p>
         ${enq.message ? `<p style="color:#334155;background:#f1f5f9;padding:12px;border-radius:8px">“${esc(enq.message)}”</p>` : ""}`,
        "View enquiry",
        `${SITE_URL}/`,
      );
    } else {
      subject = `Update on your enquiry: ${prop?.title ?? "property"}`;
      html = layout(
        "Your enquiry was updated",
        `<p style="color:#475569">The owner of <b>${title}</b> updated your enquiry status to <b>${esc(String(enq.status).replace(/_/g, " "))}</b>.</p>
         ${enq.visit_date ? `<p style="color:#475569">Visit date: <b>${esc(enq.visit_date)}</b></p>` : ""}`,
        "View property",
        propertyUrl,
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: "Send failed", detail: out }, 502);

    return json({ sent: true, id: out.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
