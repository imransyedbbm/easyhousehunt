import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCALITIES } from "@/data/localities";
import { distanceMeters, AREA_RADIUS_M } from "@/lib/geo";

type Data = {
  daily: { day: string; visitors: number; contacts: number }[];
  funnel: Record<"visitors" | "searched" | "opened_listing" | "contacted" | "booked_visit" | "started_listing", number>;
  areas: { area: string; searches: number; people: number }[];
  sources: { source: string; visitors: number }[];
  top_listings: { property_id: string; title: string; opens: number; contacts: number }[];
};

/** Admin "Insights" tab: traffic, funnel, demand vs supply by area, sources, top listings. */
export default function AdminInsights({ listings }: { listings: any[] }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setData(null); setErr("");
    (supabase as any).rpc("admin_analytics", { p_days: days }).then(({ data, error }: any) => {
      if (error) setErr(error.message.includes("admin_analytics") ? "Run the analytics SQL in Supabase first." : error.message);
      else setData(data);
    });
  }, [days]);

  // Live listings within 2.5 km of each searched area = supply.
  const supply = useMemo(() => {
    const live = listings.filter((l) => l.status === "approved" && l.latitude && l.longitude);
    return (name: string) => {
      const loc = LOCALITIES.find((l) => l.name === name);
      if (!loc) return null;
      return live.filter((l) => distanceMeters(loc, { lat: l.latitude, lng: l.longitude }) <= AREA_RADIUS_M).length;
    };
  }, [listings]);

  if (err) return <p className="rounded-xl bg-red-950/40 p-4 text-sm text-red-200">{err}</p>;
  if (!data) return <p className="text-gray-400">Loading insights…</p>;

  const f = data.funnel;
  const steps: [string, number][] = [
    ["Visitors", f.visitors], ["Searched an area", f.searched], ["Opened a listing", f.opened_listing],
    ["Contacted an owner", f.contacted], ["Requested a visit", f.booked_visit],
  ];
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.visitors));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${days === d ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-300"}`}>
            Last {d} days
          </button>
        ))}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Daily visitors</h3>
        <div className="flex h-32 items-end gap-[2px] rounded-xl bg-gray-900 p-3" role="img" aria-label="Daily visitors chart">
          {data.daily.map((d) => (
            <div key={d.day} className="group relative flex-1">
              <div className="w-full rounded-t bg-orange-500/80 group-hover:bg-orange-400" style={{ height: `${(d.visitors / maxDaily) * 100}px` }} />
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: {d.visitors} · {d.contacts} contacts
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Tenant journey</h3>
        <div className="space-y-1.5">
          {steps.map(([label, n], i) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <div className="w-40 flex-shrink-0 text-gray-400">{label}</div>
              <div className="h-6 flex-1 overflow-hidden rounded bg-gray-900">
                <div className="flex h-full items-center bg-orange-500/70 px-2 text-xs font-semibold text-white" style={{ width: `${Math.max(4, f.visitors ? (n / f.visitors) * 100 : 0)}%` }}>{n}</div>
              </div>
              <div className="w-12 text-right text-xs text-gray-500">{i ? pct(n, steps[i - 1][1]) : ""}</div>
            </div>
          ))}
          <p className="pt-1 text-xs text-gray-500">{f.started_listing} visitors started listing a property.</p>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-300">Demand vs supply by area</h3>
        <p className="mb-2 text-xs text-gray-500">Areas people searched, and how many live listings you have within 2.5 km. Red = go find owners there.</p>
        {data.areas.length === 0 ? <p className="text-sm text-gray-500">No area searches yet.</p> : (
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-xs text-gray-400"><tr><th className="p-2 text-left">Area</th><th className="p-2 text-right">Searches</th><th className="p-2 text-right">People</th><th className="p-2 text-right">Live listings</th></tr></thead>
              <tbody>
                {data.areas.map((a) => {
                  const s = supply(a.area);
                  const short = s !== null && s < Math.max(2, Math.ceil(a.people / 5));
                  return (
                    <tr key={a.area} className="border-t border-gray-800">
                      <td className="p-2">{a.area}</td>
                      <td className="p-2 text-right">{a.searches}</td>
                      <td className="p-2 text-right">{a.people}</td>
                      <td className={`p-2 text-right font-semibold ${short ? "text-red-400" : "text-green-400"}`}>{s ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Where visitors come from</h3>
          <ul className="space-y-1 text-sm">
            {data.sources.map((s) => (
              <li key={s.source} className="flex justify-between rounded-lg bg-gray-900 px-3 py-1.5"><span className="capitalize">{s.source}</span><b>{s.visitors}</b></li>
            ))}
            {!data.sources.length && <li className="text-gray-500">No visits yet.</li>}
          </ul>
          <p className="mt-1 text-[11px] text-gray-500">Tag your own links: easyhousehunt.com/?source=instagram</p>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Most viewed listings</h3>
          <ul className="space-y-1 text-sm">
            {data.top_listings.map((t) => (
              <li key={t.property_id} className="flex justify-between gap-2 rounded-lg bg-gray-900 px-3 py-1.5">
                <span className="truncate">{t.title}</span><span className="flex-shrink-0 text-gray-400">{t.opens} views · {t.contacts} contacts</span>
              </li>
            ))}
            {!data.top_listings.length && <li className="text-gray-500">No listing views yet.</li>}
          </ul>
        </section>
      </div>
      <p className="text-[11px] text-gray-500">Anonymous: one random id per browser, no IP addresses or cookies. Counting starts from when the SQL was run.</p>
    </div>
  );
}
