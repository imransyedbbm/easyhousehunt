import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePush } from "@/lib/push";

/** Menu row: turn phone notifications on/off for this device. */
export function NotifyMenuItem({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const p = usePush(user?.id);
  if (!user || !p.supported) return null;
  return (
    <button
      disabled={p.busy}
      onClick={async () => {
        if (p.on) { await p.disable(); toast("Notifications turned off on this device"); onDone(); return; }
        const err = await p.enable();
        onDone();
        if (err) toast.error(err, { duration: 8000 });
        else toast.success("Notifications on", { description: "We'll ping this device for new messages and visit updates." });
      }}
      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
    >
      {p.on ? <BellOff className="h-4 w-4 text-gray-400" /> : <Bell className="h-4 w-4 text-yellow-300" />}
      {p.on ? "Turn off notifications" : "Turn on notifications"}
    </button>
  );
}

/** Dismissable banner nudging users to enable notifications (dashboards). */
export function NotifyBanner() {
  const { user } = useAuth();
  const p = usePush(user?.id);
  let dismissed = false;
  try { dismissed = !!localStorage.getItem("ehh_notify_banner_off"); } catch { /* ignore */ }
  if (!user || !p.supported || p.on || dismissed) return null;
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-yellow-700/50 bg-yellow-950/40 p-3 text-sm text-yellow-100">
      <Bell className="h-5 w-5 flex-shrink-0 text-yellow-300" />
      <p className="flex-1">Get a notification the moment someone replies or confirms a visit.</p>
      <button
        onClick={async () => { const err = await p.enable(); if (err) toast.error(err, { duration: 8000 }); else toast.success("Notifications on"); }}
        className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-yellow-300"
      >
        Turn on
      </button>
      <button onClick={(e) => { try { localStorage.setItem("ehh_notify_banner_off", "1"); } catch { /* ignore */ } (e.currentTarget.parentElement as HTMLElement).remove(); }}
        aria-label="Dismiss" className="text-yellow-300/70 hover:text-yellow-200">✕</button>
    </div>
  );
}
