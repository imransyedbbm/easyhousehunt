import { supabase } from "@/integrations/supabase/client";
import { visitorId } from "@/lib/insights";

export type SiteEvent = "visit" | "area_search" | "listing_open" | "contact_click" | "visit_request" | "list_start" | "requirement_open" | "signup";

/** Where this visit came from: ?source= / utm_source, else the referrer's site, else "direct". */
function visitSource(): string {
  const q = new URLSearchParams(window.location.search);
  const tag = q.get("source") || q.get("utm_source");
  if (tag) return tag.toLowerCase().slice(0, 40);
  try {
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (!host || host.endsWith("easyhousehunt.com")) return "direct";
    if (/google\./.test(host)) return "google";
    if (/whatsapp|wa\.me/.test(host)) return "whatsapp";
    if (/facebook|fb\.|instagram/.test(host)) return "meta";
    return host.slice(0, 40);
  } catch { return "direct"; }
}

/** Fire-and-forget anonymous event. Never throws, never blocks the UI. Skipped on localhost. */
export function track(event: SiteEvent, extra: { area?: string | null; propertyId?: string | null } = {}) {
  if (typeof window === "undefined" || /^(localhost|127\.)/.test(window.location.hostname)) return;
  supabase.rpc("log_event" as never, {
    p_visitor: visitorId(), p_event: event, p_area: extra.area ?? null,
    p_property: extra.propertyId && /^[0-9a-f-]{36}$/i.test(extra.propertyId) ? extra.propertyId : null,
    p_source: event === "visit" ? visitSource() : null,
  } as never).then(() => {}, () => {});
}
