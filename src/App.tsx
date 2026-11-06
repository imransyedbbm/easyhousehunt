import { linkKey } from "@/lib/share";
import BrandLogo from "@/components/BrandLogo";
import { lazy, Suspense, useEffect, useState } from "react";
import { MessageSquare, LayoutDashboard, ClipboardList, Scale, Lock, Settings, LogOut, Plus } from "lucide-react";
import ListSkeleton, { LoadError, PanelFallback } from "@/components/common/ListSkeleton";
import MapView from "./components/map/MapView";
import UnreadBadge from "@/components/UnreadBadge";
import { setMessagesOpenHandler } from "@/lib/messageStore";
import { setSignInRequestHandler } from "@/lib/saved";
import { useUserLocation } from "@/hooks/useUserLocation";
import { AREA_RADIUS_M, distanceMeters, driveMinutes, formatDistance } from "@/lib/geo";
import { setPropertySelectHandler, setSearchableProperties, setSearchNote } from "@/lib/searchStore";
import PropertyList from "./components/map/PropertyList";
import PropertyDetail from "./components/map/PropertyDetail";
import AuthModal from "@/components/ui/AuthModal";
const ListingWizard = lazy(() => import("./modules/chat/ListingWizard"));
const ChatModal = lazy(() => import("./modules/chat/ChatModal"));
import SearchFilters, { Filters } from "./components/SearchFilters";
const OwnerDashboard = lazy(() => import("./pages/OwnerDashboard"));
const TenantDashboard = lazy(() => import("./pages/TenantDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
import MobileLayout from "./components/MobileLayout";
import { supabase } from "./integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
const RentRight = lazy(() => import("./pages/RentRight"));
import { OPEN_RENTRIGHT, useAgreedDeals } from "@/lib/deals";
import { OPEN_REQUIREMENT, openRequirement } from "@/lib/requirements";
const RequirementModal = lazy(() => import("@/components/RequirementModal"));
import { Property } from "./types/property";
import { toast } from "sonner";
import { logListingView } from "@/lib/insights";
import { rankScore } from "@/lib/quality";
import Welcome, { shouldShowWelcome } from "@/components/Welcome";
import GrowthMenuItems, { InstallLink } from "@/components/GrowthMenuItems";
import { LOCALITIES } from "@/data/localities";

const areaSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Deep links from the public pages: /?area=koramangala, /?list=1, /?requirement=1
const initialParams = new URLSearchParams(window.location.search);
const initialArea = (() => {
  const l = LOCALITIES.find((x) => areaSlug(x.name) === (initialParams.get("area") || "").toLowerCase());
  return l ? { name: l.name, lat: l.lat, lng: l.lng } : null;
})();

function App() {
  const { user, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { location: userLoc } = useUserLocation();
  useEffect(() => {
    setMessagesOpenHandler(() => setInboxOpen(true));
    return () => setMessagesOpenHandler(null);
  }, []);
  useEffect(() => {
    setSignInRequestHandler(() => { setAuthIntent("tenant"); setAuthModalOpen(true); });
    return () => setSignInRequestHandler(null);
  }, []);
  const [authIntent, setAuthIntent] = useState<"owner" | "tenant">("tenant");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [chatProperty, setChatProperty] = useState<Property | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ownerDashOpen, setOwnerDashOpen] = useState(false);
  const [tenantDashOpen, setTenantDashOpen] = useState(false);
  const [adminDashOpen, setAdminDashOpen] = useState(false);
  const [rentRightOpen, setRentRightOpen] = useState(false);
  const [requirementOpen, setRequirementOpen] = useState(false);
  const [rentRightDealId, setRentRightDealId] = useState<string | undefined>();
  const agreedDeals = useAgreedDeals();
  const rentRightUnlocked = agreedDeals.length > 0;
  useEffect(() => {
    const open = (e: Event) => {
      setRentRightDealId((e as CustomEvent).detail?.dealId);
      setChatProperty(null);
      setInboxOpen(false);
      setOwnerDashOpen(false);
      setRentRightOpen(true);
    };
    window.addEventListener(OPEN_RENTRIGHT, open);
    return () => window.removeEventListener(OPEN_RENTRIGHT, open);
  }, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    bhk: [], minRent: 0, maxRent: 99999999, furnishing: [], search: "", propertyType: "All", occupancy: [], area: initialArea,
  });
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
  const [filtersKey, setFiltersKey] = useState(0);

  async function fetchProperties() {
    setLoadFailed(false);
    try {
      const CORE = ["id", "title", "rent", "bhk", "address", "latitude", "longitude", "deposit", "furnishing", "area_sqft", "description", "amenities", "media_urls", "landlord_id", "property_type", "occupancy", "is_sample", "listing_type", "sale_price"];
      // Newer columns: if the database doesn't have one yet, drop just that column and retry,
      // so one missing column can never blank the map.
      let optional = ["is_verified", "created_at", "availability", "availability_date", "preferred_tenants", "share_code", "commercial_type", "confirmed_at"];
      const query = (cols: string[]) => {
        let q = supabase
          .from("properties")
          .select(cols.join(", "))
          .eq("market", "india")
          .eq("status", "approved")
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        // Let-out homes leave the map.
        if (cols.includes("availability")) q = q.neq("availability", "let_out");
        return q.limit(300);
      };
      let { data, error } = await query([...CORE, ...optional]);
      for (let i = 0; error && i < optional.length; i++) {
        const missing = optional.find((c) => error!.message?.includes(c));
        if (!missing) { optional = []; } else { optional = optional.filter((c) => c !== missing); }
        console.warn("properties: retrying without", missing ?? "optional columns");
        ({ data, error } = await query([...CORE, ...optional]));
      }

      if (error) { console.error("Supabase error:", error.message); setProperties([]); setLoadFailed(true); return; }

      const mapped: Property[] = (data || []).map(toProperty);

      // Once there are enough real listings, the labelled samples disappear on their own
      const realCount = mapped.filter((p) => !p.is_sample).length;
      setProperties(realCount >= 15 ? mapped.filter((p) => !p.is_sample) : mapped);
      openSharedListing(mapped);
    } catch (err) {
      console.error("Fetch error:", err);
      setProperties([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Shared links (easyhousehunt.com/l/<id>) land on /?p=<id>: open that listing.
  async function openSharedListing(loaded: Property[]) {
    const key = linkKey(new URLSearchParams(window.location.search).get("p") || "");
    if (new URLSearchParams(window.location.search).has("p")) window.history.replaceState(null, "", window.location.pathname);
    if (!key) return;
    let found = loaded.find((x) => (key.code ? x.share_code === key.code : x.id === key.id)) ?? null;
    if (!found) {
      const q = (supabase as any).from("properties").select("*").eq("status", "approved");
      const { data } = await (key.code ? q.eq("share_code", key.code) : q.eq("id", key.id)).maybeSingle();
      if (data) found = toProperty(data);
    }
    if (found) { setSelectedProperty(found); setDetailProperty(found); logListingView(found.id, "share"); }
  }

  function toProperty(p: any): Property {
    return {
        id: String(p.id),
        title: p.title ?? "Untitled",
        rent: p.rent ?? 0,
        bhk: p.bhk ?? null,
        address: p.address ?? "",
        latitude: p.latitude,
        longitude: p.longitude,
        deposit: p.deposit ?? null,
        furnishing: p.furnishing ?? null,
        area_sqft: p.area_sqft ?? null,
        description: p.description ?? null,
        amenities: p.amenities ?? [],
        media_urls: p.media_urls ?? [],
        image_url: p.media_urls?.[0] ?? null,
        landlord_id: p.landlord_id ?? null,
        property_type: p.property_type ?? "Apartment",
        occupancy: p.occupancy ?? null,
        commercial_type: p.commercial_type ?? null,
        is_sample: p.is_sample ?? false,
        is_verified: p.is_verified ?? false,
        created_at: p.created_at ?? null,
        share_code: p.share_code ?? null,
        availability: p.availability ?? "available",
        availability_date: p.availability_date ?? null,
        confirmed_at: p.confirmed_at ?? null,
        preferred_tenants: p.preferred_tenants ?? [],
        listing_type: p.listing_type ?? "rent",
        sale_price: p.sale_price ?? null,
    };
  }

  useEffect(() => { fetchProperties(); }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("is_admin").eq("id", user.id).single()
      .then(({ data }) => setIsAdmin(data?.is_admin || false));
  }, [user]);

  // Also check by email as fallback
  const adminEmail = "naveedahmedm@gmail.com";
  const isAdminByEmail = user?.email === adminEmail;
  const effectiveAdmin = isAdmin || isAdminByEmail;

  const filteredByFilters = properties.filter((p) => {
    if (filters.bhk.length > 0 && !filters.bhk.includes(p.bhk ?? 0)) return false;
    if ((p.listing_type ?? "rent") !== (filters.mode ?? "rent")) return false;
    const price = p.listing_type === "sale" ? (p.sale_price ?? 0) : p.rent;
    const noMax = filters.maxRent >= 99999999;
    if (price < filters.minRent || (!noMax && price > filters.maxRent)) return false;
    if (filters.furnishing.length > 0 && !filters.furnishing.includes(p.furnishing ?? "")) return false;
    // "All" shows homes and commercial together; "Homes" hides commercial spaces.
    if (filters.propertyType === "Homes") {
      if (p.property_type === "Commercial") return false;
    } else if (filters.propertyType !== "All" && p.property_type !== filters.propertyType) return false;
    if (filters.commercialType?.length && !filters.commercialType.includes(p.commercial_type ?? "")) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!p.title?.toLowerCase().includes(q) && !p.address?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Area focus (picked from the search suggestions): listings within AREA_RADIUS_M, nearest first.
  // If there are none, show the nearest few so nobody is left on an empty map.
  let areaNote: string | null = null;
  let scoped = filteredByFilters;
  const focus = filters.area;
  if (focus) {
    const ranked = filteredByFilters
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ p, d: distanceMeters(focus, { lat: p.latitude!, lng: p.longitude! }) }))
      .sort((a, b) => a.d - b.d);
    const radiusM = filters.radiusKm ? filters.radiusKm * 1000 : AREA_RADIUS_M;
    const within = ranked.filter((r) => r.d <= radiusM);
    if (ranked.length === 0) {
      areaNote = "No listings match your filters.";
    } else if (within.length === 0) {
      areaNote = `No listings within ${radiusM / 1000} km of ${focus.name} yet. Showing the nearest ones.`;
    }
    scoped = (within.length > 0 ? within : ranked.slice(0, 8)).map((r) => r.p);
  }

  const withDistance: Property[] = scoped.map((p) => ({
    ...p,
    distance_label:
      focus && p.latitude != null && p.longitude != null
        ? (() => {
            const d = distanceMeters(focus, { lat: p.latitude, lng: p.longitude });
            return `${formatDistance(d)} · ~${driveMinutes(d)} min drive to ${focus.name}`;
          })()
        : null,
    distance_m:
      userLoc && p.latitude != null && p.longitude != null
        ? distanceMeters(userLoc, { lat: p.latitude, lng: p.longitude })
        : null,
  }));
  // Near me: nearest first. Area picked: nearest to it (already sorted). Otherwise: best listings first
  // (complete, recently confirmed, verified), with samples last.
  const orderedProperties: Property[] =
    userLoc && !focus
      ? [...withDistance].sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
      : focus
        ? withDistance
        : [...withDistance].sort((a, b) => Number(!!a.is_sample) - Number(!!b.is_sample) || rankScore(b) - rankScore(a));

  // Real listings first; labelled samples after them
  const filteredProperties: Property[] = [
    ...orderedProperties.filter((p) => !p.is_sample),
    ...orderedProperties.filter((p) => p.is_sample),
  ];

  useEffect(() => { setSearchableProperties(properties); }, [properties]);
  useEffect(() => { setSearchNote(areaNote); }, [areaNote]);
  useEffect(() => {
    setPropertySelectHandler((p) => { setSelectedProperty(p); setDetailProperty(p); });
    return () => setPropertySelectHandler(null);
  }, []);

  // "Post your requirement" needs an account (alerts are emailed); resume after sign-in.
  const [requirementAfterLogin, setRequirementAfterLogin] = useState(false);
  useEffect(() => {
    const open = () => {
      if (user) setRequirementOpen(true);
      else { setRequirementAfterLogin(true); setAuthIntent("tenant"); setAuthModalOpen(true); }
    };
    window.addEventListener(OPEN_REQUIREMENT, open);
    return () => window.removeEventListener(OPEN_REQUIREMENT, open);
  }, [user?.id]);
  useEffect(() => {
    if (user && requirementAfterLogin) { setRequirementAfterLogin(false); setAuthModalOpen(false); setRequirementOpen(true); }
  }, [user?.id, requirementAfterLogin]);

  const handleListProperty = () => {
    if (user) { setWizardOpen(true); }
    else { setAuthIntent("owner"); setAuthModalOpen(true); }
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!["area", "list", "requirement"].some((k) => q.has(k))) return;
    if (q.has("list")) handleListProperty();
    if (q.has("requirement")) openRequirement();
    ["area", "list", "requirement"].forEach((k) => q.delete(k));
    const rest = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (detailProperty && !detailProperty.is_sample) logListingView(detailProperty.id);
  }, [detailProperty?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectWithOwner = () => {
    if (user) { setChatProperty(detailProperty); setDetailProperty(null); }
    else { setAuthIntent("tenant"); setAuthModalOpen(true); }
  };

  const sharedProps = {
    properties: filteredProperties,
    loading,
    loadFailed,
    onRetry: fetchProperties,
    filters,
    onFiltersChange: setFilters,
    onSelectProperty: (p: Property) => { setSelectedProperty(p); setDetailProperty(p); },
    onListProperty: handleListProperty,
    onOpenInbox: () => setInboxOpen(true),
    onSignIn: () => { setAuthIntent("tenant"); setAuthModalOpen(true); },
    onSignOut: signOut,
    onOwnerDash: () => setOwnerDashOpen(true),
    isAdmin,
    onAdminDash: () => setAdminDashOpen(true),
    onRentRight: () => { setRentRightDealId(undefined); setRentRightOpen(true); },
    rentRightUnlocked,
    detailProperty,
    onCloseDetail: () => setDetailProperty(null),
    onConnectOwner: handleConnectWithOwner,
  };

  return (
    <>
      {/* MOBILE */}
      <div className="block md:hidden h-screen">
        <MobileLayout {...sharedProps} />
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex h-screen w-full">
        <div className="w-[350px] bg-black text-white overflow-y-auto flex flex-col">
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h1><BrandLogo size="md" /></h1>
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(prev => !prev)}
                    className="flex flex-col gap-1 p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    <span className="w-4 h-0.5 bg-white block"></span>
                    <span className="w-4 h-0.5 bg-white block"></span>
                    <span className="w-4 h-0.5 bg-white block"></span>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-10 bg-gray-800 rounded-xl shadow-xl z-50 w-48 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-700">
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <button onClick={() => { setInboxOpen(true); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Messages <UnreadBadge />
                      </button>
                      <button onClick={() => { setOwnerDashOpen(true); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" /> My Dashboard
                      </button>
                      <button onClick={() => { openRequirement(); setMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" /> My requirements
                      </button>
                      <button onClick={() => { setRentRightDealId(undefined); setRentRightOpen(true); setMenuOpen(false); }}
                        title={rentRightUnlocked ? "Draft your rental agreement" : "Unlocks once you and the other party agree a deal"}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-700 flex items-center gap-2 ${rentRightUnlocked ? "text-white" : "text-gray-500"}`}>
                        <Scale className="h-4 w-4" /> RentRight {!rentRightUnlocked && <Lock className="ml-auto h-3.5 w-3.5" />}
                      </button>
                      {effectiveAdmin && (
                        <button onClick={() => { setAdminDashOpen(true); setMenuOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                          <Settings className="h-4 w-4" /> Admin Panel
                        </button>
                      )}
                      <GrowthMenuItems onDone={() => setMenuOpen(false)} />
                      <div className="border-t border-gray-700">
                        <button onClick={() => { signOut(); setMenuOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2">
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => { setAuthIntent("tenant"); setAuthModalOpen(true); }}
                  className="text-xs text-orange-400 hover:text-orange-300">
                  Sign in
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleListProperty}
                className="flex-1 bg-orange-500 hover:bg-orange-600 py-3 rounded font-semibold text-sm">
                <span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> List Your Property</span>
              </button>
              <button onClick={openRequirement}
                className="flex-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 py-3 rounded font-semibold text-sm">
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Post Requirement</span>
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[11px] text-gray-500">
              <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Privacy</a>
              <span>·</span>
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Terms</a>
              <span>·</span>
              <a href="/about.html" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">About</a>
              <span>·</span>
              <a href="/contact.html" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">Contact</a>
              <InstallLink className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 [&>svg]:h-3 [&>svg]:w-3" />
            </div>
          </div>
          <SearchFilters key={filtersKey} onChange={setFilters} initial={filters} />
          {loading ? (
            <ListSkeleton />
          ) : loadFailed ? (
            <LoadError onRetry={() => { setLoading(true); fetchProperties(); }} />
          ) : (
            <PropertyList
              properties={filteredProperties}
              onSelect={(p) => { setSelectedProperty(p); setDetailProperty(p); }}
            />
          )}
        </div>
        <div className="flex-1">
          <MapView
            properties={filteredProperties}
            selectedProperty={selectedProperty}
            onMarkerClick={(p) => setSelectedProperty(p)}
            onViewDetails={(p) => setDetailProperty(p)}
            searchQuery={filters.search || filters.area?.name || ""}
          />
        </div>
      </div>

      <Suspense fallback={<PanelFallback />}>
      {detailProperty && (
        <PropertyDetail
          property={detailProperty}
          onClose={() => setDetailProperty(null)}
          onConnectClick={handleConnectWithOwner}
          onRequireLogin={() => { setAuthIntent("tenant"); setAuthModalOpen(true); }}
        />
      )}

      {chatProperty && (
        <ChatModal
          propertyId={chatProperty.id}
          propertyTitle={chatProperty.title}
          receiverId={chatProperty.landlord_id || ""}
          onClose={() => setChatProperty(null)}
        />
      )}

      {inboxOpen && <OwnerDashboard initialTab="messages" onClose={() => setInboxOpen(false)} />}

      {wizardOpen && (
        <ListingWizard
          onClose={() => setWizardOpen(false)}
          onSuccess={() => {
            setWizardOpen(false);
            fetchProperties();
            toast.success("Listing submitted for review", { description: "It will appear on the map once approved. Track it under My Listings." });
          }}
        />
      )}

      {welcomeOpen && (
        <Welcome
          listingCount={properties.filter((p) => !p.is_sample).length}
          onPickArea={(l) => {
            setFilters((f) => ({ ...f, search: "", area: { name: l.name, lat: l.lat, lng: l.lng } }));
            setFiltersKey((k) => k + 1);
            setWelcomeOpen(false);
          }}
          onBrowse={() => setWelcomeOpen(false)}
          onListProperty={() => { setWelcomeOpen(false); handleListProperty(); }}
        />
      )}

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      {ownerDashOpen && <OwnerDashboard onClose={() => { setOwnerDashOpen(false); fetchProperties(); }} />}
      {tenantDashOpen && <TenantDashboard onClose={() => setTenantDashOpen(false)} />}
      {adminDashOpen && <AdminDashboard onClose={() => { setAdminDashOpen(false); fetchProperties(); }} />}
      {requirementOpen && <RequirementModal properties={properties} onClose={() => setRequirementOpen(false)} />}
      {rentRightOpen && <RentRight deals={agreedDeals} initialDealId={rentRightDealId} onClose={() => setRentRightOpen(false)} />}
      </Suspense>
    </>
  );
}

export default App;
