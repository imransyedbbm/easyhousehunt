/** "Flatmate" listings: a room in a shared flat, listed by the person living there (or the owner). */
export const FLATMATE = "Flatmate";
export const isFlatmate = (t?: string | null) => t === FLATMATE;
/** PG and Flatmate share the per-person fields: occupancy (room type), gender preference, bathroom. */
export const isShared = (t?: string | null) => t === "PG" || t === FLATMATE;

/** occupancy "Single" = private room, anything else = shared room. */
export const roomLabel = (occupancy?: string | null) => (occupancy && occupancy !== "Single" ? "Shared room" : "Private room");

/** "Private room in 3 BHK" */
export function flatmateLabel(p: { occupancy?: string | null; bhk?: number | null }) {
  return `${roomLabel(p.occupancy)}${p.bhk ? ` in ${p.bhk} BHK` : ""}`;
}
