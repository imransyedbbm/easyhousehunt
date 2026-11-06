import { LOCALITIES } from "@/data/localities";
import { COMMERCIAL_TYPES, COMMERCIAL_FURNISHING, RESIDENTIAL_FURNISHING } from "@/lib/commercial";
import { parseCsv, toCsv } from "@/lib/csv";

export const COLUMNS = [
  "title", "address", "latitude", "longitude", "listing_type", "property_type", "commercial_type", "bhk",
  "rent", "sale_price", "deposit", "area_sqft", "furnishing", "description", "amenities", "photo_urls",
  "available_from", "owner_name", "owner_phone", "status",
] as const;

export const TEMPLATE = toCsv([
  [...COLUMNS],
  ["Bright 2BHK near Sony Signal", "80 Feet Rd, 4th Block, Koramangala, Bengaluru", "12.9345", "77.6266", "rent", "Apartment", "", "2",
    "38000", "", "150000", "1150", "Semi", "East-facing 2BHK on the 6th floor, lift and covered parking.", "Lift;Power backup;Covered parking",
    "https://example.com/photo1.jpg;https://example.com/photo2.jpg", "2026-12-01", "Ravi Kumar", "9845012345", "approved"],
  ["Plug & play office, 40 seats", "Embassy TechVillage, Bellandur, Bengaluru", "", "", "rent", "Commercial", "Office space", "",
    "240000", "", "1440000", "2800", "Plug & play", "Ready office with 2 cabins, conference room and pantry.", "Power backup;Lift;Parking",
    "", "", "Novaspaces", "9900012345", "pending"],
]);

export type ParsedRow = { line: number; data: Record<string, unknown> | null; owner: { name: string | null; phone: string } | null; errors: string[]; warnings: string[]; preview: string };

const num = (v: string) => { const n = Number(String(v).replace(/[₹,\s]/g, "")); return Number.isFinite(n) && v.trim() !== "" ? n : null; };
const list = (v: string) => v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
const ci = (v: string, opts: readonly string[]) => opts.find((o) => o.toLowerCase() === v.trim().toLowerCase()) ?? null;
const PTYPES = ["Apartment", "Independent House", "Villa", "PG", "Commercial"];

/** Validate a CSV file into insert-ready rows. Admin-only use; landlordId is the admin listing on behalf. */
export function parseListings(text: string, landlordId: string): { rows: ParsedRow[]; headerError: string | null } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], headerError: "The file is empty." };
  const header = all[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = ["title", "address", "property_type"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], headerError: `Missing column(s): ${missing.join(", ")}. Download the template to see the format.` };

  const rows = all.slice(1, 501).map((cells, i): ParsedRow => {
    const g = (k: string) => (cells[header.indexOf(k)] ?? "").trim();
    const errors: string[] = [], warnings: string[] = [];
    const title = g("title"), address = g("address");
    if (!title) errors.push("title is empty");
    if (!address) errors.push("address is empty");

    const ptype = ci(g("property_type"), PTYPES);
    if (!ptype) errors.push(`property_type must be one of ${PTYPES.join(", ")}`);
    const commercial = ptype === "Commercial";
    const ctype = commercial ? ci(g("commercial_type"), COMMERCIAL_TYPES) : null;
    if (commercial && !ctype) errors.push(`commercial_type must be one of ${COMMERCIAL_TYPES.join(", ")}`);

    const sale = g("listing_type").toLowerCase() === "sale";
    const rent = num(g("rent")), salePrice = num(g("sale_price"));
    if (!sale && !(rent && rent > 0)) errors.push("rent is missing");
    if (sale && !(salePrice && salePrice > 0)) errors.push("sale_price is missing");
    const bhk = num(g("bhk"));
    if (!commercial && ptype !== "PG" && !(bhk && bhk >= 1 && bhk <= 10)) errors.push("bhk must be 1–10");

    let lat = num(g("latitude")), lng = num(g("longitude"));
    if (lat == null || lng == null) {
      const hay = address.toLowerCase();
      const loc = [...LOCALITIES].sort((a, b) => b.name.length - a.name.length)
        .find((l) => hay.includes(l.name.toLowerCase()) || l.aliases?.some((a) => hay.includes(a.toLowerCase())));
      if (loc) { lat = loc.lat; lng = loc.lng; warnings.push(`no coordinates: pinned at the centre of ${loc.name}; adjust the pin later`); }
      else errors.push("latitude/longitude missing and no known area found in the address");
    } else if (lat < 12.6 || lat > 13.4 || lng < 77.3 || lng > 77.9) errors.push("coordinates are outside Bengaluru");

    const furn = g("furnishing") ? ci(g("furnishing"), commercial ? COMMERCIAL_FURNISHING : RESIDENTIAL_FURNISHING) : null;
    if (g("furnishing") && !furn) warnings.push(`furnishing "${g("furnishing")}" not recognised; left blank`);
    const photos = list(g("photo_urls")).filter((u) => /^https:\/\//i.test(u));
    if (list(g("photo_urls")).length !== photos.length) warnings.push("some photo URLs were not https and were skipped");
    if (!photos.length) warnings.push("no photos");
    const avail = /^\d{4}-\d{2}-\d{2}$/.test(g("available_from")) ? g("available_from") : null;
    const phone = g("owner_phone").replace(/[^\d+]/g, "");
    if (g("owner_phone") && phone.replace(/\D/g, "").length < 10) warnings.push("owner_phone looks too short; not saved");
    const status = g("status").toLowerCase() === "approved" ? "approved" : "pending";

    const data = errors.length ? null : {
      title, address, listing_type: sale ? "sale" : "rent",
      rent: sale ? 0 : rent, sale_price: sale ? salePrice : null, deposit: sale ? null : num(g("deposit")),
      bhk: commercial || ptype === "PG" ? null : bhk, area_sqft: num(g("area_sqft")), furnishing: furn,
      description: g("description").slice(0, 3000) || null, amenities: list(g("amenities")), media_urls: photos,
      latitude: lat, longitude: lng, landlord_id: landlordId, property_type: ptype, market: "india",
      ...(commercial ? { commercial_type: ctype } : {}),
      ...(!sale ? { availability_date: avail } : {}), status,
    };
    return {
      line: i + 2, data, errors, warnings,
      owner: phone.replace(/\D/g, "").length >= 10 ? { name: g("owner_name") || null, phone } : null,
      preview: `${title || "(no title)"} · ${sale ? (salePrice ? `₹${salePrice.toLocaleString("en-IN")}` : "?") : rent ? `₹${rent.toLocaleString("en-IN")}/mo` : "?"} · ${ptype ?? "?"}`,
    };
  });
  return { rows, headerError: null };
}
