import { useEffect, useMemo, useState } from "react";
import EditListingModal from "@/components/EditListingModal";
import { formatPrice } from "@/lib/price";
import { supabase } from "@/integrations/supabase/client";

type Tab = "pending" | "listings" | "messages" | "users" | "demand";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-900 text-yellow-300",
  approved: "bg-green-900 text-green-400",
  rejected: "bg-red-900 text-red-400",
};

// Owners control media_urls, so only ever link http(s) URLs (never javascript:)
const isHttpUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);

export default function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [listings, setListings] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [demandArea, setDemandArea] = useState("");
  const [tab, setTab] = useState<Tab>("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editListing, setEditListing] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [market, setMarket] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    setLoadError("");

    const { data: props, error: pErr } = await supabase
      .from("properties")
      .select("id, title, rent, bhk, address, created_at, landlord_id, latitude, longitude, market, status, rejection_reason, reviewed_at, property_type, furnishing, deposit, description, media_urls, listing_type, sale_price")
      .order("created_at", { ascending: false })
      .limit(300);
    if (pErr) setLoadError(pErr.message);

    const { data: msgs } = await supabase
      .from("messages")
      .select("*, properties(title)")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, role, is_admin")
      .order("id", { ascending: false })
      .limit(200);

    const { data: reqs } = await (supabase as any)
      .from("requirements")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);

    setRequirements(reqs || []);
    setListings(props || []);
    setMessages(msgs || []);
    setUsers(profs || []);
    setLoading(false);
  };

  const ownerEmail = useMemo(() => {
    const m: Record<string, string> = {};
    users.forEach((u) => { if (u.id) m[u.id] = u.email; });
    return m;
  }, [users]);

  const markets: string[] = useMemo(
    () => Array.from(new Set(listings.map((l) => l.market).filter(Boolean))),
    [listings]
  );

  const inMarket = (l: any) => market === "all" || l.market === market;

  // oldest first so nobody waits longer than they should
  const pending = listings
    .filter((l) => l.status === "pending" && inMarket(l))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const allShown = listings.filter(
    (l) => inMarket(l) && (statusFilter === "all" || l.status === statusFilter)
  );

  const stats = {
    pending: listings.filter((l) => l.status === "pending").length,
    live: listings.filter((l) => l.status === "approved").length,
    messages: messages.length,
    users: users.length,
    demand: requirements.length,
  };

  const updateStatus = async (l: any, status: "approved" | "rejected", reason: string | null) => {
    setBusyId(l.id);
    const { data, error } = await supabase
      .from("properties")
      .update({ status, rejection_reason: status === "rejected" ? reason : null })
      .eq("id", l.id)
      .select("id");
    setBusyId(null);
    if (error || !data || data.length === 0) {
      alert("Could not update listing: " + (error?.message ?? "no permission (are you signed in as admin?)"));
      return;
    }
    if (status === "approved") {
      // Email tenants whose saved requirement matches this home (fire-and-forget).
      supabase.functions.invoke("notify-matches", { body: { property_id: l.id } })
        .then(({ data, error }) => {
          if (error) console.warn("notify-matches:", error);
          else if (data?.sent) console.info(`Alerted ${data.sent} matching tenant(s)`);
        });
    }
    setListings((prev) =>
      prev.map((x) =>
        x.id === l.id
          ? { ...x, status, rejection_reason: status === "rejected" ? reason : null, reviewed_at: new Date().toISOString() }
          : x
      )
    );
  };

  const approve = (l: any) => {
    if (!l.latitude && !confirm("This listing has no map location, so it will not appear on the map. Approve anyway?")) return;
    updateStatus(l, "approved", null);
  };

  const reject = (l: any) => {
    const reason = prompt("Reason (shown to the owner so they can fix it):");
    if (reason === null) return;
    if (!reason.trim()) { alert("Please give a short reason."); return; }
    updateStatus(l, "rejected", reason.trim());
  };

  const deleteListing = async (id: string) => {
    if (!confirm("Delete this listing permanently?")) return;
    const { error } = await supabase.from("properties").delete().eq("id", id);
    if (error) { alert("Could not delete: " + error.message); return; }
    setListings((prev) => prev.filter((l) => l.id !== id));
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const TABS = [
    { key: "pending", label: "Pending", count: stats.pending },
    { key: "listings", label: "Listings", count: listings.length },
    { key: "messages", label: "Messages", count: stats.messages },
    { key: "users", label: "Users", count: stats.users },
    { key: "demand", label: "Demand", count: stats.demand },
  ];

  const renderListing = (l: any) => {
    const photos: string[] = (l.media_urls || []).filter(isHttpUrl);
    const busy = busyId === l.id;
    return (
      <div key={l.id} className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold truncate">{l.title}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status] || "bg-gray-700 text-gray-300"}`}>
                {l.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{l.market}</span>
              {l.listing_type === "sale" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">For sale</span>
              )}
            </div>
            <p className="text-green-400 font-bold">{formatPrice(l)}</p>
            <p className="text-gray-300 text-xs mt-1">
              {[
                l.property_type,
                l.bhk ? `${l.bhk} BHK` : null,
                l.furnishing,
                l.deposit ? `Deposit ₹${l.deposit.toLocaleString()}` : null,
              ].filter(Boolean).join(" · ")}
            </p>
            <p className="text-gray-400 text-xs mt-1">{l.address}</p>
            <p className="text-gray-500 text-xs mt-1">
              {ownerEmail[l.landlord_id] || "unknown owner"} · {new Date(l.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button onClick={() => setEditListing(l)} className="text-orange-400 hover:text-orange-300 text-xs">✏️</button>
            <button onClick={() => deleteListing(l.id)} className="text-red-400 hover:text-red-300 text-xs">🗑</button>
          </div>
        </div>

        {l.description && (
          <p className="text-gray-300 text-sm mt-3 whitespace-pre-line">{l.description}</p>
        )}

        {photos.length > 0 ? (
          <div className="flex gap-2 mt-3 overflow-x-auto">
            {photos.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <img src={u} alt="" loading="lazy" className="h-20 w-28 object-cover rounded-lg" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-red-400 mt-3">No photos</p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
          {l.latitude && l.longitude ? (
            <a
              href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 rounded-full bg-green-900 text-green-400"
            >
              📍 Check location
            </a>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-red-900 text-red-400">No location</span>
          )}
        </div>

        {l.status === "rejected" && l.rejection_reason && (
          <p className="text-xs text-red-300 mt-2">Reason: {l.rejection_reason}</p>
        )}

        <div className="flex gap-2 mt-3">
          {l.status !== "approved" && (
            <button
              disabled={busy}
              onClick={() => approve(l)}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 py-2 rounded-lg text-sm font-semibold"
            >
              Approve
            </button>
          )}
          {l.status !== "rejected" && (
            <button
              disabled={busy}
              onClick={() => reject(l)}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 py-2 rounded-lg text-sm font-semibold"
            >
              {l.status === "approved" ? "Take down" : "Reject"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800 bg-gray-900">
        <div>
          <h1 className="font-bold text-lg">⚙️ Admin Dashboard</h1>
          <p className="text-xs text-gray-400">EasyHouseHunt</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-px bg-gray-800">
        {[
          { label: "Pending", value: stats.pending, color: "text-yellow-400" },
          { label: "Live", value: stats.live, color: "text-orange-400" },
          { label: "Messages", value: stats.messages, color: "text-blue-400" },
          { label: "Users", value: stats.users, color: "text-green-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 px-2 py-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${tab === t.key ? "text-orange-400 border-b-2 border-orange-400" : "text-gray-400"}`}
          >
            {t.label}
            <span className={`text-xs rounded-full px-1.5 ${tab === t.key ? "bg-orange-500 text-white" : "bg-gray-700 text-gray-300"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      {(tab === "pending" || tab === "listings") && (
        <div className="flex gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="bg-gray-800 text-sm rounded px-2 py-1"
          >
            <option value="all">All markets</option>
            {markets.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {tab === "listings" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-800 text-sm rounded px-2 py-1"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto w-full space-y-3">
          {loadError && <p className="text-red-400 text-sm">Could not load everything: {loadError}</p>}
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : (
            <>
              {tab === "pending" &&
                (pending.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-2">✅</p>
                    <p>Nothing waiting for review</p>
                  </div>
                ) : (
                  pending.map(renderListing)
                ))}

              {tab === "listings" && allShown.map(renderListing)}

              {tab === "messages" &&
                messages.map((m) => (
                  <div key={m.id} className="bg-gray-800 rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-orange-400 text-xs font-semibold truncate">{m.properties?.title}</p>
                        {m.sender_name && <p className="text-white text-sm font-medium">{m.sender_name}</p>}
                        {m.sender_phone && <p className="text-gray-400 text-xs">📞 {m.sender_phone}</p>}
                        <p className="text-gray-300 text-sm mt-1">{m.message}</p>
                        <p className="text-gray-500 text-xs mt-1">{new Date(m.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        onClick={() => deleteMessage(m.id)}
                        className="text-red-400 hover:text-red-300 text-xs ml-3 flex-shrink-0"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}

              {tab === "demand" && (() => {
                const counts: Record<string, number> = {};
                requirements.forEach((r) => (r.areas || []).forEach((a: any) => { counts[a.name] = (counts[a.name] || 0) + 1; }));
                const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
                const shown = demandArea ? requirements.filter((r) => (r.areas || []).some((a: any) => a.name === demandArea)) : requirements;
                const inr = (n: number) => "₹" + Number(n).toLocaleString("en-IN");
                const csv = () => {
                  const rows = [["Name", "Phone", "Areas", "Radius km", "Type", "BHK", "Max rent", "Furnishing", "Move-in", "Tenant", "Notes", "Posted"]]
                    .concat(shown.map((r) => [r.name, r.phone, (r.areas || []).map((a: any) => a.name).join(" / "), r.radius_km, r.property_type,
                      (r.bhk || []).join("/"), r.budget_max, (r.furnishing || []).join("/"), r.move_in, r.tenant_type, r.notes, r.created_at?.slice(0, 10)]
                      .map((v) => v ?? "")));
                  const body = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
                  a.download = `easyhousehunt-demand-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                };
                return (
                  <div className="space-y-3">
                    <div className="bg-gray-800 rounded-xl p-4">
                      <p className="text-xs text-gray-400 mb-2">Most wanted areas (active requirements). Tap to filter.</p>
                      <div className="flex flex-wrap gap-2">
                        {top.map(([name, n]) => (
                          <button key={name} onClick={() => setDemandArea(demandArea === name ? "" : name)}
                            className={`text-xs px-2.5 py-1 rounded-full ${demandArea === name ? "bg-orange-500 text-white" : "bg-gray-700 text-gray-200"}`}>
                            {name} · {n}
                          </button>
                        ))}
                        {top.length === 0 && <span className="text-xs text-gray-500">No requirements yet.</span>}
                      </div>
                    </div>
                    {shown.length > 0 && (
                      <button onClick={csv} className="text-xs text-orange-400 hover:text-orange-300">⬇ Download {shown.length} as CSV</button>
                    )}
                    {shown.map((r) => (
                      <div key={r.id} className="bg-gray-800 rounded-xl p-4 text-sm">
                        <div className="flex justify-between gap-2">
                          <p className="font-semibold">{r.name || "Unnamed"}{r.phone ? <span className="text-gray-400 font-normal"> · {r.phone}</span> : null}</p>
                          <span className="text-xs text-gray-500 shrink-0">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        </div>
                        <p className="text-gray-300 mt-1">
                          {r.property_type === "Any" ? "Any type" : r.property_type}
                          {r.bhk?.length ? ` · ${r.bhk.map((b: number) => (b === 4 ? "4+" : b)).join("/")} BHK` : ""}
                          {r.budget_max ? ` · up to ${inr(r.budget_max)}` : ""}
                          {r.furnishing?.length ? ` · ${r.furnishing.join("/")}` : ""}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          📍 {(r.areas || []).map((a: any) => a.name).join(", ")} (within {r.radius_km} km)
                          {r.move_in ? ` · move-in ${new Date(r.move_in).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                          {r.tenant_type ? ` · ${r.tenant_type}` : ""}
                        </p>
                        {r.notes && <p className="text-gray-400 text-xs mt-1 italic">“{r.notes}”</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {tab === "users" &&
                users.map((u) => (
                  <div key={u.id} className="bg-gray-800 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {u.email?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{u.email}</p>
                      <div className="flex gap-2 mt-1">
                        {u.is_admin && (
                          <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full">Admin</span>
                        )}
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                          {u.role || "tenant"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {editListing && (
        <EditListingModal
          listing={editListing}
          adminMode={true}
          onClose={() => setEditListing(null)}
          onSaved={() => { setEditListing(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
