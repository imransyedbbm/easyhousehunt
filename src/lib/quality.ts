import { httpPhotos } from "@/lib/photos";

export type QualityTip = { key: string; label: string; points: number };
type L = {
  media_urls?: unknown; description?: string | null; amenities?: string[] | null; area_sqft?: number | null;
  deposit?: number | null; furnishing?: string | null; availability_date?: string | null; preferred_tenants?: string[] | null;
  property_type?: string | null; listing_type?: string | null; latitude?: number | null; bhk?: number | null;
};

/** 0–100 listing completeness score with the top fixes, most valuable first. */
export function listingQuality(l: L): { score: number; tips: QualityTip[] } {
  const photos = httpPhotos(l.media_urls).length;
  const desc = (l.description || "").trim().length;
  const rent = (l.listing_type ?? "rent") !== "sale";
  const homey = l.property_type !== "Commercial" && l.property_type !== "PG";
  const checks: Array<[boolean, QualityTip]> = [
    [photos >= 1, { key: "photo", label: "Add at least one photo", points: 20 }],
    [photos >= 4, { key: "photos4", label: `Add ${Math.max(1, 4 - photos)} more photo${4 - photos === 1 ? "" : "s"} (kitchen, bathroom, view)`, points: 15 }],
    [desc >= 120, { key: "desc", label: desc ? "Write a longer description (2–3 lines on the home and area)" : "Add a description", points: 15 }],
    [!!l.latitude, { key: "pin", label: "Drop the pin on the map", points: 10 }],
    [(l.amenities?.length ?? 0) >= 3, { key: "amen", label: "Tick the amenities you offer", points: 10 }],
    [!!l.area_sqft, { key: "area", label: "Add the carpet/built-up area (sq ft)", points: 8 }],
    [!!l.furnishing || !homey, { key: "furn", label: "Say how furnished it is", points: 6 }],
    [!rent || !!l.deposit, { key: "dep", label: "Add the deposit amount", points: 6 }],
    [!rent || !!l.availability_date, { key: "avail", label: "Add the move-in date", points: 5 }],
    [!rent || !homey || (l.preferred_tenants?.length ?? 0) > 0, { key: "pref", label: "Choose preferred tenants (or 'Anyone')", points: 5 }],
  ];
  const total = checks.reduce((s, [, t]) => s + t.points, 0);
  const got = checks.reduce((s, [ok, t]) => s + (ok ? t.points : 0), 0);
  return { score: Math.round((got / total) * 100), tips: checks.filter(([ok]) => !ok).map(([, t]) => t) };
}

/** Default ordering when no area or location is set: complete, fresh, verified first. */
export function rankScore(l: L & { is_verified?: boolean | null; confirmed_at?: string | null; created_at?: string | null }) {
  const days = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : 60);
  const fresh = Math.max(0, 30 - Math.min(days(l.confirmed_at), days(l.created_at))) / 30; // 1 = today, 0 = 30+ days
  return listingQuality(l).score / 100 * 0.5 + fresh * 0.35 + (l.is_verified ? 0.15 : 0);
}
