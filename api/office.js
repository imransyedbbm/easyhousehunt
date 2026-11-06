// Office & commercial space pages: /office-space and /office-space/<area-or-tech-park>.
// Server-rendered for search ("office space for rent in Koramangala"), with ₹/sq ft guide and FAQ.
import { SITE, esc, sb, layout, tile, distanceKm, inr } from "./_lib/page.js";
import { LOCALITIES } from "./_lib/localities.js";

const RADIUS_KM = 3;
const FIELDS = "id,title,bhk,rent,sale_price,listing_type,property_type,commercial_type,occupancy,address,media_urls,share_code,latitude,longitude,availability,area_sqft";
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** ₹/sq ft/month by kind of space, from live commercial rentals that state their size. */
export function sqftStats(spaces) {
  const by = new Map();
  for (const s of spaces) {
    if (s.listing_type === "sale" || !(s.rent > 0) || !(s.area_sqft > 0)) continue;
    const k = s.commercial_type || "Commercial";
    by.set(k, [...(by.get(k) || []), s.rent / s.area_sqft]);
  }
  return [...by.entries()].map(([type, v]) => ({ type, count: v.length, median: Math.round(median(v)), low: Math.round(Math.min(...v)), high: Math.round(Math.max(...v)) }))
    .sort((a, b) => b.count - a.count);
}

function guide(stats, place) {
  if (!stats.length) return "";
  return `<h2>Office rent guide: ${esc(place)}</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">Rent per sq ft per month, from live listings on EasyHouseHunt. Updated automatically.</p>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:8px">
<thead><tr style="text-align:left;color:#9ca3af;font-size:13px"><th style="padding:8px 6px">Space</th><th style="padding:8px 6px">Typical</th><th style="padding:8px 6px">Range</th><th style="padding:8px 6px">Listings</th></tr></thead>
<tbody>${stats.map((s) => `<tr style="border-top:1px solid #1f2937"><td style="padding:10px 6px;font-weight:600">${esc(s.type)}</td><td style="padding:10px 6px;color:#4ade80;font-weight:700">₹${s.median}/sq ft</td><td style="padding:10px 6px" class="muted">${s.count > 1 ? `₹${s.low} – ₹${s.high}` : "—"}</td><td style="padding:10px 6px">${s.count}</td></tr>`).join("")}</tbody></table></div>`;
}

function faq(place, stats, count) {
  const office = stats.find((s) => s.type === "Office space") || stats[0];
  const qa = [
    [`Is there brokerage for office space in ${place} on EasyHouseHunt?`, "No. Spaces are listed directly by owners and landlords, and you deal with them yourself. EasyHouseHunt charges no brokerage."],
    office && [`What is the rent per sq ft for ${office.type.toLowerCase()} in ${place}?`,
      office.count > 1 ? `Live listings near ${place} are ₹${office.low}–₹${office.high} per sq ft per month, typically around ₹${office.median}.` : `One listing near ${place} is at about ₹${office.median} per sq ft per month.`],
    [`How much space do I need for my team?`, "Plan roughly 60–80 sq ft per workstation including shared areas (meeting rooms, pantry, reception). A 20-person team typically needs 1,200–1,600 sq ft. Listings on EasyHouseHunt show an estimated seat count."],
    [`How many commercial spaces are available in ${place}?`, count ? `${count} space${count > 1 ? "s are" : " is"} listed within ${RADIUS_KM} km of ${place} right now.` : `None within ${RADIUS_KM} km right now. Post your requirement and we'll email you when one is listed.`],
  ].filter(Boolean);
  return {
    html: `<h2>Frequently asked questions</h2>${qa.map(([q, a]) => `<details style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px 16px;margin:8px 0"><summary style="cursor:pointer;font-weight:600;color:#fff">${esc(q)}</summary><p class="muted" style="margin:8px 0 0">${esc(a)}</p></details>`).join("")}`,
    jsonld: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
  const slug = String(req.query.area || "").toLowerCase();
  const all = ((await sb(`properties?status=eq.approved&is_sample=eq.false&property_type=eq.Commercial&select=${FIELDS}&limit=2000`)) || [])
    .filter((p) => p.availability !== "let_out");
  const mapUrl = `${SITE}/?segment=commercial`;

  if (!slug) {
    const stats = sqftStats(all);
    const counted = LOCALITIES.map((l) => ({ l, n: all.filter((p) => p.latitude != null && distanceKm(l, { lat: p.latitude, lng: p.longitude }) <= RADIUS_KM).length }))
      .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const f = faq("Bengaluru", stats, all.length);
    res.status(200).send(layout({
      title: `Office space for rent in Bengaluru · ${all.length ? all.length + " spaces · " : ""}Direct from owners · EasyHouseHunt`,
      desc: `Offices, co-working, shops and warehouses for rent in Bengaluru, direct from owners with zero brokerage.${stats[0] ? ` ${stats[0].type} typically ₹${stats[0].median}/sq ft/month.` : ""}`,
      canonical: `${SITE}/office-space`, jsonld: f.jsonld,
      body: `<main><h1>Office & commercial space for rent in Bengaluru</h1>
<p class="muted">${all.length} space${all.length === 1 ? "" : "s"} listed directly by owners: offices, co-working, retail, showrooms and warehouses.</p>
<p><a class="btn btn-o" href="${mapUrl}">Browse commercial spaces on the map</a></p>
${guide(stats, "Bengaluru")}
${counted.length ? `<h2>By area and tech park</h2><div class="links">${counted.slice(0, 40).map((x) => `<a href="/office-space/${esc(x.l.slug)}">${esc(x.l.name)} · ${x.n}</a>`).join("")}</div>` : ""}
${all.length ? `<h2>Latest spaces</h2><div class="grid">${all.slice(0, 12).map(tile).join("")}</div>` : ""}
${f.html}</main>`,
    }));
    return;
  }

  const area = LOCALITIES.find((l) => l.slug === slug);
  if (!area) {
    res.status(404).send(layout({ title: "Area not found · EasyHouseHunt", desc: "", canonical: `${SITE}/office-space`, status: 404,
      body: `<main style="text-align:center;padding-top:80px"><h1>We don't know that area yet</h1><p><a class="btn btn-o" href="/office-space">See all office spaces</a></p></main>` }));
    return;
  }
  const near = all.map((p) => ({ p, km: p.latitude != null ? distanceKm(area, { lat: p.latitude, lng: p.longitude }) : 99 }))
    .filter((x) => x.km <= RADIUS_KM).sort((a, b) => a.km - b.km).map((x) => x.p);
  const stats = sqftStats(near);
  const f = faq(area.name, stats, near.length);
  const nearby = LOCALITIES.filter((l) => l.slug !== slug).map((l) => ({ l, km: distanceKm(area, l) })).sort((a, b) => a.km - b.km).slice(0, 10).map((x) => x.l);
  res.status(200).send(layout({
    title: `Office space for rent in ${area.name}, Bengaluru${near.length ? ` · ${near.length} spaces` : ""}${stats[0] ? ` · from ₹${stats[0].low}/sq ft` : ""}`,
    desc: `${near.length ? `${near.length} offices and commercial spaces` : "Offices and commercial spaces"} near ${area.name}, Bengaluru, direct from owners. No brokerage.${stats[0] ? ` ${stats[0].type} around ₹${stats[0].median}/sq ft/month.` : ""}`,
    canonical: `${SITE}/office-space/${area.slug}`, jsonld: f.jsonld,
    image: near.map((h) => (h.media_urls || []).find((u) => /^https:/.test(u))).find(Boolean),
    body: `<main>
<p class="muted" style="font-size:13px;margin:0 0 12px"><a href="/">Bengaluru</a> › <a href="/office-space">Office space</a> › ${esc(area.name)}</p>
<h1>Office space for rent in ${esc(area.name)}</h1>
<p class="muted">${near.length ? `${near.length} space${near.length > 1 ? "s" : ""} within ${RADIUS_KM} km, listed directly by owners.` : `No commercial spaces within ${RADIUS_KM} km of ${esc(area.name)} yet.`}</p>
<p style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-o" href="${SITE}/?segment=commercial&area=${encodeURIComponent(area.slug)}">See them on the map</a><a class="btn btn-d" href="/?requirement=1">Post an office requirement</a></p>
${near.length ? `<div class="grid">${near.map(tile).join("")}</div>` : ""}
${guide(stats, area.name)}
${f.html}
<h2>Nearby</h2><div class="links">${nearby.map((l) => `<a href="/office-space/${esc(l.slug)}">${esc(l.name)}</a>`).join("")}</div>
<h2>Have space to lease in ${esc(area.name)}?</h2><p class="muted">List it free and talk to occupiers directly. <a href="/?list=1" style="color:#fb923c">List your space →</a></p>
</main>`,
  }));
}
