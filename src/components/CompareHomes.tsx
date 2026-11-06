import { X } from "lucide-react";
import { formatPrice, pricePerSqft } from "@/lib/price";
import { httpPhotos } from "@/lib/photos";

type Row = { label: string; get: (p: any) => string | number | null | undefined; best?: "min" | "max" };

const ROWS: Row[] = [
  { label: "Price", get: (p) => formatPrice(p) },
  { label: "Deposit", get: (p) => (p.deposit ? `₹${Number(p.deposit).toLocaleString("en-IN")}` : "—") },
  { label: "Size", get: (p) => (p.property_type === "PG" ? `PG · ${p.occupancy || "Single"}` : p.bhk ? `${p.bhk} BHK` : p.commercial_type || p.property_type || "—") },
  { label: "Area", get: (p) => (p.area_sqft ? `${Number(p.area_sqft).toLocaleString("en-IN")} sq ft` : "—") },
  { label: "Price / sq ft", get: (p) => pricePerSqft(p) || (p.listing_type !== "sale" && p.rent && p.area_sqft ? `₹${(p.rent / p.area_sqft).toFixed(1)}/sq ft/mo` : "—") },
  { label: "Furnishing", get: (p) => p.furnishing || "—" },
  { label: "Available", get: (p) => (p.availability === "let_out" ? "Let out" : p.availability === "reserved" ? "Reserved" : p.availability_date && new Date(p.availability_date) > new Date() ? new Date(p.availability_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Now") },
  { label: "Prefers", get: (p) => (p.preferred_tenants?.length ? p.preferred_tenants.join(", ") : "Anyone") },
  { label: "Amenities", get: (p) => (p.amenities?.length ? p.amenities.join(", ") : "—") },
  { label: "Verified owner", get: (p) => (p.is_verified ? "✓ Yes" : "—") },
  { label: "Address", get: (p) => p.address || "—" },
];

/** Side-by-side table of 2–3 saved homes. Lowest rent and deposit are highlighted. */
export default function CompareHomes({ homes, onClose, onOpen }: { homes: any[]; onClose: () => void; onOpen?: (p: any) => void }) {
  const minOf = (k: string) => Math.min(...homes.map((h) => Number(h[k]) || Infinity));
  const cheapest = minOf("rent"), lowDeposit = minOf("deposit");
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-white" role="dialog" aria-modal="true" aria-label="Compare homes">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
        <h2 className="text-lg font-bold">Compare {homes.length} homes</h2>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><X className="h-6 w-6" /></button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 w-28 bg-gray-950 p-3" />
              {homes.map((h) => {
                const ph = httpPhotos(h.media_urls)[0];
                return (
                  <th key={h.id} className="p-3 text-left align-top font-normal">
                    {ph ? <img src={ph} alt="" className="h-28 w-full rounded-lg object-cover" /> : <div className="h-28 w-full rounded-lg bg-gray-800" />}
                    <p className="mt-2 font-semibold text-white">{h.title}</p>
                    {onOpen && <button onClick={() => onOpen(h)} className="mt-1 text-xs font-semibold text-orange-400 hover:text-orange-300">View listing →</button>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-gray-800">
                <td className="sticky left-0 bg-gray-950 p-3 text-xs uppercase tracking-wide text-gray-500">{r.label}</td>
                {homes.map((h) => {
                  const hi = (r.label === "Price" && h.listing_type !== "sale" && Number(h.rent) === cheapest && homes.length > 1)
                    || (r.label === "Deposit" && Number(h.deposit) === lowDeposit && homes.length > 1);
                  return <td key={h.id} className={`p-3 align-top ${hi ? "font-semibold text-green-400" : "text-gray-200"}`}>{r.get(h) ?? "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
