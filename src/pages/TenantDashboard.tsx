import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CompareHomes from "@/components/CompareHomes";
import VisitsPanel from "@/components/VisitsPanel";
import { formatPrice } from "@/lib/price";
import { httpPhotos } from "@/lib/photos";
import { toast } from "sonner";
import { shortlistUrl } from "@/lib/invite";

export default function TenantDashboard({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [tab, setTab] = useState<"saved" | "visits" | "enquiries" | "recent">("saved");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [visitCount, setVisitCount] = useState(0);
  const togglePick = (id: string) =>
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) { toast("You can compare up to 3 homes"); return prev; }
      return [...prev, id];
    });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);

    const { data: saves } = await supabase
      .from("saved_properties")
      .select("*, properties(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const { data: enqs } = await supabase
      .from("messages")
      .select("*, properties(title)")
      .eq("sender_id", user.id)
      .order("created_at", { ascending: false });

    setSaved(saves || []);
    setEnquiries(enqs || []);
    setLoading(false);
  };

  const unsaveProperty = async (id: string) => {
    await supabase.from("saved_properties").delete().eq("id", id);
    setSaved(prev => prev.filter(s => s.id !== id));
  };

  const TABS = [
    { key: "saved", label: "Saved", count: saved.length },
    { key: "visits", label: "Visits", count: visitCount },
    { key: "enquiries", label: "Enquiries", count: enquiries.length },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
        <div>
          <h1 className="font-bold text-lg">My Dashboard</h1>
          <p className="text-xs text-gray-400">{user?.email}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
      </div>

      <div className="flex border-b border-gray-800">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${tab === t.key ? "text-orange-400 border-b-2 border-orange-400" : "text-gray-400"}`}>
            {t.label}
            <span className={`text-xs rounded-full px-1.5 ${tab === t.key ? "bg-orange-500 text-white" : "bg-gray-700 text-gray-300"}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {comparing && (
        <CompareHomes
          homes={saved.filter((s) => picked.includes(s.id)).map((s) => s.properties)}
          onClose={() => setComparing(false)}
        />
      )}
      {tab === "saved" && picked.length >= 2 && !comparing && (
        <button onClick={() => setComparing(true)}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-orange-500 px-6 py-3 font-semibold text-white shadow-xl hover:bg-orange-600">
          Compare {picked.length} homes
        </button>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? <p className="text-gray-400">Loading...</p> : (
          <>
            {tab === "saved" && (
              saved.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">🔖</p>
                  <p>No saved properties yet</p>
                  <p className="text-sm mt-1">Tap the bookmark on any listing to save it</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const pool = saved.filter((s) => s.properties?.share_code && s.properties.status === "approved" && s.properties.availability !== "let_out");
                    const chosen = picked.length ? pool.filter((s) => picked.includes(s.id)) : pool;
                    if (!chosen.length) return null;
                    const url = shortlistUrl(chosen.map((s) => s.properties.share_code));
                    return (
                      <a href={`https://wa.me/?text=${encodeURIComponent(`Have a look at these homes I shortlisted:\n${url}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-600">
                        Share {picked.length ? `${chosen.length} selected` : `all ${chosen.length}`} with family on WhatsApp
                      </a>
                    );
                  })()}
                  <p className="text-xs text-gray-400">Tick 2 or 3 homes to compare them side by side, or to share just those.</p>
                  {saved.filter((s) => s.properties).map((s) => {
                    const p = s.properties;
                    const ph = httpPhotos(p.media_urls)[0];
                    const on = picked.includes(s.id);
                    const gone = p.availability === "let_out" || p.status !== "approved";
                    return (
                      <div key={s.id} className={`flex gap-3 rounded-xl bg-gray-800 p-3 ${on ? "ring-2 ring-orange-500" : ""} ${gone ? "opacity-60" : ""}`}>
                        <label className="flex items-start pt-1">
                          <input type="checkbox" checked={on} onChange={() => togglePick(s.id)} className="h-4 w-4 accent-orange-500" aria-label={`Compare ${p.title}`} />
                        </label>
                        {ph ? <img src={ph} alt="" className="h-16 w-20 flex-shrink-0 rounded-lg object-cover" /> : <div className="h-16 w-20 flex-shrink-0 rounded-lg bg-gray-700" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{p.title}</p>
                          <p className="font-bold text-green-400">{formatPrice(p)}</p>
                          <p className="truncate text-xs text-gray-400">{[p.bhk ? `${p.bhk} BHK` : p.property_type, p.furnishing].filter(Boolean).join(" · ")}</p>
                          {gone && <p className="text-xs text-red-300">No longer available</p>}
                        </div>
                        <button onClick={() => { unsaveProperty(s.id); setPicked((x) => x.filter((y) => y !== s.id)); }} aria-label="Remove from saved" className="ml-1 self-start text-lg text-gray-500 hover:text-red-400">🔖</button>
                      </div>
                    );
                  })}
                </>
              )
            )}

            {tab === "visits" && user && <VisitsPanel userId={user.id} onCount={setVisitCount} />}

            {tab === "enquiries" && (
              enquiries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">💬</p>
                  <p>No enquiries sent yet</p>
                </div>
              ) : enquiries.map(e => (
                <div key={e.id} className="bg-gray-800 rounded-xl p-4">
                  <p className="text-orange-400 text-xs font-semibold">{e.properties?.title}</p>
                  <p className="text-gray-300 text-sm mt-1">{e.message}</p>
                  <p className="text-gray-500 text-xs mt-1">{new Date(e.created_at).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
