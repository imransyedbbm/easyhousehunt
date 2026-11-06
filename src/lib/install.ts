import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; subs.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; subs.forEach((f) => f()); });
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install app": Android/desktop Chrome get the native prompt; iPhone gets Share → Add to Home Screen instructions. */
export function useInstallApp() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  if (typeof window === "undefined" || isStandalone()) return { canInstall: false, install: async () => "unavailable" as const };
  const ios = isIOS();
  return {
    canInstall: !!deferred || ios,
    install: async (): Promise<"accepted" | "dismissed" | "ios" | "unavailable"> => {
      if (deferred) {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        deferred = null; tick((n) => n + 1);
        return outcome === "accepted" ? "accepted" : "dismissed";
      }
      return ios ? "ios" : "unavailable";
    },
  };
}
