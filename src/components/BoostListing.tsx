import { useState } from "react";
import { Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BOOST_PLANS, isFeatured } from "@/lib/featured";

/** Owner: "Boost" button + plan picker. Creates a boost request; the team confirms payment and features it. */
export default function BoostListing({ listing }: { listing: { id: string | number; title: string; featured_until?: string | null } }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(15);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  if (isFeatured(listing)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-400/15 px-3 py-1.5 text-xs font-semibold text-yellow-200">
        ★ Featured until {new Date(listing.featured_until!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
      </span>
    );
  }

  const submit = async () => {
    setBusy(true);
    const { error } = await (supabase as any).from("boost_requests").insert({ property_id: listing.id, plan_days: days, phone: phone.trim() || null });
    setBusy(false);
    if (error) { toast.error("Couldn't send the request. Try again."); return; }
    toast.success("Boost requested", { description: "Our team will contact you to confirm and activate it." });
    setOpen(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-yellow-300">
        <Rocket className="h-3.5 w-3.5" /> Boost
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-gray-900 p-5 text-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Boost listing">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><Rocket className="h-5 w-5 text-yellow-300" /> Feature this listing</h3>
                <p className="mt-0.5 text-xs text-gray-400">{listing.title}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-gray-300">
              <li>★ Shown first on the map list and in your area's page</li>
              <li>★ Yellow "Featured" badge that stands out</li>
              <li>★ Typically far more views and enquiries</li>
            </ul>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {BOOST_PLANS.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)}
                  className={`rounded-xl border p-3 text-center ${days === p.days ? "border-yellow-400 bg-yellow-400/10" : "border-gray-700 bg-gray-800"}`}>
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-lg font-bold text-yellow-300">₹{p.price}</div>
                </button>
              ))}
            </div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={15}
              placeholder="Phone for payment confirmation (optional)"
              className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm placeholder-gray-500 outline-none focus:border-yellow-400" />
            <button onClick={submit} disabled={busy} className="mt-3 w-full rounded-xl bg-yellow-400 py-3 font-bold text-black hover:bg-yellow-300 disabled:opacity-50">
              {busy ? "Sending…" : "Request boost"}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-500">No payment now. We'll contact you to confirm and share payment details (UPI / invoice).</p>
          </div>
        </div>
      )}
    </>
  );
}
