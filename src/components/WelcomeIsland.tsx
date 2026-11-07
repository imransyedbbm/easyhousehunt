import { hydrateRoot, type Root } from "react-dom/client";
import Welcome from "@/components/Welcome";
import type { Locality } from "@/data/localities";

/**
 * First-visit welcome, pre-rendered into index.html at build time (src/prerender.tsx).
 * We hydrate that exact DOM instead of re-drawing it, so it stays the page's main paint,
 * and tell the app what the visitor chose via a window event.
 */
export type WelcomeChoice = { action: "area"; area: Locality } | { action: "browse" } | { action: "list" };
export const WELCOME_EVENT = "ehh:welcome";

export const staticWelcomeShown = () =>
  typeof document !== "undefined" && !!document.getElementById("welcome-root")?.firstElementChild;

export function hydrateWelcome() {
  const el = document.getElementById("welcome-root");
  if (!el?.firstElementChild) return;
  let root: Root | null = null;
  const choose = (c: WelcomeChoice) => {
    window.dispatchEvent(new CustomEvent<WelcomeChoice>(WELCOME_EVENT, { detail: c }));
    setTimeout(() => { root?.unmount(); el.remove(); }, 0);
  };
  root = hydrateRoot(
    el,
    <Welcome
      listingCount={0}
      onPickArea={(area) => choose({ action: "area", area })}
      onBrowse={() => choose({ action: "browse" })}
      onListProperty={() => choose({ action: "list" })}
    />,
  );
}
