import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DealProperty {
  id: string;
  title: string | null;
  address: string | null;
  property_type: string | null;
  bhk: number | null;
  furnishing: string | null;
  rent: number | null;
  deposit: number | null;
}

export interface Deal {
  id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  tenant_agreed_at: string | null;
  landlord_agreed_at: string | null;
  agreed_at: string | null;
  cancelled_at?: string | null;
  properties?: DealProperty | null;
}

const DEAL_FIELDS =
  "id, property_id, tenant_id, landlord_id, tenant_agreed_at, landlord_agreed_at, agreed_at, cancelled_at, properties(id, title, address, property_type, bhk, furnishing, rent, deposit)";

// Lets any screen (e.g. a chat) ask the app to open RentRight for a specific deal,
// and lets lists refresh after a deal changes.
export const DEAL_CHANGED = "ehh:deal-changed";
export const OPEN_RENTRIGHT = "ehh:open-rentright";
export const openRentRight = (dealId?: string) =>
  window.dispatchEvent(new CustomEvent(OPEN_RENTRIGHT, { detail: { dealId } }));

/** Deals where both sides have agreed and the current user is a party. */
export function useAgreedDeals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);

  const load = useCallback(async () => {
    if (!user) { setDeals([]); return; }
    const { data, error } = await (supabase as any)
      .from("deals")
      .select(DEAL_FIELDS)
      .not("agreed_at", "is", null)
      .is("cancelled_at", null)
      .order("agreed_at", { ascending: false });
    if (error) console.warn("deals load:", error.message);
    setDeals((data as Deal[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    void load();
    window.addEventListener(DEAL_CHANGED, load);
    return () => window.removeEventListener(DEAL_CHANGED, load);
  }, [load]);

  return deals;
}

/** The deal (if any) between the current user and `otherId` for one property. */
export function useDeal(propertyId: string, otherId: string) {
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [availability, setAvailability] = useState<string>("available");
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !propertyId || !otherId) return;
    const { data } = await (supabase as any)
      .from("deals")
      .select(DEAL_FIELDS)
      .eq("property_id", propertyId)
      .or(`and(tenant_id.eq.${user.id},landlord_id.eq.${otherId}),and(tenant_id.eq.${otherId},landlord_id.eq.${user.id})`)
      .maybeSingle();
    const d = (data as Deal) ?? null;
    setDeal(d && d.cancelled_at ? { ...d, agreed_at: null, tenant_agreed_at: null, landlord_agreed_at: null } : d);
    const { data: prop } = await (supabase as any)
      .from("properties").select("availability, landlord_id").eq("id", propertyId).maybeSingle();
    setAvailability(prop?.availability ?? "available");
    setLandlordId(prop?.landlord_id ?? null);
  }, [user?.id, propertyId, otherId]);

  useEffect(() => { void load(); }, [load]);

  const setAgreement = async (agree: boolean) => {
    setBusy(true);
    setError(null);
    const { error } = await (supabase as any).rpc("set_deal_agreement", {
      _property_id: propertyId,
      _other_user: otherId,
      _agree: agree,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await load();
    window.dispatchEvent(new Event(DEAL_CHANGED));
  };

  const close = async (action: "let_out" | "cancel") => {
    if (!deal) return;
    setBusy(true);
    setError(null);
    const { error } = await (supabase as any).rpc("close_deal", { _deal_id: deal.id, _action: action });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await load();
    window.dispatchEvent(new Event(DEAL_CHANGED));
  };

  const iAmLandlord = (deal?.landlord_id ?? landlordId) === user?.id;
  const mine = deal ? (iAmLandlord ? deal.landlord_agreed_at : deal.tenant_agreed_at) : null;
  const theirs = deal ? (iAmLandlord ? deal.tenant_agreed_at : deal.landlord_agreed_at) : null;

  return { deal, busy, error, reload: load, agree: () => setAgreement(true), withdraw: () => setAgreement(false), close, mine, theirs, iAmLandlord, availability };
}
