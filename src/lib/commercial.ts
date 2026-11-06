import type { Property } from "@/types/property";

export const COMMERCIAL = "Commercial";
export const COMMERCIAL_TYPES = [
  "Office space", "Co-working / Managed office", "Shop / Retail", "Showroom",
  "Restaurant / F&B", "Warehouse / Godown", "Industrial",
];
export const COMMERCIAL_FURNISHING = ["Bare shell", "Warm shell", "Furnished", "Plug & play"];
export const RESIDENTIAL_FURNISHING = ["Unfurnished", "Semi", "Fully Furnished"];

export const isCommercial = (t?: string | null) => t === COMMERCIAL;
export const furnishingOptions = (t?: string | null) => (isCommercial(t) ? COMMERCIAL_FURNISHING : RESIDENTIAL_FURNISHING);

/** "2 BHK", "Single Occupancy", "Office space" … — the size/type badge for any listing. */
export function sizeLabel(p: Pick<Property, "property_type" | "bhk" | "occupancy" | "commercial_type">): string | null {
  if (isCommercial(p.property_type)) return p.commercial_type || "Commercial";
  if (p.property_type === "PG") return p.occupancy ? `${p.occupancy} Occupancy` : "PG";
  return p.bhk ? `${p.bhk} BHK` : null;
}

/** Size bands for commercial search (sq ft). */
export const SIZE_BANDS = [
  { key: "s", label: "Under 1,000", min: 0, max: 999 },
  { key: "m", label: "1,000–3,000", min: 1000, max: 3000 },
  { key: "l", label: "3,000–10,000", min: 3001, max: 10000 },
  { key: "xl", label: "10,000+", min: 10001, max: Infinity },
] as const;

const SEAT_TYPES = ["Office space", "Co-working / Managed office"];
/** Rough workstation capacity at ~70 sq ft per seat (offices / co-working only). */
export function seatEstimate(p: { property_type?: string | null; commercial_type?: string | null; area_sqft?: number | null }): number | null {
  if (!isCommercial(p.property_type) || !SEAT_TYPES.includes(p.commercial_type ?? "") || !p.area_sqft || p.area_sqft < 150) return null;
  return Math.max(2, Math.round(p.area_sqft / 70 / 5) * 5 || 2);
}
