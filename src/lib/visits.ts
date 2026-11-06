import { supabase } from "@/integrations/supabase/client";

export type Visit = {
  id: string; property_id: string; tenant_id: string; owner_id: string; slots: string[]; chosen_slot: string | null;
  note: string | null; status: "pending" | "confirmed" | "declined" | "cancelled"; created_at: string;
  properties?: { title: string; address: string | null; share_code?: string | null } | null;
};

export const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const notify = (id: string) => { supabase.functions.invoke("notify-visit", { body: { visit_id: id } }).then(() => {}, () => {}); };
const errText = (e: any) => (e?.message || "Something went wrong").replace(/^.*?:\s*/, "");

export async function requestVisit(propertyId: string, slots: Date[], note: string) {
  const { data, error } = await (supabase as any).rpc("request_visit", { p_property: propertyId, p_slots: slots.map((d) => d.toISOString()), p_note: note || null });
  if (error) return { error: errText(error) };
  notify(String(data));
  return { error: null };
}
export async function respondVisit(id: string, action: "confirm" | "decline", slot?: string) {
  const { error } = await (supabase as any).rpc("respond_visit", { p_visit: id, p_action: action, p_slot: slot ?? null });
  if (!error) notify(id);
  return { error: error ? errText(error) : null };
}
export async function cancelVisit(id: string) {
  const { error } = await (supabase as any).rpc("cancel_visit", { p_visit: id });
  if (!error) notify(id);
  return { error: error ? errText(error) : null };
}

export async function loadVisits(userId: string): Promise<Visit[]> {
  const { data } = await (supabase as any)
    .from("visit_requests")
    .select("*, properties(title, address, share_code)")
    .or(`tenant_id.eq.${userId},owner_id.eq.${userId}`)
    .in("status", ["pending", "confirmed", "declined"])
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as Visit[];
}

/** Google Calendar link for a confirmed visit (1 hour). */
export function calendarUrl(v: Visit) {
  const start = new Date(v.chosen_slot!);
  const end = new Date(start.getTime() + 3600_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE", text: `House visit: ${v.properties?.title ?? "EasyHouseHunt"}`,
    dates: `${z(start)}/${z(end)}`, location: v.properties?.address ?? "", details: "Booked on easyhousehunt.com",
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
