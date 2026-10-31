import type { Property } from "@/types/property";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/** "2bhk-karle-vario-homes" — readable part of the link (never used for lookup). */
export function listingSlug(p: Pick<Property, "title" | "bhk" | "property_type">) {
  const size = p.property_type === "PG" ? "pg" : p.bhk ? `${p.bhk}bhk` : "";
  return [size, p.title || "home"].join(" ")
    .toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

/** Public link: easyhousehunt.com/l/<slug>-<share code>. Falls back to the id if no code yet. */
export const listingUrl = (p: Pick<Property, "id" | "title" | "bhk" | "property_type" | "share_code">) =>
  `https://easyhousehunt.com/l/${p.share_code ? `${listingSlug(p)}-${p.share_code}` : p.id}`;

/** The lookup key from a link segment: a 6-char share code (last part after "-") or a legacy UUID. */
export function linkKey(segment: string): { code?: string; id?: string } | null {
  const s = decodeURIComponent(segment || "").trim();
  if (isUuid(s)) return { id: s };
  const code = s.split("-").pop() || "";
  return /^[a-z2-9]{6}$/.test(code) ? { code } : null;
}

export function shareText(p: Property) {
  const size = p.property_type === "PG" ? "PG" : p.bhk ? `${p.bhk} BHK` : p.property_type || "Home";
  const price = p.listing_type === "sale" && p.sale_price
    ? `₹${p.sale_price.toLocaleString("en-IN")}`
    : p.rent ? `₹${p.rent.toLocaleString("en-IN")}/month` : "";
  return `${size} · ${p.title}${price ? ` · ${price}` : ""}`;
}

/** Native share sheet on phones; otherwise copies the link. */
export async function shareListing(p: Property): Promise<"shared" | "copied" | "failed"> {
  const url = listingUrl(p);
  const text = shareText(p);
  try {
    if (navigator.share) { await navigator.share({ title: text, text, url }); return "shared"; }
  } catch (e: any) {
    if (e?.name === "AbortError") return "shared";
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}

export const whatsappShareUrl = (p: Property) =>
  `https://wa.me/?text=${encodeURIComponent(`${shareText(p)}\n${listingUrl(p)}`)}`;
