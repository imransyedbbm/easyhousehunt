import { sizeLabel } from "@/lib/commercial";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Property } from "@/types/property";
import { clearRecent, useRecentIds } from "@/lib/recentlyViewed";
import { selectProperty, useSearchableProperties } from "@/lib/searchStore";
import { httpPhotos } from "@/lib/photos";
import { formatPrice } from "@/lib/price";

export default function RecentlyViewed() {
  const ids = useRecentIds();
  const all = useSearchableProperties();
  const [open, setOpen] = useState(false);

  // Only listings that are still live are shown
  const items = useMemo(() => {
    const byId = new Map(all.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Property => !!p);
  }, [ids, all]);

  if (items.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-white">
        🕘 Recent ({items.length})
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center"
            onClick={() => setOpen(false)}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div
              className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-gray-900 p-4 text-white shadow-2xl sm:w-[420px] sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Recently viewed</h2>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => { clearRecent(); setOpen(false); }}
                    className="text-xs text-gray-400 hover:text-orange-400"
                  >
                    Clear
                  </button>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-white">
                    ✕
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {items.map((p) => {
                  const photo = httpPhotos(p.media_urls)[0];
                  const size =
                    sizeLabel(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setOpen(false); selectProperty(p); }}
                      className="flex w-full items-center gap-3 rounded-xl bg-gray-800 p-2 text-left hover:bg-gray-700"
                    >
                      {photo ? (
                        <img src={photo} alt="" loading="lazy" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-gray-700 text-[10px] text-gray-500">
                          No photo
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.title || "Untitled"}</p>
                        <p className="text-sm font-bold text-green-400">{formatPrice(p)}</p>
                        <p className="truncate text-xs text-gray-400">
                          {[p.property_type, size].filter(Boolean).join(" · ")}
                          {p.address ? ` · ${p.address}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Saved on this device only. Listings that are no longer available disappear from this list.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
