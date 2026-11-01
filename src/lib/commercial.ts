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
