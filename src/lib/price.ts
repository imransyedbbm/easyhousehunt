type Priced = {
  listing_type?: string | null;
  rent?: number | null;
  sale_price?: number | null;
  area_sqft?: number | null;
};

const trim = (x: number) => String(Math.round(x * 100) / 100);

export const isSale = (p: Pick<Priced, "listing_type">) => p.listing_type === "sale";

// 8500000 -> "₹85 L", 12000000 -> "₹1.2 Cr"
export function formatSalePrice(n: number | null | undefined): string {
  if (!n || n <= 0) return "Price on request";
  if (n >= 10_000_000) return `₹${trim(n / 10_000_000)} Cr`;
  if (n >= 100_000) return `₹${trim(n / 100_000)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

// "₹35,000/mo" for rent, "₹1.25 Cr" for sale
export function formatPrice(p: Priced): string {
  if (isSale(p)) return formatSalePrice(p.sale_price);
  return p.rent ? `₹${p.rent.toLocaleString("en-IN")}/mo` : "Price on request";
}

// Short label for map pins: "₹35k", "₹85L", "₹1.2Cr"
export function pinLabel(p: Priced): string {
  if (isSale(p)) {
    const n = p.sale_price ?? 0;
    if (n >= 10_000_000) return `₹${trim(n / 10_000_000)}Cr`;
    if (n >= 100_000) return `₹${trim(n / 100_000)}L`;
    return n ? `₹${n.toLocaleString("en-IN")}` : "₹";
  }
  return p.rent ? `₹${Math.round(p.rent / 1000)}k` : "₹";
}

export function pricePerSqft(p: Priced): string | null {
  if (!isSale(p) || !p.sale_price || !p.area_sqft) return null;
  return `₹${Math.round(p.sale_price / p.area_sqft).toLocaleString("en-IN")}/sq ft`;
}

/** Monthly rent per sq ft, shown for commercial rentals: "₹85/sq ft/mo". */
export function rentPerSqft(p: Priced & { property_type?: string | null }): string | null {
  if (isSale(p) || p.property_type !== "Commercial" || !p.rent || !p.area_sqft) return null;
  const v = p.rent / p.area_sqft;
  return `₹${v >= 10 ? Math.round(v) : v.toFixed(1)}/sq ft/mo`;
}
