/** Shimmering placeholder cards shown while listings load. */
export default function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 px-4 pb-4" role="status" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-gray-900 ring-1 ring-white/5">
          <div className="h-36 w-full animate-pulse bg-gray-800" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-800" />
            <div className="flex gap-2 pt-1">
              <div className="h-5 w-14 animate-pulse rounded-full bg-gray-800" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-gray-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Shown when listings couldn't be fetched, with a retry. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-4 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
      <p className="font-semibold">Couldn't load listings</p>
      <p className="mt-1 text-xs text-red-300/80">Check your connection and try again.</p>
      <button onClick={onRetry}
        className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30">
        Retry
      </button>
    </div>
  );
}

/** Fallback for lazily loaded panels. */
export function PanelFallback() {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
    </div>
  );
}
