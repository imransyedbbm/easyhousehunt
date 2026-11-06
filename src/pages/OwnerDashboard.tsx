import { useEffect, useMemo, useState } from "react";
import EditListingModal from "@/components/EditListingModal";
import ChatModal from "@/modules/chat/ChatModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NotifyBanner } from "@/components/NotifyToggle";
import { useMessageVersion, useUnread } from "@/lib/messageStore";
import { selectProperty } from "@/lib/searchStore";
import { useSavedIds } from "@/lib/saved";
import SaveButton from "@/components/SaveButton";
import { formatPrice } from "@/lib/price";
import { Eye, Heart, MessageSquare, Pencil, Trash2, CheckCircle2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useListingStats, daysSince, confirmListing, setLetOut, STALE_DAYS } from "@/lib/insights";
import { whatsappShareUrl } from "@/lib/share";
import { listingQuality } from "@/lib/quality";
import VisitsPanel from "@/components/VisitsPanel";
import { loadVisits } from "@/lib/visits";

type Tab = "messages" | "visits" | "listings" | "saved";

type Convo = { otherId: string; name: string; count: number; unread: number; last: string };
type Group = {
  propertyId: string;
  title: string;
  role: "owner" | "tenant";
  convos: Convo[];
  unread: number;
  last: string;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
};

export default function OwnerDashboard({
  onClose,
  initialTab = "listings",
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  const { user } = useAuth();
  const unread = useUnread();
  const version = useMessageVersion();
  const savedIds = useSavedIds();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visitsToAnswer, setVisitsToAnswer] = useState(0);
  useEffect(() => {
    if (user) loadVisits(user.id).then((v) => setVisitsToAnswer(v.filter((x) => x.owner_id === user.id && x.status === "pending").length));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProp, setOpenProp] = useState<string | null>(null);
  const [chat, setChat] = useState<{ propertyId: string; title: string; otherId: string; otherLabel: string } | null>(null);
  const [editListing, setEditListing] = useState<any>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const stats = useListingStats(!!user && tab === "listings" && statsVersion >= 0);

  const confirm = async (l: any) => {
    const { error } = await confirmListing(l.id);
    if (error) { toast.error("Couldn't update. Try again."); return; }
    setListings((ls) => ls.map((x) => (x.id === l.id ? { ...x, confirmed_at: new Date().toISOString(), availability: "available" } : x)));
    toast.success("Thanks! Marked as still available.");
    setStatsVersion((v) => v + 1);
  };
  const letOut = async (l: any, out: boolean) => {
    const { error } = await setLetOut(l.id, out);
    if (error) { toast.error("Couldn't update. Try again."); return; }
    setListings((ls) => ls.map((x) => (x.id === l.id ? { ...x, availability: out ? "let_out" : "available", confirmed_at: new Date().toISOString() } : x)));
    toast.success(out ? "Marked as let out. It's off the map now." : "Back on the map.");
  };

  // Message text is not loaded here on purpose: this screen only shows who and how many
  const loadMessages = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("id, property_id, sender_id, receiver_id, sender_name, created_at, read, properties(title, landlord_id)")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data as any[]) || []);
  };

  const loadListings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("properties")
      .select("id, title, rent, bhk, address, created_at, status, rejection_reason, listing_type, sale_price, availability, confirmed_at, share_code, property_type, media_urls, description, amenities, area_sqft, deposit, furnishing, availability_date, preferred_tenants, latitude")
      .eq("market", "india")
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });
    if (data) { setListings(data as any[]); return; }
    const { data: basic } = await supabase
      .from("properties")
      .select("id, title, rent, bhk, address, created_at, status, rejection_reason, listing_type, sale_price")
      .eq("market", "india").eq("landlord_id", user.id).order("created_at", { ascending: false });
    setListings((basic as any[]) || []);
  };

  // Saved items: first the ids, then the listings that are still live (taken-down ones just drop out)
  const loadSaved = async () => {
    if (!user) return;
    const { data: rows } = await supabase
      .from("saved_properties")
      .select("property_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const ids = (rows || []).map((r: any) => String(r.property_id)).filter(Boolean);
    if (ids.length === 0) {
      setSaved([]);
      return;
    }
    const { data: props } = await supabase
      .from("properties")
      .select("id, title, rent, bhk, address, latitude, longitude, deposit, furnishing, area_sqft, description, amenities, media_urls, landlord_id, property_type, occupancy, is_sample, listing_type, sale_price")
      .in("id", ids);
    const byId = new Map((props || []).map((p: any) => [String(p.id), p]));
    setSaved(
      ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((p: any) => ({
          id: String(p.id),
          properties: {
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
            is_sample: p.is_sample ?? false,
            listing_type: p.listing_type ?? "rent",
            sale_price: p.sale_price ?? null,
          },
        }))
    );
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadMessages(), loadListings(), loadSaved()]);
      setLoading(false);
    })();
  }, [user?.id]);

  // New messages and read receipts arrive live
  useEffect(() => {
    if (user) void loadMessages();
  }, [version]);

  const groups = useMemo<Group[]>(() => {
    if (!user) return [];
    const byProp = new Map<string, Group>();
    const convoMaps = new Map<string, Map<string, Convo>>();
    for (const m of rows) {
      if (!m.property_id) continue;
      const prop = m.properties;
      const iOwn = !!prop && prop.landlord_id === user.id;
      const otherId: string | null = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!otherId) continue;
      let g = byProp.get(m.property_id);
      if (!g) {
        g = {
          propertyId: m.property_id,
          title: prop?.title || "Listing no longer available",
          role: iOwn ? "owner" : "tenant",
          convos: [],
          unread: 0,
          last: m.created_at,
        };
        byProp.set(m.property_id, g);
        convoMaps.set(m.property_id, new Map());
      }
      const cm = convoMaps.get(m.property_id)!;
      let c = cm.get(otherId);
      if (!c) {
        c = { otherId, name: "", count: 0, unread: 0, last: m.created_at };
        cm.set(otherId, c);
        g.convos.push(c);
      }
      c.count += 1;
      if (!c.name && m.sender_id === otherId && m.sender_name) c.name = m.sender_name;
      if (m.receiver_id === user.id && !m.read) {
        c.unread += 1;
        g.unread += 1;
      }
    }
    return Array.from(byProp.values()); // newest activity first, because rows are newest first
  }, [rows, user?.id]);

  const group = groups.find((g) => g.propertyId === openProp) || null;

  const deleteListing = async (id: string) => {
    if (!confirm("Delete this listing?")) return;
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) {
      alert("Could not delete: " + error.message);
      return;
    }
    setListings((prev) => prev.filter((l) => l.id !== id));
  };

  const TABS: { key: Tab; label: string; count: number; hot?: boolean }[] = [
    { key: "messages", label: "Messages", count: unread > 0 ? unread : groups.length, hot: unread > 0 },
    { key: "visits", label: "Visits", count: visitsToAnswer, hot: visitsToAnswer > 0 },
    { key: "listings", label: "My Listings", count: listings.length },
    { key: "saved", label: "Saved", count: saved.length },
  ];

  const openSaved = (s: any) => {
    const p = s?.properties;
    if (!p) return;
    onClose();
    selectProperty(p);
  };

  const convoName = (g: Group, c: Convo) => (g.role === "owner" ? c.name || "Tenant" : "Owner");

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
        <div>
          <h1 className="font-bold text-lg">My Dashboard</h1>
          <p className="text-xs text-gray-400">{user?.email}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
      </div>

      <NotifyBanner />
      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key !== "messages") setOpenProp(null);
            }}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${tab === t.key ? "text-orange-400 border-b-2 border-orange-400" : "text-gray-400"}`}
          >
            {t.label}
            <span className={`text-xs rounded-full px-1.5 ${t.hot || tab === t.key ? "bg-orange-500 text-white" : "bg-gray-700 text-gray-300"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full">
          {loading ? (
            <p className="text-gray-400 p-4">Loading...</p>
          ) : (
            <>
              {/* MESSAGES: properties first, then the conversations inside one */}
              {tab === "messages" && !group && (
                <div className="p-4 space-y-3">
                  {groups.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-4xl mb-2">📭</p>
                      <p>No messages yet</p>
                      <p className="text-sm text-gray-500 mt-1">Enquiries about your listings, and your own enquiries, appear here.</p>
                    </div>
                  ) : (
                    groups.map((g) => (
                      <button
                        key={g.propertyId}
                        onClick={() => setOpenProp(g.propertyId)}
                        className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-xl p-4 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold truncate">{g.title}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${g.role === "owner" ? "bg-green-900 text-green-400" : "bg-blue-900 text-blue-300"}`}>
                              {g.role === "owner" ? "Your listing" : "You enquired"}
                            </span>
                          </div>
                          <p className="text-gray-400 text-xs mt-1">
                            {g.role === "owner"
                              ? `${g.convos.length} enquir${g.convos.length === 1 ? "y" : "ies"}`
                              : "1 conversation"}{" "}
                            · last activity {when(g.last)}
                          </p>
                        </div>
                        {g.unread > 0 && (
                          <span className="bg-orange-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
                            {g.unread}
                          </span>
                        )}
                        <span className="text-gray-500">›</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {tab === "messages" && group && (
                <div className="p-4 space-y-3">
                  <button onClick={() => setOpenProp(null)} className="text-sm text-orange-400 hover:text-orange-300">
                    ‹ All properties
                  </button>
                  <div>
                    <p className="font-semibold">{group.title}</p>
                    <p className="text-xs text-gray-400">
                      {group.role === "owner" ? "People who enquired about your listing" : "Your conversation with the owner"}
                    </p>
                  </div>
                  {group.convos.map((c) => (
                    <button
                      key={c.otherId}
                      onClick={() =>
                        setChat({
                          propertyId: group.propertyId,
                          title: group.title,
                          otherId: c.otherId,
                          otherLabel: group.role === "owner" ? "Tenant" : "Property owner",
                        })
                      }
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-xl p-4 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {convoName(group, c)[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{convoName(group, c)}</p>
                        <p className="text-gray-400 text-xs">
                          {c.count} message{c.count === 1 ? "" : "s"} · last activity {when(c.last)}
                        </p>
                      </div>
                      {c.unread > 0 && (
                        <span className="bg-orange-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
                          {c.unread}
                        </span>
                      )}
                      <span className="text-gray-500">›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* MY LISTINGS */}
              {tab === "listings" && (
                <div className="p-4 space-y-3">
                  {listings.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-4xl mb-2">🏠</p>
                      <p>No listings yet</p>
                    </div>
                  ) : (
                    <>
                    {listings.some((l) => l.status === "approved" && l.availability !== "let_out" && daysSince(l.confirmed_at) >= STALE_DAYS && l.confirmed_at !== undefined) && (
                      <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">
                        Some listings haven't been confirmed in {STALE_DAYS}+ days. Tenants trust fresh listings more, so take a second to confirm or mark them let out.
                      </div>
                    )}
                    {listings.map((l) => {
                      const st = stats[String(l.id)];
                      const live = l.status === "approved";
                      const isLetOut = l.availability === "let_out";
                      const age = daysSince(l.confirmed_at);
                      const stale = live && !isLetOut && l.confirmed_at !== undefined && age >= STALE_DAYS;
                      const shareable = l.share_code ? { ...l, id: String(l.id), media_urls: [] } : null;
                      return (
                      <div key={l.id} className={`bg-gray-800 rounded-xl p-4 ${stale ? "ring-1 ring-amber-600/60" : ""}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{l.title}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${isLetOut ? "bg-gray-700 text-gray-300" : live ? "bg-green-900 text-green-400" : l.status === "rejected" ? "bg-red-900 text-red-400" : "bg-yellow-900 text-yellow-300"}`}>
                                {isLetOut ? (l.listing_type === "sale" ? "Sold" : "Let out") : live ? "Live" : l.status === "rejected" ? "Not approved" : "Pending review"}
                              </span>
                            </div>
                            <p className="text-green-400 font-bold">{formatPrice(l)}</p>
                            {l.status === "pending" && <p className="text-yellow-400 text-xs mt-1">Waiting for review. Not visible on the map yet.</p>}
                            {l.status === "rejected" && (
                              <p className="text-red-400 text-xs mt-1">
                                Not approved{l.rejection_reason ? ": " + l.rejection_reason : ""}. Update the details and save to resubmit.
                              </p>
                            )}
                            <p className="text-gray-400 text-xs mt-1 truncate">{l.bhk ? `${l.bhk} BHK · ` : ""}{l.address}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              Listed {new Date(l.created_at).toLocaleDateString("en-IN")}
                              {live && isFinite(age) && !isLetOut && <> · confirmed {age === 0 ? "today" : `${age}d ago`}</>}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 ml-3">
                            <button onClick={() => setEditListing(l)} className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                            <button onClick={() => deleteListing(l.id)} className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                          </div>
                        </div>

                        {live && st && (
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-gray-900/70 py-2">
                              <p className="flex items-center justify-center gap-1 text-lg font-bold"><Eye className="h-4 w-4 text-gray-400" />{st.views}</p>
                              <p className="text-[11px] text-gray-400">views{st.views_7d ? ` · ${st.views_7d} this week` : ""}</p>
                            </div>
                            <div className="rounded-lg bg-gray-900/70 py-2">
                              <p className="flex items-center justify-center gap-1 text-lg font-bold"><Heart className="h-4 w-4 text-pink-400" />{st.saves}</p>
                              <p className="text-[11px] text-gray-400">saved</p>
                            </div>
                            <div className="rounded-lg bg-gray-900/70 py-2">
                              <p className="flex items-center justify-center gap-1 text-lg font-bold"><MessageSquare className="h-4 w-4 text-orange-400" />{st.enquiries}</p>
                              <p className="text-[11px] text-gray-400">enquiries</p>
                            </div>
                          </div>
                        )}
                        {l.status !== "rejected" && "media_urls" in l && (() => {
                          const q = listingQuality(l);
                          if (q.score >= 90) return null;
                          return (
                            <button onClick={() => setEditListing(l)} className="mt-3 block w-full rounded-lg bg-gray-900/70 p-2.5 text-left hover:bg-gray-900">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-300">Listing strength <b className={q.score >= 70 ? "text-yellow-300" : "text-red-300"}>{q.score}%</b></span>
                                <span className="text-orange-400">Improve →</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-700">
                                <div className={`h-full ${q.score >= 70 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${q.score}%` }} />
                              </div>
                              {q.tips[0] && <p className="mt-1.5 text-[11px] text-gray-400">Next: {q.tips[0].label} (+{q.tips[0].points})</p>}
                            </button>
                          );
                        })()}
                        {live && st && st.views >= 30 && st.enquiries === 0 && (
                          <p className="mt-2 text-xs text-amber-300">Lots of views but no enquiries yet. Better photos or a sharper price usually help.</p>
                        )}

                        {live && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {isLetOut ? (
                              <button onClick={() => letOut(l, false)} className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold hover:bg-gray-600">Available again</button>
                            ) : (
                              <>
                                <button onClick={() => confirm(l)} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${stale ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-gray-700 hover:bg-gray-600"}`}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Still available
                                </button>
                                <button onClick={() => letOut(l, true)} className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold hover:bg-gray-600">
                                  {l.listing_type === "sale" ? "Mark sold" : "Mark let out"}
                                </button>
                              </>
                            )}
                            {shareable && !isLetOut && (
                              <a href={whatsappShareUrl(shareable as any)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold hover:bg-green-600">
                                <Share2 className="h-3.5 w-3.5" /> Share on WhatsApp
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}

              {/* SAVED */}
              {tab === "visits" && user && <VisitsPanel userId={user.id} onCount={setVisitsToAnswer} />}

              {tab === "saved" && (
                <div className="p-4 space-y-3">
                  {saved.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <p className="text-4xl mb-2">🔖</p>
                      <p>No saved properties</p>
                    </div>
                  ) : (
                    saved.filter((s) => savedIds.has(String(s.id))).map((s) => (
                      <div key={s.id} onClick={() => openSaved(s)} className="relative cursor-pointer bg-gray-800 hover:bg-gray-700 rounded-xl p-4">
                        <SaveButton propertyId={String(s.id)} size="sm" className="absolute right-3 top-3" />
                        <p className="font-semibold pr-10">{s.properties?.title}</p>
                        <p className="text-green-400 font-bold">{formatPrice(s.properties)}</p>
                        <p className="text-gray-400 text-xs mt-1">{s.properties?.bhk} BHK · {s.properties?.address}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editListing && (
        <EditListingModal
          listing={editListing}
          onClose={() => setEditListing(null)}
          onSaved={() => {
            setEditListing(null);
            void loadListings();
          }}
        />
      )}

      {chat && (
        <ChatModal
          propertyId={chat.propertyId}
          propertyTitle={chat.title}
          receiverId={chat.otherId}
          otherLabel={chat.otherLabel}
          onClose={() => {
            setChat(null);
            void loadMessages();
          }}
        />
      )}
    </div>
  );
}
