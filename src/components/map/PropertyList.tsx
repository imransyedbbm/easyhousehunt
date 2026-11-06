import { Property } from "../../types/property";
import { formatDistance, isNewListing } from "@/lib/geo";
import SaveButton from "@/components/SaveButton";
import { formatPrice, rentPerSqft } from "@/lib/price";
import { seatEstimate } from "@/lib/commercial";
import { availabilityLabel, openRequirement } from "@/lib/requirements";

type Props = {
  properties: Property[];
  onSelect: (p: Property) => void;
};

export default function PropertyList({ properties, onSelect }: Props) {
  if (!Array.isArray(properties)) {
    return <div className="text-white p-4">Failed to load properties</div>;
  }

  if (properties.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-400 space-y-3">
        <p>No homes match these filters yet.</p>
        <button onClick={openRequirement}
          className="w-full rounded-xl border border-dashed border-orange-500/60 bg-orange-500/10 px-4 py-3 text-left text-orange-200 hover:bg-orange-500/20">
          <span className="font-semibold">📝 Post your requirement</span>
          <span className="block text-xs text-gray-400 mt-0.5">Tell us what you need and we'll email you when a matching home is listed.</span>
        </button>
      </div>
    );
  }

  const hasSamples = properties.some((p) => p.is_sample);

  return (
    <div className="space-y-3 px-4 pb-4">
      {hasSamples && (
        <div className="rounded-lg border border-yellow-700/60 bg-yellow-900/30 px-3 py-2 text-xs text-yellow-200">
          Listings marked <b>SAMPLE</b> are for demonstration only. Real listings are shown first.
        </div>
      )}
      {properties.map((p) => (
        <div
          key={p.id}
          onClick={() => onSelect(p)}
          className={`relative p-4 rounded-lg cursor-pointer transition-colors ${
            p.is_sample
              ? "bg-gray-800/60 border border-dashed border-gray-600 hover:bg-gray-800"
              : "bg-gray-800 hover:bg-gray-700"
          }`}
        >
          {!p.is_sample && <SaveButton propertyId={p.id} size="sm" className="absolute right-2 top-2" />}
          {p.is_sample && (
            <span className="mb-1 inline-block rounded bg-yellow-900/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-yellow-200">
              SAMPLE · NOT A REAL LISTING
            </span>
          )}
          {p.availability === "reserved" && (
            <span className="mb-1 ml-1 inline-block rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-yellow-300">
              RESERVED · DEAL IN PROGRESS
            </span>
          )}
          {!p.is_sample && isNewListing(p.created_at) && (
            <span className="mb-1 mr-1 inline-block rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">NEW</span>
          )}
          <h3 className="text-white font-semibold text-sm pr-8">{p.title || "Untitled"}</h3>
          <p className="text-green-400 font-bold">{formatPrice(p)}{rentPerSqft(p) && <span className="ml-1.5 text-xs font-normal text-gray-400">{rentPerSqft(p)}</span>}</p>
          {p.property_type === "Commercial" ? (
            <p className="text-gray-300 text-xs">🏢 {p.commercial_type || "Commercial"}{p.area_sqft ? ` · ${p.area_sqft.toLocaleString("en-IN")} sq ft` : ""}{seatEstimate(p) ? ` · fits ~${seatEstimate(p)} seats` : ""}</p>
          ) : p.property_type === "PG" ? (
            <p className="text-gray-300 text-xs">PG · {p.occupancy || "Single"} Occupancy</p>
          ) : p.bhk ? (
            <p className="text-gray-300 text-xs">{p.bhk} BHK · {p.property_type || "Apartment"}</p>
          ) : null}
          <p className="text-gray-400 text-xs mt-1 truncate">{p.address}</p>
          {p.listing_type !== "sale" && p.availability_date && availabilityLabel(p.availability_date) !== "Available now" && (
            <p className="text-teal-300 text-xs mt-1">📅 {availabilityLabel(p.availability_date)}</p>
          )}
          {p.distance_label ? (
            <p className="text-blue-300 text-xs mt-1">🚗 {p.distance_label}</p>
          ) : p.distance_m != null && (
            <p className="text-blue-300 text-xs mt-1">📍 {formatDistance(p.distance_m)} away</p>
          )}
          {p.is_verified && (
            <span className="text-xs text-blue-400 mt-1 inline-block">✓ Verified owner</span>
          )}
        </div>
      ))}
    </div>
  );
}
