import { useRef, useState } from "react";

export default function PhotoGallery({
  urls,
  alt,
  heightClass = "h-48",
  roundedClass = "rounded-lg",
}: {
  urls: string[];
  alt: string;
  heightClass?: string;
  roundedClass?: string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);

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
            className="h-full w-full flex-shrink-0 snap-center object-cover"
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
    </div>
  );
}
