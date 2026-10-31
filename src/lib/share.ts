import type { Property } from "@/types/property";

export const listingUrl = (id: string) => `https://easyhousehunt.com/l/${id}`;

export function shareText(p: Property) {
  const size = p.property_type === "PG" ? "PG" : p.bhk ? `${p.bhk} BHK` : p.property_type || "Home";
  const price = p.listing_type === "sale" && p.sale_price
    ? `₹${p.sale_price.toLocaleString("en-IN")}`
    : p.rent ? `₹${p.rent.toLocaleString("en-IN")}/month` : "";
  return `${size} · ${p.title}${price ? ` · ${price}` : ""}`;
}

/** Native share sheet on phones; otherwise copies the link. Returns what happened. */
export async function shareListing(p: Property): Promise<"shared" | "copied" | "failed"> {
  const url = listingUrl(p.id);
  const text = shareText(p);
  try {
    if (navigator.share) { await navigator.share({ title: text, text, url }); return "shared"; }
  } catch (e: any) {
    if (e?.name === "AbortError") return "shared";
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}

export const whatsappShareUrl = (p: Property) =>
  `https://wa.me/?text=${encodeURIComponent(`${shareText(p)}\n${listingUrl(p.id)}`)}`;
