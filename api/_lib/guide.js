// Rent guide helpers for area pages: rent by size and an FAQ (with FAQPage structured data).
import { esc, inr } from "./page.js";

const GROUPS = [
  ["1 BHK", (h) => h.property_type !== "PG" && h.property_type !== "Commercial" && Number(h.bhk) === 1],
  ["2 BHK", (h) => h.property_type !== "PG" && h.property_type !== "Commercial" && Number(h.bhk) === 2],
  ["3 BHK", (h) => h.property_type !== "PG" && h.property_type !== "Commercial" && Number(h.bhk) === 3],
  ["4+ BHK", (h) => h.property_type !== "PG" && h.property_type !== "Commercial" && Number(h.bhk) >= 4],
  ["PG / co-living", (h) => h.property_type === "PG"],
  ["Office / commercial", (h) => h.property_type === "Commercial"],
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const round500 = (n) => Math.round(n / 500) * 500;

/** [{ label, count, median, low, high }] for groups with at least one rental. */
export function rentStats(homes) {
  const rentals = homes.filter((h) => h.listing_type !== "sale" && Number(h.rent) > 0);
  return GROUPS.map(([label, test]) => {
    const r = rentals.filter(test).map((h) => Number(h.rent));
    if (!r.length) return null;
    return { label, count: r.length, median: round500(median(r)), low: Math.min(...r), high: Math.max(...r) };
  }).filter(Boolean);
}

export function rentTable(stats, place) {
  if (!stats.length) return "";
  return `<h2>Rent guide: ${esc(place)}</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">Based on live owner listings on EasyHouseHunt right now. Updated automatically.</p>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:8px">
<thead><tr style="text-align:left;color:#9ca3af;font-size:13px"><th style="padding:8px 6px">Type</th><th style="padding:8px 6px">Typical rent</th><th style="padding:8px 6px">Range</th><th style="padding:8px 6px">Homes</th></tr></thead>
<tbody>${stats.map((s) => `<tr style="border-top:1px solid #1f2937"><td style="padding:10px 6px;font-weight:600">${esc(s.label)}</td><td style="padding:10px 6px;color:#4ade80;font-weight:700">${s.count > 1 ? inr(s.median) : "from " + inr(s.low)}/mo</td><td style="padding:10px 6px" class="muted">${s.count > 1 ? `${inr(s.low)} – ${inr(s.high)}` : "—"}</td><td style="padding:10px 6px">${s.count}</td></tr>`).join("")}</tbody>
</table></div>`;
}

/** Questions + answers built only from real data; returns { html, jsonld }. */
export function areaFaq(place, stats, count, nearby) {
  const two = stats.find((s) => s.label === "2 BHK");
  const one = stats.find((s) => s.label === "1 BHK");
  const pg = stats.find((s) => s.label.startsWith("PG"));
  const qa = [
    [`Is there any brokerage for renting in ${place} on EasyHouseHunt?`,
      `No. Homes on EasyHouseHunt are listed directly by owners, and tenants never pay brokerage. You chat with the owner in the app and can book a visit yourself.`],
    two && [`What is the rent for a 2 BHK in ${place}?`,
      two.count > 1 ? `Live listings for 2 BHK homes in and around ${place} rent for ${inr(two.low)} to ${inr(two.high)} a month, typically around ${inr(two.median)}.` : `There is currently one 2 BHK listed near ${place}, at ${inr(two.low)} a month.`],
    one && [`How much does a 1 BHK cost in ${place}?`,
      one.count > 1 ? `1 BHK homes near ${place} are listed at ${inr(one.low)} to ${inr(one.high)} a month, typically around ${inr(one.median)}.` : `One 1 BHK is listed near ${place} right now, at ${inr(one.low)} a month.`],
    pg && [`Are there PGs in ${place}?`,
      `Yes. ${pg.count} PG / co-living option${pg.count > 1 ? "s are" : " is"} listed near ${place}${pg.count > 1 ? `, typically around ${inr(pg.median)} a month` : `, at ${inr(pg.low)} a month`}.`],
    [`How many homes are available for rent in ${place}?`,
      count ? `${count} home${count > 1 ? "s are" : " is"} currently listed within 2.5 km of ${place}. New listings appear on the map as soon as they're approved.` : `None are listed within 2.5 km right now. Post your requirement and we'll email you when a matching home in ${place} is listed.`],
    nearby.length && [`Which areas near ${place} should I also look at?`,
      `Nearby areas include ${nearby.slice(0, 5).map((l) => l.name).join(", ")}. Use the distance filter on the map to widen your search.`],
  ].filter(Boolean);
  const html = `<h2>Frequently asked questions</h2>${qa.map(([q, a]) => `<details style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px 16px;margin:8px 0"><summary style="cursor:pointer;font-weight:600;color:#fff">${esc(q)}</summary><p class="muted" style="margin:8px 0 0">${esc(a)}</p></details>`).join("")}`;
  const jsonld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return { html, jsonld };
}
