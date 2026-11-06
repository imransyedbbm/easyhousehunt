import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Public VAPID key (safe to ship; the private key lives only in the send-push function's secrets). */
export const VAPID_PUBLIC_KEY = "BJPcUeWXFHVmZzsmjm_nu3D73YQcoY3IxybF5KN6RmgfV9haVQQ5ZhWVkftGAZ9R1iAqdygJszrgamryoc3bsQM";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Notification on/off for this device. iPhone needs the app installed to the home screen first (iOS 16.4+). */
export function usePush(userId: string | undefined) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported() || !userId) return;
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setOn(!!s && Notification.permission === "granted"));
  }, [userId]);

  const enable = async (): Promise<string | null> => {
    if (!pushSupported()) return /iphone|ipad/i.test(navigator.userAgent) ? "On iPhone, first add EasyHouseHunt to your Home Screen (Share → Add to Home Screen), then open it from there." : "This browser doesn't support notifications.";
    if (!userId) return "Please sign in first.";
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return "Notifications are blocked. Allow them in your browser's site settings.";
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await (supabase as any).from("push_subscriptions").upsert({ endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth });
      if (error) return "Couldn't turn on notifications. Try again.";
      setOn(true);
      return null;
    } catch {
      return "Couldn't turn on notifications. Try again.";
    } finally { setBusy(false); }
  };

  const disable = async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await (supabase as any).from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setOn(false);
  };

  return { supported: pushSupported() || /iphone|ipad/i.test(typeof navigator !== "undefined" ? navigator.userAgent : ""), on, busy, enable, disable };
}
