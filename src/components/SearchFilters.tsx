import { COMMERCIAL_TYPES, furnishingOptions } from "@/lib/commercial";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildIndex, getSuggestions, type Suggestion } from "@/lib/searchIndex";
import { useSearchableProperties, useSearchNote } from "@/lib/searchStore";
import RecentlyViewed from "@/components/RecentlyViewed";
import { SALE_ENABLED } from "@/lib/features";

export interface Filters {
  bhk: number[];
  minRent: number;
  maxRent: number;
  furnishing: string[];
  search: string;
  propertyType: string;
  commercialType?: string[];
  occupancy: string[];
  area?: { name: string; lat: number; lng: number } | null;
  mode?: "rent" | "sale";
}

// A very large number means "no maximum rent"
export const NO_MAX_RENT = 99999999;

const SALE_BANDS = [
  { label: "Any price", min: 0, max: NO_MAX_RENT },
  { label: "Under ₹50 L", min: 0, max: 5_000_000 },
  { label: "₹50 L – ₹1 Cr", min: 5_000_000, max: 10_000_000 },
  { label: "₹1 – 2 Cr", min: 10_000_000, max: 20_000_000 },
  { label: "₹2 – 3 Cr", min: 20_000_000, max: 30_000_000 },
  { label: "₹3 Cr+", min: 30_000_000, max: NO_MAX_RENT },
];

const DEFAULT_FILTERS: Filters = {
  bhk: [],
  minRent: 0,
  maxRent: NO_MAX_RENT,
  furnishing: [],
  search: "",
  propertyType: "All",
  occupancy: [],
  area: null,
  mode: "rent",
};

export default function SearchFilters({
  onChange,
}: {
  onChange: (f: Filters) => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState(false);

  // Suggestions: apartment names from live listings + a bundled list of Bengaluru areas
  const allProperties = useSearchableProperties();
  const searchNote = useSearchNote();
  const modeNow = filters.mode ?? "rent";
  const isSaleMode = SALE_ENABLED && modeNow === "sale";
  const index = useMemo(
    () => buildIndex(allProperties.filter((p) => (p.listing_type ?? "rent") === modeNow)),
    [allProperties, modeNow]
  );
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => (open ? getSuggestions(index, filters.search) : []),
    [open, index, filters.search]
  );

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (s: Suggestion) => {
    setOpen(false);
    setHighlight(-1);
    if (s.kind === "area" && s.lat != null && s.lng != null) {
      update({ search: "", area: { name: s.label, lat: s.lat, lng: s.lng } });
    } else {
      update({ search: s.label, area: null });
    }
  };

  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange(next);
  };

  const toggleBhk = (n: number) => {
    const next = filters.bhk.includes(n)
      ? filters.bhk.filter((x) => x !== n)
      : [...filters.bhk, n];
    update({ bhk: next });
  };

  const toggleFurnishing = (f: string) => {
    const next = filters.furnishing.includes(f)
      ? filters.furnishing.filter((x) => x !== f)
      : [...filters.furnishing, f];
    update({ furnishing: next });
  };

  const toggleOccupancy = (o: string) => {
    const next = filters.occupancy.includes(o)
      ? filters.occupancy.filter((x) => x !== o)
      : [...filters.occupancy, o];
    update({ occupancy: next });
  };
  const setMode = (m: "rent" | "sale") => {
    update({
      mode: m,
      minRent: 0,
      maxRent: NO_MAX_RENT,
      occupancy: [],
      propertyType: m === "sale" && filters.propertyType === "PG" ? "All" : filters.propertyType,
    });
  };

  // If From is higher than To, swap them when the person leaves the box
  const fixRentOrder = () => {
    if (filters.maxRent < NO_MAX_RENT && filters.minRent > filters.maxRent) {
      update({ minRent: filters.maxRent, maxRent: filters.minRent });
    }
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    onChange(DEFAULT_FILTERS);
  };

  const activeCount = [
    filters.bhk.length > 0,
    filters.furnishing.length > 0,
    filters.minRent > 0 || filters.maxRent < NO_MAX_RENT,
    filters.propertyType !== "All",
    (filters.commercialType?.length ?? 0) > 0,
    filters.occupancy.length > 0,
  ].filter(Boolean).length;

  const isCommercialView = filters.propertyType === "Commercial";
  type Segment = "All" | "Homes" | "Commercial";
  const segment: Segment = filters.propertyType === "All" ? "All" : isCommercialView ? "Commercial" : "Homes";
  const setSegment = (s: Segment) => {
    if (s === segment) return;
    update({ propertyType: s, commercialType: [], bhk: [], furnishing: [], occupancy: [] });
  };

  return (
    <div className="px-4 pb-2">
      {/* All / Homes / Commercial: always visible. Default "All" shows both on the map. */}
      <div className="mb-2 flex rounded-lg bg-gray-800 p-1 text-sm font-semibold">
        {(["All", "Homes", "Commercial"] as const).map((s) => (
          <button key={s} onClick={() => setSegment(s)}
            className={`flex-1 rounded-md py-1.5 ${segment === s ? "bg-orange-500 text-white" : "text-gray-300 hover:text-white"}`}>
            {s === "All" ? "All" : s === "Homes" ? "🏠 Homes" : "🏢 Commercial"}
          </button>
        ))}
      </div>
      {/* Rent / Buy */}
      {SALE_ENABLED && (
        <div className="mb-2">
          <div className="flex rounded-lg bg-gray-800 p-1 text-sm font-semibold">
            {(["rent", "sale"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 ${modeNow === m ? "bg-orange-500 text-white" : "text-gray-300 hover:text-white"}`}
              >
                {m === "rent" ? "Rent" : "Buy"}
              </button>
            ))}
          </div>
          {isSaleMode && (
            <p className="mt-1 text-xs text-gray-400">
              Homes for sale are new here. Own one you would like to sell? Tap &quot;+ List Your Property&quot; and choose Sell.
            </p>
          )}
        </div>
      )}

      {/* Search bar */}
      <div ref={boxRef} className="mb-2">
        <div className="relative">
          <input
            className="w-full bg-gray-800 border-2 border-gray-500 hover:border-gray-400 rounded-xl pl-10 pr-3 py-3 text-base text-white placeholder-gray-300 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/40 shadow-inner"
            placeholder="Search area or apartment name…"
            aria-label="Search by area or apartment name"
            value={filters.search}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              update({ search: e.target.value, area: null });
              setOpen(true);
              setHighlight(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, -1));
              } else if (e.key === "Enter") {
                if (highlight >= 0 && suggestions[highlight]) {
                  e.preventDefault();
                  pick(suggestions[highlight]);
                } else {
                  setOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">🔍</span>
        </div>

        {open && suggestions.length > 0 && (
          <div
            role="listbox"
            className="mt-1 max-h-56 overflow-y-auto rounded-lg bg-gray-800 shadow-lg ring-1 ring-white/10"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {suggestions.map((s, i) => (
              <button
                key={s.key}
                role="option"
                aria-selected={i === highlight}
                onClick={() => pick(s)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-gray-700" : "hover:bg-gray-700"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-white">
                    {s.kind === "area" ? "📍 " : "🏢 "}
                    {s.label}
                  </span>
                  <span className="block text-xs text-gray-400">{s.kind === "area" ? "Area" : "Apartment"}</span>
                </span>
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {s.kind === "area"
                    ? s.count > 0
                      ? `${s.count} within 2.5 km`
                      : "none nearby yet"
                    : `${s.count} listing${s.count === 1 ? "" : "s"}`}
                </span>
              </button>
            ))}
          </div>
        )}

        {filters.area && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-xs text-white">
            <span>
              📍 Listings near <b>{filters.area.name}</b>
            </span>
            <button
              onClick={() => update({ area: null })}
              aria-label="Clear area"
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        {filters.area && searchNote && <p className="mt-1 text-xs text-yellow-300">{searchNote}</p>}
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
        >
          <span>⚙️ Filters</span>
          {activeCount > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
          <span>{expanded ? "▲" : "▼"}</span>
        </button>
        <RecentlyViewed />
        {activeCount > 0 && (
          <button onClick={reset} className="text-xs text-gray-500 hover:text-orange-400">
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="mt-3 space-y-4 bg-gray-900 rounded-xl p-3">

          {/* Property Type (homes only; commercial uses the switch above) */}
          {segment === "Homes" && <div>
            <p className="text-xs text-gray-400 mb-2">Property Type</p>
            <div className="flex gap-2">
              {["Homes", "Apartment", "PG", "Independent House"].filter((t) => !(isSaleMode && t === "PG")).map((t) => (
                <button
                  key={t}
                  onClick={() => update({ propertyType: t, commercialType: [], ...(t === "Commercial" || filters.propertyType === "Commercial" ? { bhk: [], furnishing: [] } : {}) })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                    filters.propertyType === t
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-300"
                  }`}
                >
                  {t === "Independent House" ? "House" : t === "Homes" ? "All homes" : t}
                </button>
              ))}
            </div>
          </div>}

          {/* Commercial: kind of space */}
          {filters.propertyType === "Commercial" && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Space type</p>
              <div className="flex gap-2 flex-wrap">
                {COMMERCIAL_TYPES.map((c) => {
                  const on = (filters.commercialType ?? []).includes(c);
                  return (
                    <button key={c}
                      onClick={() => update({ commercialType: on ? (filters.commercialType ?? []).filter((x) => x !== c) : [...(filters.commercialType ?? []), c] })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${on ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* BHK - hide for PG and commercial */}
          {filters.propertyType !== "PG" && filters.propertyType !== "Commercial" && (
          <div>
            <p className="text-xs text-gray-400 mb-2">BHK</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => toggleBhk(n)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                    filters.bhk.includes(n)
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-300"
                  }`}
                >
                  {n} BHK
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Occupancy - PG only */}
          {filters.propertyType === "PG" && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Occupancy</p>
            <div className="flex gap-2">
              {["Single", "Double", "Triple"].map((o) => (
                <button key={o} onClick={() => toggleOccupancy(o)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                    filters.occupancy.includes(o)
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-300"
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          )}
          {/* Price range */}
          {isSaleMode ? (
            <div>
              <p className="text-xs text-gray-400 mb-2">Price</p>
              <select
                value={`${filters.minRent}-${filters.maxRent}`}
                onChange={(e) => {
                  const [min, max] = e.target.value.split("-").map(Number);
                  update({ minRent: min, maxRent: max });
                }}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {SALE_BANDS.map((b) => (
                  <option key={b.label} value={`${b.min}-${b.max}`}>{b.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-2">Rent range (₹ per month)</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="From"
                  aria-label="Minimum rent"
                  value={filters.minRent > 0 ? filters.minRent.toLocaleString("en-IN") : ""}
                  onChange={(e) => update({ minRent: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  onBlur={fixRentOrder}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-xs text-gray-500">to</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="To"
                  aria-label="Maximum rent"
                  value={filters.maxRent < NO_MAX_RENT ? filters.maxRent.toLocaleString("en-IN") : ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    update({ maxRent: n > 0 ? n : NO_MAX_RENT });
                  }}
                  onBlur={fixRentOrder}
                  className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              {filters.maxRent < NO_MAX_RENT && filters.minRent > filters.maxRent && (
                <p className="mt-1 text-xs text-yellow-300">"From" is higher than "To".</p>
              )}
            </div>
          )}

          {/* Furnishing */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Furnishing</p>
            <div className="flex gap-2">
              {furnishingOptions(filters.propertyType).map((f) => (
                <button
                  key={f}
                  onClick={() => toggleFurnishing(f)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                    filters.furnishing.includes(f)
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-300"
                  }`}
                >
                  {f === "Fully Furnished" ? "Full" : f}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
