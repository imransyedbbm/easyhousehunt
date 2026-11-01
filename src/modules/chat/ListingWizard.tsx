import { COMMERCIAL_TYPES, furnishingOptions, isCommercial } from "@/lib/commercial";
import { uploadListingPhotos } from "@/lib/photos";
import LocationPicker from "@/components/map/LocationPicker";
import { formatSalePrice } from "@/lib/price";
import { SALE_ENABLED } from "@/lib/features";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AuthModal from "@/components/ui/AuthModal";
import { TENANT_TYPES, demandCount } from "@/lib/requirements";
import { hasPhone, maskPhones } from "@/lib/contact";

const PROJECTS = [
  "Embassy Lake Terraces", "RMZ Latitude", "Godrej Woodman Estate",
  "SNN Clermont", "Karle Zenith Residences", "Prestige Lakeside Habitat",
  "Sobha City", "Nikoo Homes", "Brigade Cornerstone Utopia",
  "Purva Atmosphere", "Vario Homes", "Other",
];

const AMENITY_OPTIONS = [
  "Gym", "Swimming Pool", "Parking", "Security", "Power Backup",
  "Lift", "Club House", "Garden", "CCTV", "Intercom",
  "Water Supply 24/7", "Gas Pipeline", "Pet Friendly", "Visitor Parking",
];

const inp = "w-full bg-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500";

export default function ListingWizard({ onClose, onSuccess }: {
  onClose?: () => void;
  onSuccess?: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [showAuth, setShowAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [customProject, setCustomProject] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [geoStatus, setGeoStatus] = useState("");
  const [geoFailed, setGeoFailed] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [findSignal, setFindSignal] = useState(0);
  const [listingType, setListingType] = useState<"rent" | "sale">("rent");
  const [availableFrom, setAvailableFrom] = useState("");          // "" = available now
  const [preferredTenants, setPreferredTenants] = useState<string[]>([]); // [] = anyone
  // Admins can post for an owner who has no account; the owner's phone stays private.
  const [isAdmin, setIsAdmin] = useState(false);
  const [onBehalf, setOnBehalf] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!(data as any)?.is_admin));
  }, [user?.id]);
  const photosOptional = isAdmin && onBehalf;
  const ownerPhoneOk = !onBehalf || ownerPhone.replace(/\D/g, "").length >= 10;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    address: "", rent: "", deposit: "", bhk: "2",
    area_sqft: "", furnishing: "Semi", description: "",
    latitude: "", longitude: "", property_type: "Apartment", occupancy: "Single",
    commercial_type: "",
  });
  const commercial = isCommercial(form.property_type);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Title: the project for apartments; a name typed by the owner for PGs and houses
  const listingTitle = () =>
    (form.property_type === "Apartment"
      ? (selectedProject === "Other" ? customProject : selectedProject)
      : customProject
    ).trim();

  const chooseListingType = (t: "rent" | "sale") => {
    if (t === listingType) return;
    setListingType(t);
    if (t === "sale" && form.property_type === "PG") {
      set("property_type", "Apartment");
      setSelectedProject("");
      setCustomProject("");
    }
  };

  const chooseType = (t: string) => {
    if (t === form.property_type) return;
    set("property_type", t);
    if (isCommercial(t) !== isCommercial(form.property_type)) set("furnishing", isCommercial(t) ? "Bare shell" : "Semi");
    setSelectedProject("");
    setCustomProject("");
  };

  const toggleAmenity = (a: string) =>
    setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.type.startsWith("image/") && f.size < 25 * 1024 * 1024); // compressed before upload
    setPhotos(prev => [...prev, ...valid].slice(0, 6)); // max 6 photos
  };

  const removePhoto = (i: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i));
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0) return [];
    setUploading(true);
    try {
      return await uploadListingPhotos(user!.id, photos);
    } finally {
      setUploading(false);
    }
  };

  const saveProperty = async () => {
    if (!user) return;
    setSaving(true);
    setError("");

    let uploadedUrls: string[] = [];
    try {
      uploadedUrls = await uploadPhotos();
    } catch (e: any) {
      setSaving(false);
      setError(e?.message || "Photo upload failed. Please try again.");
      return;
    }

    if (!ownerPhoneOk) { setSaving(false); setError("Enter the owner's 10-digit phone number."); return; }
    const { data: created, error: err } = await supabase.from("properties").insert({
      market: "india",
      title: listingTitle(),
      address: form.address,
      listing_type: listingType,
      rent: listingType === "sale" ? 0 : parseInt(form.rent) || 0,
      sale_price: listingType === "sale" ? Math.round(Number(form.rent)) || null : null,
      deposit: listingType === "sale" ? null : parseInt(form.deposit) || null,
      bhk: commercial ? null : parseInt(form.bhk),
      area_sqft: parseInt(form.area_sqft) || null,
      furnishing: form.furnishing,
      description: maskPhones(form.description),
      latitude: parseFloat(form.latitude) || null,
      longitude: parseFloat(form.longitude) || null,
      amenities,
      media_urls: uploadedUrls,
      landlord_id: user.id,
      property_type: form.property_type,
      ...(commercial ? { commercial_type: form.commercial_type } : {}),
      occupancy: form.property_type === "PG" ? form.occupancy : null,
      gender_preference: form.property_type === "PG" ? form.gender_preference : null,
      meals_included: form.property_type === "PG" ? form.meals_included === "true" : null,
      bathroom_type: form.property_type === "PG" ? form.bathroom_type : null,
      ...(listingType === "rent" ? {
        availability_date: availableFrom || null,
        preferred_tenants: form.property_type === "PG" || commercial ? [] : preferredTenants,
      } : {}),
    }).select("id").single();

    if (!err && onBehalf && created?.id) {
      const { error: cErr } = await (supabase as any).from("listing_owner_contacts").insert({
        property_id: created.id, owner_name: ownerName.trim() || null, owner_phone: ownerPhone.trim(),
      });
      if (cErr) { setSaving(false); setError("Listing saved, but the owner's phone could not be stored: " + cErr.message); return; }
    }

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess?.();
  };

  // Show owners how many tenants want a home like theirs (counts only).
  const [demand, setDemand] = useState<number | null>(null);
  useEffect(() => {
    if (step !== 5 || listingType === "sale" || !form.latitude || !form.longitude) return;
    demandCount({
      lat: Number(form.latitude), lng: Number(form.longitude),
      propertyType: form.property_type, bhk: form.property_type === "PG" || commercial ? null : parseInt(form.bhk) || null,
      rent: parseInt(form.rent) || null, furnishing: form.furnishing,
      availableFrom: availableFrom || null, preferredTenants: form.property_type === "PG" ? [] : preferredTenants,
    }).then(setDemand);
  }, [step]);

  const handleSubmit = async () => {
    if (!user) { setShowAuth(true); return; }
    await saveProperty();
  };

  useEffect(() => {
    if (user && showAuth) { setShowAuth(false); saveProperty(); }
  }, [user]);

  const STEPS = ["Property", "Pricing", "Details", "Amenities", "Photos"];

  const step1Missing = () => {
    const missing: string[] = [];
    if (form.property_type === "Apartment") {
      if (!selectedProject) missing.push("choose the apartment");
      else if (selectedProject === "Other" && !customProject.trim()) missing.push("enter the apartment name");
    } else if (!customProject.trim()) {
      missing.push(form.property_type === "PG" ? "enter the PG name" : "enter a listing title");
    }
    if (commercial && !form.commercial_type) missing.push("choose the type of space");
    if (!form.address.trim()) missing.push("enter the address");
    if (!form.latitude || !form.longitude) missing.push("drop the pin on the map");
    return missing;
  };

  const canNext = () => {
    if (step === 1) return step1Missing().length === 0;
    if (step === 2) return (listingType === "sale" ? Number(form.rent) > 0 : !!form.rent) && (!commercial || Number(form.area_sqft) > 0);
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-lg">List Your Property</h2>
          {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>}
        </div>

        {/* Progress */}
        <div className="flex px-6 pt-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i < step ? "bg-orange-500" : "bg-gray-700"}`} />
              <p className={`text-xs mt-1 ${i + 1 === step ? "text-orange-400" : "text-gray-500"}`}>{s}</p>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Step 1: Property + Address */}
          {step === 1 && (
            <>
              {SALE_ENABLED && (
                <div>
                  <label className="text-sm text-gray-400">I want to *</label>
                  <div className="flex gap-2 mt-1">
                    {(["rent", "sale"] as const).map(t => (
                      <button key={t} onClick={() => chooseListingType(t)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${listingType === t ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                        {t === "rent" ? "🏠 Rent it out" : "💰 Sell it"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400">Property Type *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {["Apartment", "Independent House", "PG", "Commercial"].filter(t => !(listingType === "sale" && t === "PG")).map(t => (
                    <button key={t} onClick={() => chooseType(t)}
                      className={`py-2 rounded-lg text-sm font-medium border ${form.property_type === t ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      {t === "Commercial" ? "🏢 Commercial" : t}
                    </button>
                  ))}
                </div>
              </div>

              {form.property_type === "Apartment" && (
                <>
                  <div>
                    <label className="text-sm text-gray-400">Apartment / Project *</label>
                    <select
                      className={inp + " mt-1"}
                      value={selectedProject}
                      onChange={e => {
                        const v = e.target.value;
                        setSelectedProject(v);
                        if (v && v !== "Other" && !form.latitude) setFindSignal(n => n + 1);
                      }}
                    >
                      <option value="">Select...</option>
                      {PROJECTS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  {selectedProject === "Other" && (
                    <div>
                      <label className="text-sm text-gray-400">Apartment Name *</label>
                      <input className={inp + " mt-1"} placeholder="Enter name" value={customProject} onChange={e => setCustomProject(e.target.value)} />
                    </div>
                  )}
                </>
              )}

              {form.property_type === "PG" && (
                <div>
                  <label className="text-sm text-gray-400">PG Name *</label>
                  <input className={inp + " mt-1"} placeholder="e.g. Sri Sai PG, Rajajinagar" value={customProject} onChange={e => setCustomProject(e.target.value)} />
                </div>
              )}

              {commercial && (
                <>
                  <div>
                    <label className="text-sm text-gray-400">Type of space *</label>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {COMMERCIAL_TYPES.map(c => (
                        <button key={c} onClick={() => set("commercial_type", c)}
                          className={`py-1.5 px-3 rounded-full text-xs font-medium border ${form.commercial_type === c ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Listing Title *</label>
                    <input className={inp + " mt-1"} placeholder="e.g. 2,000 sq ft office, Koramangala 80 Ft Road" value={customProject} onChange={e => setCustomProject(e.target.value)} />
                  </div>
                </>
              )}

              {form.property_type === "Independent House" && (
                <div>
                  <label className="text-sm text-gray-400">Listing Title *</label>
                  <input className={inp + " mt-1"} placeholder="e.g. 3 BHK independent house, Hebbal" value={customProject} onChange={e => setCustomProject(e.target.value)} />
                </div>
              )}

              <div>
                <label className="text-sm text-gray-400">
                  {form.property_type === "Apartment" ? "Tower / flat number and address *" : "Full address *"}
                </label>
                <input
                  className={inp + " mt-1"}
                  placeholder={form.property_type === "Apartment" ? "e.g. Tower B, Flat 302, Hebbal, Bangalore 560024" : "e.g. 12, 3rd Cross, Hebbal, Bangalore 560024"}
                  value={form.address}
                  onChange={e => set("address", e.target.value)}
                  onBlur={() => { if (!form.latitude && form.address.trim().length >= 8) setFindSignal(n => n + 1); }}
                />
              </div>

              <LocationPicker
                lat={form.latitude}
                lng={form.longitude}
                onChange={(la, ln) => { set("latitude", la.toFixed(6)); set("longitude", ln.toFixed(6)); }}
                searchText={form.address}
                hint={form.property_type === "Apartment" ? listingTitle() : ""}
                findSignal={findSignal}
              />

              {!canNext() && (
                <p className="text-xs text-yellow-300">To continue: {step1Missing().join(", ")}.</p>
              )}
            </>
          )}

          {/* Step 2: Pricing */}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400">{listingType === "sale" ? "Asking price (₹) *" : "Monthly Rent (₹) *"}</label>
                <input type="number" className={inp + " mt-1"} placeholder={listingType === "sale" ? "e.g. 8500000" : "e.g. 35000"} value={form.rent} onChange={e => set("rent", e.target.value)} />
                {listingType === "sale" && Number(form.rent) > 0 && (
                  <p className="mt-1 text-xs text-green-400">{formatSalePrice(Number(form.rent))}</p>
                )}
              </div>
              <div>
                {listingType === "rent" && <label className="text-sm text-gray-400">Deposit (₹)</label>}
                {listingType === "rent" && <input type="number" className={inp + " mt-1"} placeholder="e.g. 100000" value={form.deposit} onChange={e => set("deposit", e.target.value)} />}
              </div>
              <div>
                {commercial ? null : form.property_type === "PG" ? (
                  <>
                    <label className="text-sm text-gray-400">Occupancy *</label>
                    <select className={inp + " mt-1"} value={form.occupancy} onChange={e => set("occupancy", e.target.value)}>
                      {["Single", "Double", "Triple"].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="text-sm text-gray-400">BHK *</label>
                    <select className={inp + " mt-1"} value={form.bhk} onChange={e => set("bhk", e.target.value)}>
                      {["1","2","3","4","5"].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </>
                )}
              </div>
              <div>
                <label className="text-sm text-gray-400">Area (sqft){commercial ? " *" : ""}</label>
                <input type="number" className={inp + " mt-1"} placeholder="e.g. 1200" value={form.area_sqft} onChange={e => set("area_sqft", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <>
              <div>
                <label className="text-sm text-gray-400">Furnishing</label>
                <div className="flex gap-2 mt-2">
                  {furnishingOptions(form.property_type).map(f => (
                    <button key={f} onClick={() => set("furnishing", f)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.furnishing === f ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      {f === "Fully Furnished" ? "Full" : f}
                    </button>
                  ))}
                </div>
              </div>
              {listingType === "rent" && (
                <div>
                  <label className="text-sm text-gray-400">Available from</label>
                  <div className="flex gap-2 mt-2 items-center">
                    <button onClick={() => setAvailableFrom("")}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border ${!availableFrom ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                      Now
                    </button>
                    <input type="date" min={new Date().toISOString().slice(0, 10)} value={availableFrom}
                      onChange={e => setAvailableFrom(e.target.value)}
                      className={`flex-1 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white ${availableFrom ? "border-orange-500" : "border-gray-600"}`} />
                  </div>
                </div>
              )}
              {listingType === "rent" && form.property_type !== "PG" && !commercial && (
                <div>
                  <label className="text-sm text-gray-400">Preferred tenants <span className="text-gray-500 text-xs">(leave empty for anyone)</span></label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {TENANT_TYPES.map(t => (
                      <button key={t} onClick={() => setPreferredTenants(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                        className={`py-1.5 px-3 rounded-full text-xs font-medium border ${preferredTenants.includes(t) ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.property_type === "PG" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-400">Gender Preference</label>
                    <div className="flex gap-2 mt-2">
                      {["Any", "Male Only", "Female Only"].map(g => (
                        <button key={g} onClick={() => set("gender_preference", g)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.gender_preference === g ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Bathroom</label>
                    <div className="flex gap-2 mt-2">
                      {["Shared", "Attached"].map(b => (
                        <button key={b} onClick={() => set("bathroom_type", b)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.bathroom_type === b ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Meals Included</label>
                    <div className="flex gap-2 mt-2">
                      {[["true","Yes ✓"],["false","No ✗"]].map(([val, label]) => (
                        <button key={val} onClick={() => set("meals_included", val)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.meals_included === val ? "bg-orange-500 border-orange-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400">Description</label>
                <textarea className={inp + " mt-1 h-28 resize-none"} placeholder="Lake view, quiet floor, near metro..." value={form.description} onChange={e => set("description", e.target.value)} />
                {hasPhone(form.description) && (
                  <p className="text-xs text-yellow-300 mt-1">Phone numbers are hidden from the public listing. Tenants will contact you through chat.</p>
                )}
              </div>
            </>
          )}

          {/* Step 4: Amenities */}
          {step === 4 && (
            <div>
              <label className="text-sm text-gray-400 mb-3 block">Select all that apply</label>
              <div className="grid grid-cols-2 gap-2">
                {AMENITY_OPTIONS.map(a => (
                  <button key={a} onClick={() => toggleAmenity(a)}
                    className={`py-2 px-3 rounded-lg text-sm text-left border ${amenities.includes(a) ? "bg-orange-500/20 border-orange-500 text-orange-300" : "bg-gray-800 border-gray-600 text-gray-300"}`}>
                    {amenities.includes(a) ? "✓ " : ""}{a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Photos */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Photos <span className="text-gray-500">(optional, max 6)</span></label>
                <p className="text-xs text-gray-500 mb-3">Good photos get 3x more enquiries. Add photos of living room, bedroom, kitchen, bathroom.</p>

                {/* Upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative aspect-square">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt=""
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 6 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-orange-500 hover:text-orange-400"
                    >
                      <span className="text-2xl">📷</span>
                      <span className="text-xs mt-1">Add Photo</span>
                    </button>
                  )}
                </div>

                {/* Source hint */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.removeAttribute("capture");
                        fileInputRef.current.click();
                      }
                    }}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg py-2 text-xs text-gray-300 flex items-center justify-center gap-1"
                  >
                    🖼️ From Gallery
                  </button>
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute("capture", "environment");
                        fileInputRef.current.click();
                      }
                    }}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg py-2 text-xs text-gray-300 flex items-center justify-center gap-1"
                  >
                    📸 Take Photo
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div className="rounded-lg border border-purple-700/60 bg-purple-900/20 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-purple-200">
                    <input type="checkbox" className="accent-purple-500" checked={onBehalf} onChange={e => setOnBehalf(e.target.checked)} />
                    <span><b>Admin:</b> posting on behalf of an owner</span>
                  </label>
                  {onBehalf && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inp} placeholder="Owner name" maxLength={100} value={ownerName} onChange={e => setOwnerName(e.target.value)} />
                        <input className={inp} placeholder="Owner phone *" inputMode="tel" maxLength={20} value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} />
                      </div>
                      <p className="text-[11px] text-purple-300/80">Only admins can see this number. Tenants' chats come to your inbox. Photos are optional.</p>
                    </>
                  )}
                </div>
              )}

              {demand != null && demand > 0 && (
                <div className="rounded-lg bg-green-900/30 border border-green-700/50 p-3 text-xs text-green-200">
                  📈 <b>{demand} tenant{demand > 1 ? "s are" : " is"} looking</b> for a home like this nearby. We'll alert them as soon as your listing is approved.
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1">
                <p className="text-gray-400 font-semibold mb-2">Listing Summary</p>
                <p><span className="text-gray-400">Property:</span> <span className="text-white">{listingTitle()}</span></p>
                <p><span className="text-gray-400">{listingType === "sale" ? "Asking price:" : "Rent:"}</span> <span className="text-green-400 font-bold">{listingType === "sale" ? formatSalePrice(Number(form.rent)) : `₹${parseInt(form.rent || "0").toLocaleString()}/mo`}</span></p>
                {form.property_type === "PG" ? (
                  <>
                    <p><span className="text-gray-400">Type:</span> <span className="text-white">PG · {form.occupancy} Occupancy</span></p>
                    <p><span className="text-gray-400">Gender:</span> <span className="text-white">{form.gender_preference}</span></p>
                    <p><span className="text-gray-400">Meals:</span> <span className="text-white">{form.meals_included === "true" ? "Included ✓" : "Not included"}</span></p>
                    <p><span className="text-gray-400">Bathroom:</span> <span className="text-white">{form.bathroom_type}</span></p>
                  </>
                ) : commercial ? (
                  <p><span className="text-gray-400">Space:</span> <span className="text-white">{form.commercial_type} · {form.furnishing}</span></p>
                ) : (
                  <p><span className="text-gray-400">BHK:</span> <span className="text-white">{form.bhk} BHK · {form.furnishing}</span></p>
                )}
                {form.area_sqft && <p><span className="text-gray-400">Area:</span> <span className="text-white">{form.area_sqft} sqft</span></p>}
                {amenities.length > 0 && <p><span className="text-gray-400">Amenities:</span> <span className="text-white">{amenities.length} selected</span></p>}
                <p><span className="text-gray-400">Photos:</span> <span className="text-white">{photos.length} added</span></p>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
          <button onClick={() => step === 1 ? onClose?.() : setStep(s => s - 1)}
            className="text-gray-400 hover:text-white px-4 py-2">
            {step === 1 ? "Cancel" : "← Back"}
          </button>
          {step < 5 ? (
            <button
              onClick={() => { setError(""); setStep(s => s + 1); }}
              disabled={!canNext()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-semibold"
            >
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving || uploading || (photos.length === 0 && !photosOptional) || !ownerPhoneOk}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-40 px-6 py-2 rounded-lg font-semibold">
              {uploading ? "Uploading..." : saving ? "Submitting..." : !ownerPhoneOk ? "Add the owner's phone" : photos.length === 0 && !photosOptional ? "Add a photo to continue" : "🏠 Submit for review"}
            </button>
          )}
        </div>
      </div>
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}
