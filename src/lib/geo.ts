export type LatLng = { lat: number; lng: number };

export const BENGALURU_CENTER: LatLng = { lat: 12.9716, lng: 77.5946 };
export const MAX_CITY_RADIUS_M = 60000; // beyond this we treat the user as "outside Bengaluru"
export const NEAR_RADIUS_M = 2000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export const AREA_RADIUS_M = 2500; // "near an area" = within 2.5 km of its centre

/** Rough Bengaluru drive time: road distance ≈ 1.35 × straight line, ~20 km/h average door to door. */
export function driveMinutes(m: number): number {
  return Math.max(3, Math.round(((m * 1.35) / 1000 / 20) * 60 / 5) * 5);
}

export const isNewListing = (createdAt?: string | null, days = 7) =>
  !!createdAt && Date.now() - new Date(createdAt).getTime() < days * 86_400_000;
