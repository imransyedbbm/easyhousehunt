import BrandLogo from "@/components/BrandLogo";
import { useState, useRef } from "react";
import MapView from "./map/MapView";
import UnreadBadge from "@/components/UnreadBadge";
import PropertyList from "./map/PropertyList";
import PropertyDetail from "./map/PropertyDetail";
import SearchFilters, { Filters } from "./SearchFilters";
import { Property } from "../types/property";
import { useAuth } from "@/hooks/useAuth";

type SheetState = "peek" | "half" | "full";

export default function MobileLayout({
  properties,
  loading,
  filters,
  onFiltersChange,
  onSelectProperty,
  onListProperty,
  onOpenInbox,
  onSignIn,
  onSignOut,
  onOwnerDash,
  isAdmin,
  onAdminDash,
  onRentRight,
  detailProperty,
  onCloseDetail,
  onConnectOwner,
}: {
  properties: Property[];
  loading: boolean;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onSelectProperty: (p: Property) => void;
  onListProperty: () => void;
  onOpenInbox: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOwnerDash: () => void;
  isAdmin: boolean;
  onAdminDash: () => void;
  onRentRight: () => void;
  detailProperty: Property | null;
  onCloseDetail: () => void;
  onConnectOwner: () => void;
}) {
  const { user } = useAuth();
  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const touchStartY = useRef<number>(0);
  const touchStartState = useRef<SheetState>("peek");

  const sheetHeights = { peek: "120px", half: "50vh", full: "90vh" };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartState.current = sheetState;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStartY.current - e.changedTouches[0].clientY;
    if (delta > 60) {
      // swipe up
      if (sheetState === "peek") setSheetState("half");
      else if (sheetState === "half") setSheetState("full");
    } else if (delta < -60) {
      // swipe down
      if (sheetState === "full") setSheetState("half");
      else if (sheetState === "half") setSheetState("peek");
    }
  };

  const handleMarkerClick = (p: Property) => {
    setSelectedProperty(p);
    setSheetState("peek");
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <h1><BrandLogo size="sm" /></h1>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="relative">
                <button
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  className="flex flex-col gap-1 p-2 bg-gray-800/80 rounded-lg"
                >
                  <span className="w-4 h-0.5 bg-white block"></span>
                  <span className="w-4 h-0.5 bg-white block"></span>
                  <span className="w-4 h-0.5 bg-white block"></span>
                </button>
                {mobileMenuOpen && (
                  <div className="absolute right-0 top-10 bg-gray-800 rounded-xl shadow-xl z-50 w-48 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-700">
                      <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>
                    <button onClick={() => { onOpenInbox(); setMobileMenuOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                      💬 Messages <UnreadBadge />
                    </button>
                    <button onClick={() => { onOwnerDash(); setMobileMenuOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                      📋 My Dashboard
                    </button>
                    {isAdmin && (
                      <button onClick={() => { onAdminDash(); setMobileMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                        ⚙️ Admin Panel
                      </button>
                    )}
                    <button onClick={() => { onRentRight(); setMobileMenuOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 flex items-center gap-2">
                      🛡️ RentRight
                    </button>
                    <div className="border-t border-gray-700 px-4 py-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                      <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">Privacy</a>
                      <span>·</span>
                      <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">Terms</a>
                      <span>·</span>
                      <a href="/about.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">About</a>
                      <span>·</span>
                      <a href="/contact.html" target="_blank" rel="noopener noreferrer" className="hover:text-white">Contact</a>
                    </div>
                    <div className="border-t border-gray-700">
                      <button onClick={() => { onSignOut(); setMobileMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2">
                        ↪ Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button onClick={onSignIn}
              className="bg-orange-500 text-white text-xs px-3 py-1.5 rounded-full font-medium">
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* MAP - full screen */}
      <div className="absolute inset-0">
        <MapView
          properties={properties}
          selectedProperty={selectedProperty}
          onMarkerClick={handleMarkerClick}
          onViewDetails={(p) => onSelectProperty(p)}
          searchQuery={filters.search || filters.area?.name || ""}
          previewBottom={`calc(${sheetHeights[sheetState]} + 16px)`}
        />
      </div>

      {/* LIST YOUR PROPERTY FAB */}
      <div className="absolute left-4 z-20" style={{bottom: `calc(${sheetHeights[sheetState]} + 16px)`, transition: "bottom 0.3s ease"}}>
        <button onClick={onListProperty}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg">
          + List Property
        </button>
      </div>

      {/* BOTTOM SHEET */}
      <div
        className="absolute left-0 right-0 bottom-0 z-30 bg-gray-900 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ height: sheetHeights[sheetState], transition: "height 0.3s ease" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Sheet header */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-white text-sm font-semibold">
              {loading ? "Loading..." : `${properties.length} properties`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSheetState("half")}
                className="text-xs text-gray-400">
                {sheetState === "peek" ? "▲ Show" : sheetState === "full" ? "▼ Less" : ""}
              </button>
            </div>
          </div>
        </div>

        {/* Filters - only when half or full */}
        {sheetState !== "peek" && (
          <div className="flex-shrink-0">
            <SearchFilters onChange={onFiltersChange} />
          </div>
        )}

        {/* Property list - scrollable */}
        {sheetState !== "peek" && (
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 px-4 py-2 text-sm">Loading...</p>
            ) : (
              <PropertyList
                properties={properties}
                onSelect={(p) => {
                  onSelectProperty(p);
                  setSelectedProperty(p);
                  setSheetState("peek");
                }}
              />
            )}
          </div>
        )}

        {/* Peek state - show count + tap hint */}
        {sheetState === "peek" && (
          <div className="flex items-center justify-center flex-1 gap-2"
            onClick={() => setSheetState("half")}>
            <p className="text-gray-400 text-sm">
              {loading ? "Loading..." : `${properties.length} properties nearby — tap to browse`}
            </p>
          </div>
        )}
      </div>

      {/* PROPERTY DETAIL - slides up over sheet */}
      {detailProperty && (
        <PropertyDetail
          property={detailProperty}
          onClose={onCloseDetail}
          onConnectClick={onConnectOwner}
        />
      )}
    </div>
  );
}
