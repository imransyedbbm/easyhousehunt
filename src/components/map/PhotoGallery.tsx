import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Expand } from "lucide-react";

export default function PhotoGallery({
  urls,
  alt,
  heightClass = "h-48",
  roundedClass = "rounded-lg",
  zoomable = true,
  contain = false,
  startAt = 0,
}: {
  urls: string[];
  alt: string;
  heightClass?: string;
  roundedClass?: string;
  /** Tap a photo to open the full-screen viewer. */
  zoomable?: boolean;
  /** Fit whole photo (viewer) instead of cropping (card). */
  contain?: boolean;
  startAt?: number;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(startAt);
  const [full, setFull] = useState<number | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el && startAt) el.scrollTo({ left: startAt * el.clientWidth });
  }, [startAt]);

  useEffect(() => {
    if (full === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setFull(null); } };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, [full]);

  if (urls.length === 0) {
    return (
      <div
        className={`flex w-full items-center justify-center bg-gray-800 text-sm text-gray-500 ${heightClass} ${roundedClass}`}
      >
        📷 Photos on request · ask the owner in chat
      </div>
    );
  }

  const goTo = (n: number) => {
    const el = scroller.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(urls.length - 1, n));
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  const arrow =
    "absolute top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg text-white hover:bg-black/80";

  return (
    <div className={`relative w-full overflow-hidden bg-gray-800 ${heightClass} ${roundedClass}`}>
      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") goTo(current - 1);
          if (e.key === "ArrowRight") goTo(current + 1);
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto outline-none [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {urls.map((u, n) => (
          <img
            key={`${n}-${u}`}
            src={u}
            alt={`${alt} - photo ${n + 1} of ${urls.length}`}
            loading={n === 0 ? "eager" : "lazy"}
            draggable={false}
            onClick={zoomable ? () => setFull(n) : undefined}
            className={`h-full w-full flex-shrink-0 snap-center ${contain ? "object-contain" : "object-cover"} ${zoomable ? "cursor-zoom-in" : ""}`}
          />
        ))}
      </div>

      {urls.length > 1 && (
        <>
          {current > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); goTo(current - 1); }}
              className={`${arrow} left-2`}
            >
              ‹
            </button>
          )}
          {current < urls.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); goTo(current + 1); }}
              className={`${arrow} right-2`}
            >
              ›
            </button>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {current + 1}/{urls.length}
          </span>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {urls.map((u, n) => (
              <span
                key={`${n}-${u}`}
                className={`h-1.5 w-1.5 rounded-full ${n === current ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
      {zoomable && (
        <button
          type="button"
          aria-label="View photos full screen"
          onClick={(e) => { e.stopPropagation(); setFull(current); }}
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
        >
          <Expand className="h-4 w-4" />
        </button>
      )}

      {full !== null && createPortal(
        <div className="fixed inset-0 z-[90] bg-black" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={(e) => e.stopPropagation()}>
          <PhotoGallery urls={urls} alt={alt} heightClass="h-full" roundedClass="" zoomable={false} contain startAt={full} />
          <button
            type="button"
            aria-label="Close photo viewer"
            onClick={() => setFull(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
