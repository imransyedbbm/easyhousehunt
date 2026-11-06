// Area pages: https://easyhousehunt.com/rent/koramangala — homes for rent near a Bengaluru locality.
// /rent (no area) lists every area. Server-rendered for search engines; links into the map.
import { SITE, esc, sb, layout, tile, distanceKm } from "./_lib/page.js";
import { LOCALITIES } from "./_lib/localities.js";

const RADIUS_KM = 2.5;
const FIELDS = "id,title,bhk,rent,sale_price,listing_type,property_type,commercial_type,occupancy,address,media_urls,share_code,latitude,longitude,availability";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
  const slug = String(req.query.area || "").toLowerCase();
  const sorted = [...LOCALITIES].sort((a, b) => a.name.localeCompare(b.name));

  if (!slug) {
    res.status(200).send(layout({
      title: "Homes for rent in Bengaluru by area · Zero brokerage · EasyHouseHunt",
      desc: "Browse rental homes, PGs and commercial spaces across Bengaluru localities, direct from owners with zero brokerage.",
      canonical: `${SITE}/rent`,
      body: `<main><h1>Homes for rent in Bengaluru, by area</h1><p class="muted">Pick a locality to see homes listed directly by owners.</p>
<div class="links" style="margin-top:20px">${sorted.map((l) => `<a href="/rent/${esc(l.slug)}">${esc(l.name)}</a>`).join("")}</div></main>`,
    }));
    return;
  }

  const area = LOCALITIES.find((l) => l.slug === slug);
  if (!area) {
    res.status(404).send(layout({ title: "Area not found · EasyHouseHunt", desc: "", canonical: `${SITE}/rent`, status: 404,
      body: `<main style="text-align:center;padding-top:80px"><h1>We don't know that area yet</h1><p><a class="btn btn-o" href="/rent">See all areas</a></p></main>` }));
    return;
  }

  const d = 0.03;
  const rows = await sb(`properties?status=eq.approved&is_sample=eq.false&listing_type=eq.rent` +
    `&latitude=gte.${area.lat - d}&latitude=lte.${area.lat + d}&longitude=gte.${area.lng - d}&longitude=lte.${area.lng + d}&select=${FIELDS}&limit=60`);
  const homes = (rows || [])
    .filter((p) => p.availability !== "let_out")
    .map((p) => ({ p, km: distanceKm(area, { lat: p.latitude, lng: p.longitude }) }))
    .filter((x) => x.km <= RADIUS_KM).sort((a, b) => a.km - b.km).map((x) => x.p);

  const nearby = LOCALITIES.filter((l) => l.slug !== slug).map((l) => ({ l, km: distanceKm(area, l) }))
    .sort((a, b) => a.km - b.km).slice(0, 12).map((x) => x.l);
  const rents = homes.map((h) => h.rent).filter(Boolean).sort((a, b) => a - b);
  const range = rents.length >= 2 ? ` Rents from ₹${rents[0].toLocaleString("en-IN")} to ₹${rents[rents.length - 1].toLocaleString("en-IN")} a month.` : "";
  const count = homes.length;
  const canonical = `${SITE}/rent/${area.slug}`;
  const mapUrl = `${SITE}/?area=${encodeURIComponent(area.slug)}`;

  res.status(200).send(layout({
    title: `${count ? count + " " : ""}Homes for rent in ${area.name}, Bengaluru · Zero brokerage · EasyHouseHunt`,
    desc: `${count ? `${count} rental homes` : "Rental homes"} in and around ${area.name}, Bengaluru, listed directly by owners. No brokerage.${range}`,
    canonical, image: homes.map((h) => (h.media_urls || []).find((u) => /^https:/.test(u))).find(Boolean),
    jsonld: { "@context": "https://schema.org", "@type": "ItemList", name: `Homes for rent in ${area.name}`,
      itemListElement: homes.slice(0, 20).map((h, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + tile(h).match(/href="([^"]+)"/)[1] })) },
    body: `<main>
<p class="muted" style="font-size:13px;margin:0 0 12px"><a href="/">Bengaluru</a> › <a href="/rent">Areas</a> › ${esc(area.name)}</p>
<h1>Homes for rent in ${esc(area.name)}</h1>
<p class="muted">${count ? `${count} ${count === 1 ? "home" : "homes"} within ${RADIUS_KM} km, listed directly by owners.${range}` : `No homes listed within ${RADIUS_KM} km of ${esc(area.name)} yet.`}</p>
<p><a class="btn btn-o" href="${esc(mapUrl)}">Explore ${esc(area.name)} on the map</a></p>
${count ? `<div class="grid">${homes.map(tile).join("")}</div>` : `<div class="card" style="position:static;margin-top:16px"><b>Tell us what you need</b><p class="muted">Post your requirement and we'll email you when a matching home in ${esc(area.name)} is listed.</p><a class="btn btn-o" href="/?requirement=1">Post requirement</a></div>`}
<h2>Nearby areas</h2><div class="links">${nearby.map((l) => `<a href="/rent/${esc(l.slug)}">${esc(l.name)}</a>`).join("")}</div>
<h2>Own a home in ${esc(area.name)}?</h2><p class="muted">List it free and talk to tenants directly. <a href="/?list=1" style="color:#fb923c">List your property →</a></p>
</main>`,
  }));
}
