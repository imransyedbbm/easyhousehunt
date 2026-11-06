// Writes a listing description from the owner's form details (Gemini).
// Signed-in users only, 10 drafts per user per day (ai_usage table).
// Secret: GEMINI_API_KEY (same as gemini-proxy). Deploy normally (JWT verification on).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clip = (v: unknown, n = 120) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please sign in" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ok } = await admin.rpc("take_ai_use", { p_user: user.id, p_cap: 10 });
    if (ok === false) return json({ error: "You've used today's 10 AI drafts. Try again tomorrow." }, 429);

    const f = await req.json();
    const facts = [
      ["Listing", f.listing_type === "sale" ? "for sale" : "for rent"],
      ["Type", clip(f.property_type)], ["Commercial type", clip(f.commercial_type)],
      ["BHK", clip(f.bhk, 4)], ["PG occupancy", clip(f.occupancy)],
      ["Area (sq ft)", clip(f.area_sqft, 8)], ["Furnishing", clip(f.furnishing)],
      ["Address / locality", clip(f.address, 200)], ["Amenities", clip((f.amenities || []).join(", "), 300)],
      ["Available from", clip(f.availability_date) || "now"], ["Preferred tenants", clip((f.preferred_tenants || []).join(", ")) || "anyone"],
      ["Owner's own notes", clip(f.notes, 400)],
    ].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n");

    const prompt = `Write a property listing description for EasyHouseHunt, a zero-brokerage site in Bengaluru where owners list directly.
Facts (use only these; never invent amenities, distances, landmarks or prices):
${facts}

Rules: 60–110 words, plain English, warm but factual, no emojis, no ALL CAPS, no phone numbers, no price, no "broker" wording.
Start with the home itself, then what it's like to live there, then who it suits. If the owner's notes mention nearby places, you may use them.
Return only the description text.`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 400 } }) },
    );
    const data = await r.json();
    const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().replace(/\+?\d[\d\s-]{8,}\d/g, "");
    if (!text) return json({ error: "Couldn't write a draft right now. Try again." }, 502);
    return json({ text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
