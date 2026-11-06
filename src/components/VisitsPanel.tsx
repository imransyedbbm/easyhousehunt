import { useEffect, useState } from "react";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { loadVisits, respondVisit, cancelVisit, fmtSlot, calendarUrl, type Visit } from "@/lib/visits";

/** Visits for the signed-in user, as owner (requests to answer) and as tenant (requests sent). */
export default function VisitsPanel({ userId, onCount }: { userId: string; onCount?: (n: number) => void }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const reload = () => loadVisits(userId).then((v) => { setVisits(v); onCount?.(v.filter((x) => x.owner_id === userId && x.status === "pending").length); });
  useEffect(() => { reload(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (p: Promise<{ error: string | null }>, ok: string) => {
    const { error } = await p;
    if (error) toast.error(error); else { toast.success(ok); reload(); }
  };

  if (!visits) return <p className="text-gray-400">Loading…</p>;
  const upcoming = visits.filter((v) => v.status !== "confirmed" || new Date(v.chosen_slot!) > new Date(Date.now() - 3 * 3600_000));
  if (!upcoming.length) return (
    <div className="py-12 text-center text-gray-400">
      <CalendarCheck className="mx-auto mb-2 h-10 w-10 text-gray-600" />
      <p>No visits yet</p>
      <p className="mt-1 text-sm">Tap "Schedule a visit" on any listing to book a viewing.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {upcoming.map((v) => {
        const owner = v.owner_id === userId;
        return (
          <div key={v.id} className="rounded-xl bg-gray-800 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold">{v.properties?.title ?? "Listing"}</p>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs ${
                v.status === "confirmed" ? "bg-green-900 text-green-300" : v.status === "declined" ? "bg-gray-700 text-gray-300" : "bg-yellow-900 text-yellow-300"}`}>
                {v.status === "pending" ? (owner ? "Needs your reply" : "Waiting for owner") : v.status === "confirmed" ? "Confirmed" : "Declined"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{owner ? "A tenant wants to visit your listing" : "Your visit request"}{v.properties?.address ? ` · ${v.properties.address}` : ""}</p>
            {v.note && <p className="mt-2 text-sm text-gray-300">“{v.note}”</p>}

            {v.status === "pending" && owner && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-gray-400">Tap a time to confirm it:</p>
                <div className="flex flex-wrap gap-2">
                  {v.slots.map((s) => (
                    <button key={s} onClick={() => act(respondVisit(v.id, "confirm", s), "Visit confirmed. The tenant has been told.")}
                      className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold hover:bg-green-600">{fmtSlot(s)}</button>
                  ))}
                  <button onClick={() => act(respondVisit(v.id, "decline"), "Declined. The tenant can suggest new times.")}
                    className="rounded-lg bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600">None work</button>
                </div>
              </div>
            )}
            {v.status === "pending" && !owner && (
              <p className="mt-2 text-xs text-gray-400">Proposed: {v.slots.map(fmtSlot).join(" · ")}</p>
            )}
            {v.status === "confirmed" && v.chosen_slot && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm font-semibold text-green-300">{fmtSlot(v.chosen_slot)}</p>
                <a href={calendarUrl(v)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold hover:bg-gray-600">
                  <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
                </a>
              </div>
            )}
            {(v.status === "pending" || v.status === "confirmed") && (
              <button onClick={() => { if (confirm("Cancel this visit?")) act(cancelVisit(v.id), "Visit cancelled"); }}
                className="mt-2 text-xs text-red-300 hover:text-red-200">Cancel visit</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
