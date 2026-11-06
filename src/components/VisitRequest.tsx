import { useMemo, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { toast } from "sonner";
import { requestVisit } from "@/lib/visits";

const TIMES = [["10:00", "10 AM"], ["12:00", "12 PM"], ["15:00", "3 PM"], ["17:00", "5 PM"], ["19:00", "7 PM"]] as const;

/** Tenant picks up to 3 slots over the next 7 days; owner confirms one. */
export default function VisitRequest({ propertyId, title, onClose }: { propertyId: string; title: string; onClose: () => void }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + (new Date().getHours() >= 18 ? 1 : 0)); d.setHours(0, 0, 0, 0); return d;
  }), []);
  const [day, setDay] = useState(0);
  const [picked, setPicked] = useState<Date[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const slotAt = (d: Date, hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const has = (x: Date) => picked.some((p) => p.getTime() === x.getTime());
  const toggle = (x: Date) => {
    if (has(x)) setPicked((p) => p.filter((y) => y.getTime() !== x.getTime()));
    else if (picked.length >= 3) toast("Pick up to 3 times");
    else setPicked((p) => [...p, x].sort((a, b) => a.getTime() - b.getTime()));
  };
  const submit = async () => {
    setBusy(true);
    const { error } = await requestVisit(propertyId, picked, note.trim());
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success("Visit requested", { description: "The owner will confirm one of your times. You'll get a message and an email." });
    onClose();
  };
  const fmt = (d: Date) => d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-gray-900 p-5 text-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Schedule a visit">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-orange-400" /> Schedule a visit</h3>
            <p className="mt-0.5 text-xs text-gray-400">{title} · pick up to 3 times that suit you</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {days.map((d, i) => (
            <button key={i} onClick={() => setDay(i)}
              className={`flex-shrink-0 rounded-xl px-3 py-2 text-center text-xs ${day === i ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-300"}`}>
              <div className="font-semibold">{i === 0 && d.toDateString() === new Date().toDateString() ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
              <div>{d.getDate()} {d.toLocaleDateString("en-IN", { month: "short" })}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {TIMES.map(([hhmm, label]) => {
            const x = slotAt(days[day], hhmm);
            const past = x.getTime() < Date.now() + 3600_000;
            return (
              <button key={hhmm} disabled={past} onClick={() => toggle(x)}
                className={`rounded-lg py-2 text-xs font-medium disabled:opacity-30 ${has(x) ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}>
                {label}
              </button>
            );
          })}
        </div>

        {picked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {picked.map((p) => (
              <button key={p.getTime()} onClick={() => toggle(p)} className="rounded-full bg-orange-500/15 px-3 py-1 text-xs text-orange-200">{fmt(p)} ✕</button>
            ))}
          </div>
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
          placeholder="Note for the owner (optional), e.g. coming with family"
          className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm placeholder-gray-500 outline-none focus:border-orange-500" />
        <button onClick={submit} disabled={!picked.length || busy}
          className="mt-3 w-full rounded-xl bg-orange-500 py-3 font-semibold hover:bg-orange-600 disabled:opacity-40">
          {busy ? "Sending…" : picked.length ? `Request visit (${picked.length} time${picked.length > 1 ? "s" : ""})` : "Pick at least one time"}
        </button>
      </div>
    </div>
  );
}
