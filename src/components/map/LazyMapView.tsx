import { lazy, Suspense, type ComponentProps } from "react";
import type MapViewType from "./MapView";

// The map library is ~1 MB; load it after the list and search have painted.
const MapView = lazy(() => import("./MapView"));

function MapPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f19]" aria-label="Loading map" role="status">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        Loading map…
      </div>
    </div>
  );
}

export default function LazyMapView(props: ComponentProps<typeof MapViewType>) {
  return (
    <Suspense fallback={<MapPlaceholder />}>
      <MapView {...props} />
    </Suspense>
  );
}
