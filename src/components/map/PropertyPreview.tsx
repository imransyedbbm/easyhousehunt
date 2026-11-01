import { sizeLabel as sizeOf } from "@/lib/commercial";
import { availabilityLabel } from "@/lib/requirements";
import { useEffect } from "react";
import { Property } from "../../types/property";
import { addRecent } from "@/lib/recentlyViewed";
import { formatPrice } from "@/lib/price";
import PhotoGallery from "./PhotoGallery";
import SaveButton from "@/components/SaveButton";
import { httpPhotos } from "@/lib/photos";

export default function PropertyPreview({
  property,
  onClose,
  onViewDetails,
  bottom,
}: {
  property: Property;
  onClose: () => void;
  onViewDetails: () => void;
  bottom?: string;
}) {
  const photos = httpPhotos(property.media_urls);

  useEffect(() => { addRecent(property.id); }, [property.id]);

  const sizeLabel = sizeOf(property);

  return (
    <div
      className="absolute bottom-4 left-1/2 z-[25] w-[92%] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-gray-900 text-white shadow-2xl"
      style={bottom ? { bottom } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-sm text-white hover:bg-black/80"
      >
        ✕
      </button>

      {photos.length > 0 && (
        <PhotoGallery key={property.id} urls={photos} alt={property.title || "Listing"} heightClass="h-32" roundedClass="" />
      )}

      {property.is_sample && (
        <div className="bg-yellow-900/60 px-3 py-1.5 text-center text-[11px] font-semibold tracking-wide text-yellow-200">
          SAMPLE LISTING · for demonstration only, not a real home
        </div>
      )}

      {property.availability === "reserved" && (
        <div className="bg-yellow-500/15 px-3 py-1.5 text-center text-[11px] font-semibold tracking-wide text-yellow-200">
          RESERVED · the owner has agreed a deal with another tenant
        </div>
      )}

      <div className={`px-3 pt-3 ${photos.length === 0 ? "pr-9" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{property.title || "Untitled"}</h3>
            <p className="text-lg font-bold text-green-400">
              {formatPrice(property)}
            </p>
          </div>
          {!property.is_sample && <SaveButton propertyId={property.id} size="sm" className="flex-shrink-0" />}
        </div>
        <p className="truncate text-xs text-gray-300">
          {[property.property_type, sizeLabel, property.furnishing,
            property.listing_type !== "sale" ? availabilityLabel(property.availability_date) : null].filter(Boolean).join(" · ")}
        </p>
        {property.address && <p className="truncate text-xs text-gray-400">📍 {property.address}</p>}
      </div>

      {property.description && (
        <p className="line-clamp-2 px-3 pt-2 text-xs text-gray-400">{property.description}</p>
      )}

      <div className="px-3 pb-3 pt-2">
        <button
          onClick={onViewDetails}
          className="w-full rounded-lg bg-orange-500 py-2 text-sm font-semibold hover:bg-orange-600"
        >
          View details
        </button>
      </div>
    </div>
  );
}
