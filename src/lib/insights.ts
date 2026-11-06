import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Listings unconfirmed for this long get an owner nudge. */
export const STALE_DAYS = 21;

const VISITOR_KEY = "ehh_vid";
function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, v); }
    return v;
  } catch { return crypto.randomUUID(); }
}

const logged = new Set<string>();
/** Record one view per listing per visitor per day. Fire-and-forget; never blocks the UI. */
export function logListingView(propertyId: string, source: "app" | "share" = "app") {
  if (!propertyId || logged.has(propertyId) || !/^[0-9a-f-]{36}$/i.test(propertyId)) return;
  logged.add(propertyId);
  supabase.rpc("log_listing_view", { p_property: propertyId, p_visitor: visitorId(), p_source: source }).then(() => {}, () => {});
}

export type ListingStats = { views: number; views_7d: number; saves: number; enquiries: number };

export function useListingStats(enabled: boolean) {
  const [stats, setStats] = useState<Record<string, ListingStats>>({});
  useEffect(() => {
    if (!enabled) return;
    supabase.rpc("listing_stats").then(({ data, error }) => {
      if (error || !data) return; // migration not applied yet: stats simply don't show
      const m: Record<string, ListingStats> = {};
      for (const r of data as Array<ListingStats & { property_id: string }>) {
        m[String(r.property_id)] = { views: Number(r.views), views_7d: Number(r.views_7d), saves: Number(r.saves), enquiries: Number(r.enquiries) };
      }
      setStats(m);
    });
  }, [enabled]);
  return stats;
}

export const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : Infinity;

export async function confirmListing(id: string) {
  return supabase.rpc("confirm_listing", { p_property: id });
}
export async function setLetOut(id: string, letOut: boolean) {
  return supabase.rpc(letOut ? "mark_listing_let_out" : "mark_listing_available", { p_property: id });
}

export type Benchmark = { median: number; low: number; high: number; n: number };
export async function rentBenchmark(lat: number, lng: number, type: string, bhk: number | null): Promise<Benchmark | null> {
  const { data, error } = await supabase.rpc("rent_benchmark", { p_lat: lat, p_lng: lng, p_type: type, p_bhk: bhk });
  if (error || !data || !(data as Benchmark[]).length) return null;
  return (data as Benchmark[])[0];
}

/** "Updated today / 3 days ago" for tenant-facing freshness. */
export function freshnessLabel(iso?: string | null): string | null {
  const d = daysSince(iso);
  if (!isFinite(d)) return null;
  if (d <= 0) return "Owner confirmed today";
  if (d === 1) return "Owner confirmed yesterday";
  if (d < 30) return `Owner confirmed ${d} days ago`;
  return null;
}
