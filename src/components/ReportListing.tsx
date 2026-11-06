import { useState } from "react";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const REASONS = [
  { key: "let_out", label: "Already rented out / sold" },
  { key: "wrong_details", label: "Wrong price, photos or details" },
  { key: "broker", label: "Broker posing as owner / asks for brokerage" },
  { key: "fake", label: "Fake listing or scam" },
  { key: "other", label: "Something else" },
] as const;

/** "Report this listing" link + small sheet. Signed-in users only; one report per listing. */
export default function ReportListing({ propertyId, signedIn, onRequireLogin }: {
  propertyId: string;
  signedIn: boolean;
  onRequireLogin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    const { error } = await (supabase as any).from("listing_reports").insert({
      property_id: propertyId, reason, details: details.trim().slice(0, 500) || null,
    });
    setBusy(false);
    if (error && error.code !== "23505") { toast.error("Couldn't send the report. Try again."); return; }
    toast.success(error ? "You've already reported this listing. We're on it." : "Thanks. Our team will review this listing.");
    setOpen(false); setReason(""); setDetails("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (signedIn ? setOpen(true) : onRequireLogin())}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-300"
      >
        <Flag className="h-3.5 w-3.5" /> Report this listing
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-gray-900 p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Report listing">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">What's wrong with this listing?</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 space-y-2">
              {REASONS.map((r) => (
                <label key={r.key} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${reason === r.key ? "border-orange-500 bg-orange-500/10 text-white" : "border-gray-700 text-gray-300"}`}>
                  <input type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="accent-orange-500" />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3}
              placeholder="Anything else we should know? (optional)"
              className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white placeholder-gray-500 outline-none focus:border-orange-500"
            />
            <button onClick={submit} disabled={!reason || busy}
              className="mt-3 w-full rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-40">
              {busy ? "Sending…" : "Send report"}
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-500">The owner won't see who reported.</p>
          </div>
        </div>
      )}
    </>
  );
}
