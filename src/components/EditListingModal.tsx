import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MAX_PHOTOS, uploadListingPhotos } from "@/lib/photos";
import { TENANT_TYPES, notifyMatches } from "@/lib/requirements";

interface EditProps {
  listing: any;
  onClose: () => void;
  onSaved: () => void;
  adminMode?: boolean;
}

const inp = "w-full bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500";

const isHttpUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);
const norm = (v: any) => (v === "" || v === undefined ? null : v);
const same = (a: any, b: any) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const toNum = (s: string) => {
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

export default function EditListingModal({ listing, onClose, onSaved, adminMode }: EditProps) {
  const { user } = useAuth();
  const [orig, setOrig] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    title: "", rent: "", deposit: "", bhk: "", area_sqft: "",
    furnishing: "", description: "", address: "", latitude: "", longitude: "", sale_price: "",
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [availableFrom, setAvailableFrom] = useState("");
  const [preferredTenants, setPreferredTenants] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [geoStatus, setGeoStatus] = useState("");
  const [geoFailed, setGeoFailed] = useState(false);

  const newPreviews = useMemo(() => newFiles.map((f) => URL.createObjectURL(f)), [newFiles]);
  useEffect(() => () => newPreviews.forEach((u) => URL.revokeObjectURL(u)), [newPreviews]);

  // Always load the full row, so a caller passing partial data can never cause fields to be blanked on save
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("properties")
        .select("*")
        .eq("id", listing.id)
        .single();
      if (cancelled) return;
      if (err || !data) {
        setLoadError(err?.message || "Could not load this listing.");
        return;
      }
      setOrig(data);
      setForm({
        title: data.title ?? "",
        rent: data.rent != null ? String(data.rent) : "",
        deposit: data.deposit != null ? String(data.deposit) : "",
        bhk: data.bhk != null ? String(data.bhk) : "",
        area_sqft: data.area_sqft != null ? String(data.area_sqft) : "",
        furnishing: data.furnishing ?? "",
        description: data.description ?? "",
        address: data.address ?? "",
        latitude: data.latitude != null ? String(data.latitude) : "",
        longitude: data.longitude != null ? String(data.longitude) : "",
        sale_price: data.sale_price != null ? String(data.sale_price) : "",
      });
      setPhotoUrls(((data.media_urls as unknown[]) || []).filter(isHttpUrl));
      setAvailableFrom((data as any).availability_date ?? "");
      setPreferredTenants((data as any).preferred_tenants ?? []);
    })();
    return () => { cancelled = true; };
  }, [listing.id]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const totalPhotos = photoUrls.length + newFiles.length;

  const handleGeocode = async () => {
    if (!form.address) return;
    setGeoStatus("Searching...");
    setGeoFailed(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address + ", Bangalore")}&format=json&limit=1`
      );
      const data = await res.json();
      if (data[0]) {
        set("latitude", data[0].lat);
        set("longitude", data[0].lon);
        setGeoStatus(`✓ Pinned: ${parseFloat(data[0].lat).toFixed(4)}, ${parseFloat(data[0].lon).toFixed(4)}`);
        setGeoFailed(false);
      } else {
        setGeoStatus("");
        setGeoFailed(true);
      }
    } catch {
      setGeoStatus("");
      setGeoFailed(true);
    }
  };

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type.startsWith("image/") && f.size < 25 * 1024 * 1024
    );
    setNewFiles((prev) => [...prev, ...files].slice(0, Math.max(0, MAX_PHOTOS - photoUrls.length)));
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!orig) return;
    setError("");

    if (orig.listing_type === "sale" && !(parseInt(form.sale_price) > 0)) {
      setError("Please enter the asking price.");
      return;
    }

    if (!adminMode && totalPhotos === 0) {
      setError("Please add at least one photo. Listings without photos can't be approved.");
      return;
    }

    setSaving(true);
    try {
      let urls = photoUrls;
      if (newFiles.length > 0) {
        const uploaded = await uploadListingPhotos(user?.id || orig.landlord_id, newFiles);
        urls = [...photoUrls, ...uploaded];
      }

      const next: Record<string, any> = {
        title: form.title.trim(),
        rent: orig.listing_type === "sale" ? orig.rent ?? 0 : parseInt(form.rent) || 0,
        sale_price: orig.listing_type === "sale" ? parseInt(form.sale_price) || null : orig.sale_price ?? null,
        deposit: parseInt(form.deposit) || null,
        bhk: form.bhk === "" ? null : parseInt(form.bhk),
        area_sqft: parseInt(form.area_sqft) || null,
        furnishing: form.furnishing || null,
        description: form.description.trim() || null,
        address: form.address.trim(),
        latitude: toNum(form.latitude),
        longitude: toNum(form.longitude),
        media_urls: urls,
      };
      // Only send the new fields if the database has them (keeps older databases working).
      if ("availability_date" in orig) next.availability_date = availableFrom || null;
      if ("preferred_tenants" in orig) next.preferred_tenants = orig.property_type === "PG" ? [] : preferredTenants;

      // only send what actually changed
      const changed: Record<string, any> = {};
      for (const k of Object.keys(next)) {
        const before = k === "media_urls" ? orig.media_urls || [] : orig[k];
        if (!same(next[k], before)) changed[k] = next[k];
      }

      if (Object.keys(changed).length === 0) {
        onSaved();
        return;
      }

      const { data, error: err } = await supabase
        .from("properties")
        .update(changed)
        .eq("id", orig.id)
        .select("id");

      if (err) throw err;
      if (!data || data.length === 0) throw new Error("You don't have permission to change this listing.");
      // Rent lowered, or dates/tenant preferences changed: re-check who this live listing now suits.
      const rentDropped = "rent" in changed && Number(changed.rent) < Number(orig.rent);
      if (orig.status === "approved" && (rentDropped || "availability_date" in changed || "preferred_tenants" in changed)) {
        notifyMatches(orig.id);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-bold text-base">
            {adminMode ? "⚙️ Fix Listing" : "✏️ Edit Listing"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loadError && <p className="text-red-400 text-sm">{loadError}</p>}
          {!orig && !loadError && <p className="text-gray-400 text-sm">Loading...</p>}

          {orig && (
            <>
              {/* Title */}
              <div>
                <label className="text-xs text-gray-400">Title</label>
                <input className={inp + " mt-1"} value={form.title} onChange={(e) => set("title", e.target.value)} />
              </div>

              {/* Price */}
              {orig.listing_type === "sale" ? (
                <div>
                  <label className="text-xs text-gray-400">Asking price (₹)</label>
                  <input type="number" className={inp + " mt-1"} value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Rent (₹/mo)</label>
                    <input type="number" className={inp + " mt-1"} value={form.rent} onChange={(e) => set("rent", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Deposit (₹)</label>
                    <input type="number" className={inp + " mt-1"} value={form.deposit} onChange={(e) => set("deposit", e.target.value)} />
                  </div>
                </div>
              )}

              {/* BHK + Area */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">BHK</label>
                  <select className={inp + " mt-1"} value={form.bhk} onChange={(e) => set("bhk", e.target.value)}>
                    <option value="">—</option>
                    {["1", "2", "3", "4", "5"].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Area (sqft)</label>
                  <input type="number" className={inp + " mt-1"} value={form.area_sqft} onChange={(e) => set("area_sqft", e.target.value)} />
                </div>
              </div>

              {/* Furnishing */}
              <div>
                <label className="text-xs text-gray-400">Furnishing</label>
                <div className="flex gap-2 mt-1">
                  {["Unfurnished", "Semi", "Fully Furnished"].map((f) => (
                    <button key={f} onClick={() => set("furnishing", f)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${form.furnishing === f ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      {f === "Fully Furnished" ? "Full" : f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability + preferred tenants (rentals) */}
              {orig?.listing_type !== "sale" && (
                <div>
                  <label className="text-xs text-gray-400">Available from</label>
                  <div className="flex gap-2 mt-1 items-center">
                    <button onClick={() => setAvailableFrom("")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border ${!availableFrom ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      Now
                    </button>
                    <input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className={inp} />
                  </div>
                </div>
              )}
              {orig?.listing_type !== "sale" && orig?.property_type !== "PG" && (
                <div>
                  <label className="text-xs text-gray-400">Preferred tenants (none = anyone)</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {TENANT_TYPES.map((t) => (
                      <button key={t} onClick={() => setPreferredTenants((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                        className={`py-1 px-2.5 rounded-full text-xs font-medium border ${preferredTenants.includes(t) ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-xs text-gray-400">Description</label>
                <textarea className={inp + " mt-1 h-20 resize-none"} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>

              {/* Photos */}
              <div>
                <label className="text-xs text-gray-400">Photos ({totalPhotos}/{MAX_PHOTOS})</label>
                <div className="flex gap-2 mt-1 overflow-x-auto pb-1">
                  {photoUrls.map((u) => (
                    <div key={u} className="relative flex-shrink-0">
                      <img src={u} alt="" loading="lazy" className="h-20 w-28 object-cover rounded-lg" />
                      <button
                        onClick={() => setPhotoUrls((prev) => prev.filter((x) => x !== u))}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-black rounded-full w-5 h-5 text-xs leading-5"
                        aria-label="Remove photo"
                      >✕</button>
                    </div>
                  ))}
                  {newPreviews.map((u, i) => (
                    <div key={u} className="relative flex-shrink-0">
                      <img src={u} alt="" className="h-20 w-28 object-cover rounded-lg ring-2 ring-orange-500" />
                      <button
                        onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-black rounded-full w-5 h-5 text-xs leading-5"
                        aria-label="Remove photo"
                      >✕</button>
                    </div>
                  ))}
                  {totalPhotos < MAX_PHOTOS && (
                    <label className="flex-shrink-0 h-20 w-28 border border-dashed border-gray-600 rounded-lg flex items-center justify-center text-xs text-gray-400 cursor-pointer hover:border-orange-500">
                      + Add photos
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddFiles} />
                    </label>
                  )}
                </div>
              </div>

              {/* Address + Pin */}
              <div>
                <label className="text-xs text-gray-400">Address</label>
                <div className="flex gap-2 mt-1">
                  <input className={inp + " flex-1"} value={form.address}
                    onChange={(e) => { set("address", e.target.value); setGeoFailed(false); setGeoStatus(""); }} />
                  <button onClick={handleGeocode} className="bg-orange-500 hover:bg-orange-600 px-3 rounded-lg text-xs font-medium whitespace-nowrap">
                    Pin 📍
                  </button>
                </div>
                {geoStatus && <p className="text-green-400 text-xs mt-1">{geoStatus}</p>}
              </div>

              {/* Location — always shown in admin mode or if no coords */}
              {(adminMode || !orig.latitude || geoFailed) && (
                <div className={`rounded-lg p-3 space-y-2 ${!orig.latitude ? "bg-red-900/30 border border-red-700" : "bg-gray-800"}`}>
                  {!orig.latitude && (
                    <p className="text-red-400 text-xs font-semibold">⚠️ No location set — listing won't show on map</p>
                  )}
                  <label className="text-xs text-gray-400 block">Coordinates</label>
                  <div className="flex gap-2">
                    <input className={inp + " flex-1"} placeholder="Latitude e.g. 13.0358"
                      value={form.latitude} onChange={(e) => set("latitude", e.target.value)} />
                    <input className={inp + " flex-1"} placeholder="Longitude e.g. 77.5970"
                      value={form.longitude} onChange={(e) => set("longitude", e.target.value)} />
                  </div>
                  <button
                    onClick={() => {
                      navigator.geolocation?.getCurrentPosition((pos) => {
                        set("latitude", String(pos.coords.latitude));
                        set("longitude", String(pos.coords.longitude));
                        setGeoStatus("✓ Using current location");
                      });
                    }}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-xs py-2 rounded-lg"
                  >
                    📱 Use Current Location
                  </button>
                  <p className="text-xs text-gray-500">
                    Or open <a href={`https://maps.google.com/maps?q=${encodeURIComponent(form.address)}`} target="_blank" rel="noreferrer" className="text-orange-400 underline">Google Maps</a> → search address → right click → "What's here?" → copy coords
                  </p>
                </div>
              )}

              {!adminMode && (
                <p className="text-xs text-gray-500">
                  Changing the price, address, photos or description sends an approved listing back for review.
                  It stays off the map until it is approved again.
                </p>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex justify-between">
          <button onClick={onClose} className="text-gray-400 hover:text-white px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !orig}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-6 py-2 rounded-lg font-semibold text-sm">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
