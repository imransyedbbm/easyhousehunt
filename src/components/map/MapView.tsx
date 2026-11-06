import { useT } from "@/lib/i18n";
import { LocateFixed } from "lucide-react";
import { sizeLabel } from "@/lib/commercial";
import { useEffect, useRef, useState } from "react";
import maplibregl, { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Property } from "../../types/property";
import PropertyPreview from "./PropertyPreview";
import { useUserLocation } from "@/hooks/useUserLocation";
import { formatPrice, pinLabel } from "@/lib/price";

// Pin colours: homes cyan, commercial violet (orange = selected, grey = sample)
const PIN_HOME = "#22d3ee";
const PIN_COMMERCIAL = "#8b5cf6";
import { NEAR_RADIUS_M, distanceMeters, formatDistance } from "@/lib/geo";

function buildHoverContent(p: Property): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.minWidth = "180px";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.fontSize = "13px";
  title.textContent = p.title || "Untitled";

  const rent = document.createElement("div");
  rent.style.color = "#4ade80";
  rent.style.fontWeight = "700";
  rent.style.fontSize = "15px";
  rent.textContent = formatPrice(p);

  const meta = document.createElement("div");
  meta.style.fontSize = "12px";
  meta.style.color = "#d1d5db";
  const size =
    sizeLabel(p) ?? "";
  meta.textContent = [p.property_type, size, p.furnishing].filter(Boolean).join(" · ");

  if (p.is_sample) {
    const tag = document.createElement("div");
    tag.style.fontSize = "10px";
    tag.style.fontWeight = "700";
    tag.style.letterSpacing = "0.04em";
    tag.style.color = "#fde047";
    tag.textContent = "SAMPLE · NOT A REAL LISTING";
    wrap.append(tag);
  }
  wrap.append(title, rent, meta);

  if (p.address) {
    const addr = document.createElement("div");
    addr.style.fontSize = "11px";
    addr.style.color = "#9ca3af";
    addr.style.maxWidth = "220px";
    addr.style.overflow = "hidden";
    addr.style.textOverflow = "ellipsis";
    addr.style.whiteSpace = "nowrap";
    addr.textContent = "📍 " + p.address;
    wrap.append(addr);
  }
  return wrap;
}

function makeUserDot(): HTMLElement {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = "#3b82f6";
  el.style.border = "3px solid #ffffff";
  el.style.boxShadow = "0 0 0 6px rgba(59,130,246,0.25)";
  el.style.pointerEvents = "none";
  return el;
}

export default function MapView({
  properties,
  selectedProperty,
  onMarkerClick,
  onViewDetails,
  previewBottom,
  searchQuery,
}: {
  properties: Property[];
  selectedProperty: Property | null;
  onMarkerClick?: (p: Property) => void;
  onViewDetails?: (p: Property) => void;
  previewBottom?: string;
  searchQuery?: string;
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const autoLocatedRef = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const canHover = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

  const { location, locate, clear } = useUserLocation();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [preview, setPreview] = useState<Property | null>(null);
  const [nearMsg, setNearMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const t = useT();

  const flash = (msg: string, ms = 0) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    setNearMsg(msg);
    if (ms > 0) flashTimer.current = window.setTimeout(() => setNearMsg(null), ms);
  };

  const handleNearMe = async (silent = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (!silent) {
      setLocating(true);
      flash("Finding your location…");
    }
    const result = await locate();
    setLocating(false);

    if (result.ok === false) {
      if (silent) { setNearMsg(null); return; }
      flash(
        result.reason === "denied"
          ? "Location is blocked for this site. Allow it in your browser settings, or search an area instead."
          : result.reason === "outside"
          ? "You seem to be outside Bengaluru. Search an area to explore listings."
          : "Couldn't get your location. Please try again, or search an area.",
        7000
      );
      return;
    }

    const loc = result.location;
    const ranked = properties
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ p, d: distanceMeters(loc, { lat: p.latitude!, lng: p.longitude! }) }))
      .sort((a, b) => a.d - b.d);
    const near = ranked.filter((r) => r.d <= NEAR_RADIUS_M);

    if (near.length > 0) {
      map.flyTo({ center: [loc.lng, loc.lat], zoom: 15, speed: 1.2 });
      {
        const realNear = near.filter((r) => !r.p.is_sample).length;
        flash(
          realNear > 0
            ? `${realNear} listing${realNear === 1 ? "" : "s"} within 2 km. Closest first in the list.`
            : "No real listings within 2 km yet. Showing sample listings for demonstration."
        );
      }
    } else if (ranked.length > 0) {
      const b = new maplibregl.LngLatBounds([loc.lng, loc.lat], [loc.lng, loc.lat]);
      ranked.slice(0, 5).forEach((r) => b.extend([r.p.longitude!, r.p.latitude!]));
      map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 });
      flash(`Nothing within 2 km. The closest listing is ${formatDistance(ranked[0].d)} away.`);
    } else {
      map.flyTo({ center: [loc.lng, loc.lat], zoom: 14 });
      flash("No listings match your filters yet.");
    }
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [77.5946, 12.9716],
      zoom: 11,
    });
    mapRef.current = map;
    map.on("load", () => setMapLoaded(true));
    map.on("click", () => setPreview(null)); // tap empty map closes the card
    return () => { map.remove(); mapRef.current = null; setMapLoaded(false); };
  }, []);

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  // Hide the card if its property is filtered out of the list
  useEffect(() => {
    if (preview && !properties.some((p) => p.id === preview.id)) setPreview(null);
  }, [properties, preview]);

  // Price pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    hoverPopupRef.current?.remove();
    markersRef.current = [];
    properties.forEach((p) => {
      if (!p.latitude || !p.longitude) return;
      const isSelected = selectedProperty?.id === p.id;
      const el = document.createElement("div");
      el.style.padding = "4px 8px";
      el.style.borderRadius = "999px";
      el.style.fontSize = "11px";
      el.style.fontWeight = "700";
      el.style.cursor = "pointer";
      const sample = !!p.is_sample;
      const commercial = p.property_type === "Commercial";
      el.style.background = isSelected ? "#f97316" : sample ? "#9ca3af" : commercial ? PIN_COMMERCIAL : PIN_HOME;
      if (sample && !isSelected) {
        el.style.border = "1px dashed #374151";
        el.style.opacity = "0.85";
      }
      el.style.color = isSelected || (commercial && !sample) ? "#fff" : "#000";
      if (commercial) el.title = sizeLabel(p) || "Commercial";
      el.style.boxShadow = isSelected ? "0 0 12px rgba(249,115,22,0.8)" : "none";
      el.style.zIndex = isSelected ? "10" : "1";
      el.innerText = pinLabel(p);
      el.addEventListener("mouseenter", () => {
        if (!canHover) return;
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 22,
          maxWidth: "260px",
          className: "hover-popup",
        })
          .setLngLat([p.longitude!, p.latitude!])
          .setDOMContent(buildHoverContent(p))
          .addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
      });
      el.addEventListener("click", (e) => {
        hoverPopupRef.current?.remove();
        e.stopPropagation(); // don't let the map's click handler close the card
        map.flyTo({ center: [p.longitude!, p.latitude!], zoom: Math.max(map.getZoom(), 13), speed: 1.2, offset: [0, -150] });
        onMarkerClick?.(p);
        if (onViewDetails) setPreview(p);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.longitude, p.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [properties, selectedProperty, mapLoaded]);

  // Fly to a listing picked from the sidebar
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedProperty?.latitude || !selectedProperty?.longitude) return;
    map.flyTo({
      center: [selectedProperty.longitude, selectedProperty.latitude],
      zoom: Math.max(map.getZoom(), 13),
      speed: 1.2,
      offset: [0, -150],
    });
  }, [selectedProperty, mapLoaded]);

  // Searching moves the map to the matching listings (after the user pauses typing)
  useEffect(() => {
    const map = mapRef.current;
    const q = (searchQuery || "").trim();
    if (!map || !mapLoaded || q.length < 2) return;
    const t = window.setTimeout(() => {
      const pts = properties.filter((p) => p.latitude != null && p.longitude != null);
      if (pts.length === 0) return;
      if (pts.length === 1) {
        map.flyTo({ center: [pts[0].longitude!, pts[0].latitude!], zoom: 16, speed: 1.2 });
        return;
      }
      const b = new maplibregl.LngLatBounds();
      pts.forEach((p) => b.extend([p.longitude!, p.latitude!]));
      map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 700 });
    }, 500);
    return () => window.clearTimeout(t);
  }, [searchQuery, mapLoaded]);

  // Blue dot for the user's position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!location) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maplibregl.Marker({ element: makeUserDot() })
        .setLngLat([location.lng, location.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([location.lng, location.lat]);
    }
  }, [location, mapLoaded]);

  // Auto-locate once per visit, only if the browser already granted location (no surprise prompt)
  useEffect(() => {
    if (!mapLoaded || properties.length === 0 || autoLocatedRef.current) return;
    autoLocatedRef.current = true;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm && perm.state === "granted") handleNearMe(true);
      } catch {
        // Permissions API unavailable: the Near me button still works
      }
    })();
  }, [mapLoaded, properties.length]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Pin legend (only when both kinds are on the map) */}
      {properties.some((p) => p.property_type === "Commercial") && properties.some((p) => p.property_type !== "Commercial") && (
        <div className="pointer-events-none absolute left-3 top-[4.5rem] md:top-3 z-10 flex gap-3 rounded-full bg-gray-900/85 px-3 py-1.5 text-[11px] font-semibold text-gray-200 ring-1 ring-white/10">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_HOME }} />Homes</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_COMMERCIAL }} />Commercial</span>
        </div>
      )}

      <div
        className={`absolute right-4 z-20 flex max-w-[75%] items-end gap-2 ${
          previewBottom ? "flex-col-reverse" : "top-4 flex-col"
        }`}
        style={previewBottom ? { bottom: `calc(${previewBottom} + 56px)`, transition: "bottom 0.3s ease" } : undefined}
      >
        <button
          onClick={() => handleNearMe(false)}
          disabled={locating}
          className="rounded-full bg-gray-900/90 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 hover:bg-gray-800 disabled:opacity-60"
        >
          {locating ? "Locating…" : <span className="inline-flex items-center gap-1.5"><LocateFixed className="h-4 w-4" />{t("Near me")}</span>}
        </button>
        {nearMsg && (
          <div className="flex items-start gap-2 rounded-xl bg-gray-900/95 px-3 py-2 text-xs text-white shadow-lg ring-1 ring-white/10">
            <span>{nearMsg}</span>
            <button
              onClick={() => { clear(); setNearMsg(null); }}
              aria-label="Dismiss"
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {preview && onViewDetails && (
        <PropertyPreview
          property={preview}
          bottom={previewBottom}
          onClose={() => setPreview(null)}
          onViewDetails={() => {
            setPreview(null);
            onViewDetails(preview);
          }}
        />
      )}
    </div>
  );
}
