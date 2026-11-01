import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { distanceMeters } from "@/lib/geo";
import type { Property } from "@/types/property";

export type Area = { name: string; lat: number; lng: number };

export interface Requirement {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  areas: Area[];
  radius_km: number;
  property_type: "Any" | "Apartment" | "Independent House" | "PG" | "Commercial";
  bhk: number[];
  budget_max: number | null;
  furnishing: string[];
  move_in: string | null;
  tenant_type: string | null;
  notes: string | null;
  status: "active" | "paused" | "closed";
  whatsapp_opt_in: boolean;
  created_at: string;
  last_notified_at: string | null;
}

export const TENANT_TYPES = ["Family", "Working professional(s)", "Bachelor(s)", "Student(s)"];

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const parseDate = (s?: string | null) => (s ? new Date(s + "T00:00:00") : null);

/** "Available now" / "Available from 15 Nov" */
export function availabilityLabel(date?: string | null) {
  const d = parseDate(date);
  if (!d || d <= today()) return "Available now";
  return "Available from " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export type RequirementInput = Omit<Requirement, "id" | "user_id" | "created_at" | "last_notified_at">;

// Any screen can ask the app to open the requirement form.
export const OPEN_REQUIREMENT = "ehh:open-requirement";
export const openRequirement = () => window.dispatchEvent(new Event(OPEN_REQUIREMENT));

/** Same rules as the database's requirement_fits(), for showing matches instantly. */
export function fits(r: Pick<Requirement, "areas" | "radius_km" | "property_type" | "bhk" | "budget_max" | "furnishing" | "move_in" | "tenant_type">, p: Property) {
  if (p.is_sample || p.listing_type === "sale" || p.availability === "let_out") return false;
  if (p.latitude == null || p.longitude == null) return false;
  const type = p.property_type || "Apartment";
  if (r.property_type !== "Any" && r.property_type !== type) return false;
  if (r.property_type === "Any" && type === "Commercial") return false; // "Any" = any home
  if (r.bhk.length && type !== "PG" && type !== "Commercial" && !(p.bhk != null && (r.bhk.includes(p.bhk) || (p.bhk >= 4 && r.bhk.includes(4))))) return false;
  if (r.budget_max && p.rent && p.rent > r.budget_max * 1.1) return false;
  if (r.furnishing.length && p.furnishing && !r.furnishing.includes(p.furnishing)) return false;
  const moveIn = parseDate(r.move_in);
  if (moveIn) {
    const free = parseDate(p.availability_date) ?? today();
    if (free > addDays(moveIn, 15)) return false;
    if (moveIn > addDays(free > today() ? free : today(), 45)) return false;
  }
  if (r.tenant_type && p.preferred_tenants?.length && !p.preferred_tenants.includes(r.tenant_type)) return false;
  return r.areas.some((a) => distanceMeters(a, { lat: p.latitude!, lng: p.longitude! }) <= r.radius_km * 1000);
}

export function useMyRequirements() {
  const { user } = useAuth();
  const [items, setItems] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("requirements")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "closed")
      .order("created_at", { ascending: false });
    setItems((data as Requirement[]) ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async (input: RequirementInput, id?: string) => {
    const q = (supabase as any).from("requirements");
    const { error } = id ? await q.update(input).eq("id", id) : await q.insert(input);
    if (!error) await load();
    return error?.message ?? null;
  };

  const setStatus = async (id: string, status: Requirement["status"]) => {
    const { error } = await (supabase as any).from("requirements").update({ status }).eq("id", id);
    if (!error) await load();
    return error?.message ?? null;
  };

  return { items, loading, save, setStatus, reload: load };
}

/** Re-check matches for a listing (after approval, or when an owner lowers the rent). Fire-and-forget. */
export function notifyMatches(propertyId: string) {
  supabase.functions.invoke("notify-matches", { body: { property_id: propertyId } })
    .then(({ error }) => { if (error) console.warn("notify-matches:", error); });
}

/** How many active tenants want a home like this (owner-side demand). */
export async function demandCount(args: {
  lat: number; lng: number; propertyType?: string; bhk?: number | null; rent?: number | null; furnishing?: string | null;
  availableFrom?: string | null; preferredTenants?: string[];
}) {
  const { data, error } = await (supabase as any).rpc("demand_count", {
    _lat: args.lat,
    _lng: args.lng,
    _ptype: args.propertyType ?? null,
    _bhk: args.bhk ?? null,
    _rent: args.rent ?? null,
    _furnishing: args.furnishing ?? null,
    _available: args.availableFrom || null,
    _preferred: args.preferredTenants ?? [],
  });
  return error ? null : (data as number);
}
