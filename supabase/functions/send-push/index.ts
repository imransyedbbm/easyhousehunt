// Sends a web push notification to the receiver of a new chat message.
// Called by the push_on_message database trigger (header x-cron-secret).
// Secrets: CRON_SECRET (existing), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:hello@easyhousehunt.com).
// Deploy with JWT verification OFF (the trigger authenticates with the secret).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ skipped: "VAPID keys not set" });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@easyhousehunt.com", pub, priv);

  const { message_id } = await req.json();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: m } = await db.from("messages").select("id, message, sender_name, receiver_id, property_id, properties(title)").eq("id", message_id).maybeSingle();
  if (!m?.receiver_id) return json({ skipped: "no message" });

  const text = String(m.message || "");
  const kind = text.startsWith("📅") ? "Visit request" : text.startsWith("✅") ? "Visit confirmed" : text.startsWith("❌") || text.startsWith("🚫") ? "Visit update" : null;
  const title = kind ?? (m.sender_name ? `${m.sender_name} sent a message` : "New message on EasyHouseHunt");
  const payload = JSON.stringify({
    title,
    body: `${(m as any).properties?.title ? (m as any).properties.title + ": " : ""}${text.replace(/\s+/g, " ").slice(0, 140)}`,
    url: kind ? "/?open=visits" : "/?open=messages",
    tag: `chat-${m.property_id}`,
  });

  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", m.receiver_id);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e: any) {
      // Subscription expired or revoked: remove it.
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return json({ sent });
});
