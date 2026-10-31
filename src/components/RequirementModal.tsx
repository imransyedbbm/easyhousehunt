import { useMemo, useState } from "react";
import { LOCALITIES } from "@/data/localities";
import { useAuth } from "@/hooks/useAuth";
import { selectProperty } from "@/lib/searchStore";
import { formatPrice } from "@/lib/price";
import { Area, Requirement, RequirementInput, fits, useMyRequirements } from "@/lib/requirements";
import type { Property } from "@/types/property";

const TYPES = ["Any", "Apartment", "Independent House", "PG"] as const;
const BHKS = [1, 2, 3, 4];
const FURNISHING = ["Unfurnished", "Semi", "Fully Furnished"];
const TENANT_TYPES = ["Family", "Working professional(s)", "Bachelor(s)", "Student(s)"];
const RADII = [1, 2, 3, 5, 8];

const blank = (name = ""): RequirementInput => ({
  name, phone: "", areas: [], radius_km: 3, property_type: "Any", bhk: [], budget_max: null,
  furnishing: [], move_in: null, tenant_type: null, notes: "", status: "active",
});

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    on ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"
  }`;
const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500";
const label = "text-xs font-semibold text-gray-400 uppercase tracking-wide";

function summary(r: RequirementInput) {
  const parts = [
    r.property_type === "Any" ? null : r.property_type === "Independent House" ? "House" : r.property_type,
    r.bhk.length ? r.bhk.map((b) => (b === 4 ? "4+" : b)).join("/") + " BHK" : null,
    r.budget_max ? `up to ₹${r.budget_max.toLocaleString("en-IN")}` : null,
  ].filter(Boolean);
  return `${parts.join(" · ") || "Any home"} near ${r.areas.map((a) => a.name).join(", ")}`;
}

export default function RequirementModal({ onClose, properties }: { onClose: () => void; properties: Property[] }) {
  const { user } = useAuth();
  const { items, loading, save, setStatus } = useMyRequirements();
  const [editing, setEditing] = useState<{ id?: string; form: RequirementInput } | null>(null);

  // Open straight into the form for a first-timer.
  const showForm = editing ?? (!loading && items.length === 0
    ? { form: blank((user?.user_metadata?.full_name as string) || "") } : null);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-gray-900 text-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="font-bold text-lg">📝 {showForm ? (showForm.id ? "Edit requirement" : "Post your requirement") : "My requirements"}</h2>
            <p className="text-xs text-gray-400">Tell us what you need. We'll alert you when a matching home is listed.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl" aria-label="Close">✕</button>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-gray-400">Loading…</p>
        ) : showForm ? (
          <RequirementForm
            key={showForm.id ?? "new"}
            initial={showForm.form}
            properties={properties}
            canCancel={items.length > 0}
            onCancel={() => setEditing(null)}
            onSave={async (f) => {
              const err = await save(f, showForm.id);
              if (!err) setEditing(null);
              return err;
            }}
          />
        ) : (
          <RequirementList
            items={items}
            properties={properties}
            onNew={() => setEditing({ form: blank(items[0]?.name || "") })}
            onEdit={(r) => setEditing({ id: r.id, form: { ...r, notes: r.notes ?? "" } })}
            onStatus={setStatus}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function RequirementList({ items, properties, onNew, onEdit, onStatus, onClose }: {
  items: Requirement[]; properties: Property[]; onNew: () => void; onEdit: (r: Requirement) => void;
  onStatus: (id: string, s: Requirement["status"]) => Promise<string | null>; onClose: () => void;
}) {
  return (
    <div className="overflow-y-auto p-5 space-y-3">
      {items.map((r) => {
        const matches = properties.filter((p) => fits(r, p));
        return (
          <div key={r.id} className="rounded-xl border border-gray-700 bg-gray-800/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm">{summary(r)}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${r.status === "active" ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-300"}`}>
                {r.status === "active" ? "ALERTS ON" : "PAUSED"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Within {r.radius_km} km{r.move_in ? ` · move-in ${new Date(r.move_in).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
              {r.furnishing.length ? ` · ${r.furnishing.join("/")}` : ""}
            </p>
            <MatchList matches={matches} onPick={onClose} />
            <div className="flex gap-4 mt-3 text-xs">
              <button onClick={() => onEdit(r)} className="text-orange-400 hover:text-orange-300">Edit</button>
              <button onClick={() => onStatus(r.id, r.status === "active" ? "paused" : "active").then((e) => e && alert(e))} className="text-gray-300 hover:text-white">
                {r.status === "active" ? "Pause alerts" : "Resume alerts"}
              </button>
              <button onClick={() => confirm("Close this requirement? You'll stop getting alerts for it.") && onStatus(r.id, "closed")} className="text-red-300 hover:text-red-200">
                Found a home / close
              </button>
            </div>
          </div>
        );
      })}
      {items.length < 3 && (
        <button onClick={onNew} className="w-full border border-dashed border-gray-600 hover:border-orange-500 rounded-xl py-3 text-sm text-gray-300 hover:text-white">
          + Add another requirement
        </button>
      )}
    </div>
  );
}

function MatchList({ matches, onPick }: { matches: Property[]; onPick?: () => void }) {
  if (!matches.length) {
    return <p className="text-xs text-gray-500 mt-2">No live homes match yet. We'll email you when one is listed.</p>;
  }
  return (
    <div className="mt-3">
      <p className="text-xs text-green-300 font-semibold mb-1.5">🏠 {matches.length} home{matches.length > 1 ? "s" : ""} match right now</p>
      <div className="space-y-1.5">
        {matches.slice(0, 4).map((p) => (
          <button key={p.id} disabled={!onPick} onClick={() => { onPick?.(); selectProperty(p); }}
            className="w-full text-left bg-gray-900 enabled:hover:bg-gray-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs truncate">{p.title}{p.availability === "reserved" ? " · Reserved" : ""}</span>
            <span className="text-xs text-green-400 font-semibold shrink-0">{formatPrice(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RequirementForm({ initial, properties, canCancel, onCancel, onSave }: {
  initial: RequirementInput; properties: Property[]; canCancel: boolean;
  onCancel: () => void; onSave: (f: RequirementInput) => Promise<string | null>;
}) {
  const [f, setF] = useState<RequirementInput>(initial);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RequirementInput>(k: K, v: RequirementInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return LOCALITIES.filter((l) =>
      !f.areas.some((a) => a.name === l.name) &&
      (l.name.toLowerCase().includes(s) || l.aliases?.some((x) => x.toLowerCase().includes(s)))
    ).slice(0, 6);
  }, [q, f.areas]);

  const addArea = (a: Area) => { if (f.areas.length < 5) set("areas", [...f.areas, { name: a.name, lat: a.lat, lng: a.lng }]); setQ(""); };
  const matches = f.areas.length ? properties.filter((p) => fits(f, p)) : [];

  const submit = async () => {
    setError(null);
    if (!f.areas.length) return setError("Add at least one area you'd like to live in.");
    if (f.phone && !/^[+\d][\d\s-]{7,15}$/.test(f.phone.trim())) return setError("Enter a valid phone number, or leave it blank.");
    setSaving(true);
    const err = await onSave({ ...f, name: f.name?.trim() || null, phone: f.phone?.trim() || null, notes: f.notes?.trim() || null });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <>
      <div className="overflow-y-auto p-5 space-y-5">
        {/* Areas */}
        <div>
          <p className={label}>Where? <span className="normal-case font-normal text-gray-500">(up to 5 areas)</span></p>
          <div className="flex flex-wrap gap-2 mt-2">
            {f.areas.map((a) => (
              <span key={a.name} className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-200 text-xs px-2.5 py-1 rounded-full">
                {a.name}
                <button onClick={() => set("areas", f.areas.filter((x) => x.name !== a.name))} className="hover:text-white" aria-label={`Remove ${a.name}`}>✕</button>
              </span>
            ))}
          </div>
          {f.areas.length < 5 && (
            <div className="relative mt-2">
              <input className={inp} placeholder="Type an area, e.g. Indiranagar, HSR Layout" value={q} onChange={(e) => setQ(e.target.value)} />
              {suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
                  {suggestions.map((l) => (
                    <button key={l.name} onClick={() => addArea(l)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">{l.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-gray-400">Within</span>
            {RADII.map((r) => <button key={r} onClick={() => set("radius_km", r)} className={chip(f.radius_km === r)}>{r} km</button>)}
          </div>
        </div>

        {/* Type + BHK */}
        <div>
          <p className={label}>What kind of home?</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {TYPES.map((t) => <button key={t} onClick={() => set("property_type", t)} className={chip(f.property_type === t)}>{t === "Independent House" ? "House" : t}</button>)}
          </div>
          {f.property_type !== "PG" && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {BHKS.map((b) => <button key={b} onClick={() => set("bhk", toggle(f.bhk, b))} className={chip(f.bhk.includes(b))}>{b === 4 ? "4+" : b} BHK</button>)}
            </div>
          )}
        </div>

        {/* Budget + move-in */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={label}>Max rent / month</p>
            <div className="relative mt-2">
              <span className="absolute left-3 top-2 text-sm text-gray-400">₹</span>
              <input type="number" inputMode="numeric" min={1000} step={1000} className={inp + " pl-7"} placeholder="35000"
                value={f.budget_max ?? ""} onChange={(e) => set("budget_max", e.target.value ? Math.round(Number(e.target.value)) : null)} />
            </div>
          </div>
          <div>
            <p className={label}>Move-in from</p>
            <input type="date" className={inp + " mt-2"} value={f.move_in ?? ""} onChange={(e) => set("move_in", e.target.value || null)} />
          </div>
        </div>

        {/* Furnishing + who */}
        <div>
          <p className={label}>Furnishing <span className="normal-case font-normal text-gray-500">(none selected = any)</span></p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {FURNISHING.map((x) => <button key={x} onClick={() => set("furnishing", toggle(f.furnishing, x))} className={chip(f.furnishing.includes(x))}>{x === "Semi" ? "Semi-furnished" : x}</button>)}
          </div>
        </div>
        <div>
          <p className={label}>Who will live there?</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {TENANT_TYPES.map((x) => <button key={x} onClick={() => set("tenant_type", f.tenant_type === x ? null : x)} className={chip(f.tenant_type === x)}>{x}</button>)}
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={label}>Your name</p>
            <input className={inp + " mt-2"} maxLength={100} value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <p className={label}>Phone <span className="normal-case font-normal text-gray-500">(optional)</span></p>
            <input className={inp + " mt-2"} inputMode="tel" maxLength={20} placeholder="98765 43210" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
        <div>
          <p className={label}>Anything else?</p>
          <textarea className={inp + " mt-2 h-16 resize-none"} maxLength={1000} placeholder="e.g. pet-friendly, near metro, 2 parking slots"
            value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {f.areas.length > 0 && <div className="rounded-xl bg-gray-800/60 p-3"><MatchList matches={matches} /></div>}
        <p className="text-[11px] text-gray-500">Your phone number is never shown publicly. Owners only see how many people are looking, not who.</p>
      </div>

      <div className="px-5 py-4 border-t border-gray-800">
        {error && <p className="text-xs text-red-300 mb-2">{error}</p>}
        <div className="flex gap-2">
          {canCancel && <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-white">Back</button>}
          <button onClick={submit} disabled={saving} className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 py-3 rounded-xl font-semibold">
            {saving ? "Saving…" : "🔔 Save & alert me"}
          </button>
        </div>
      </div>
    </>
  );
}
