// Public listing page: https://easyhousehunt.com/l/2bhk-karle-vario-homes-k7x2qm
// (readable slug + 6-char share code; the database ID is never exposed). Old /l/<uuid> links still work.
// Server-rendered so Google and link previews (WhatsApp, Facebook, LinkedIn, X) see the full listing.
// "Contact owner" opens the app with the listing selected, where sign-in and chat live.
import { SITE, esc, sb, sizeLabel, priceLabel, listingPath, photos, availability, distanceKm, layout, tile, inr } from "./_lib/page.js";
import { LOCALITIES } from "./_lib/localities.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z2-9]{6}$/;

function nearestLocality(p) {
  if (p.latitude == null || p.longitude == null) return null;
  let best = null, bd = Infinity;
  for (const l of LOCALITIES) {
    const d = distanceKm({ lat: p.latitude, lng: p.longitude }, l);
    if (d < bd) { bd = d; best = l; }
  }
  return bd <= 4 ? best : null;
}

export default async function handler(req, res) {
  const seg = String(req.query.id || "").trim();
  const legacyId = UUID.test(seg) ? seg : null;
  const code = legacyId ? null : (seg.split("-").pop() || "");
  const valid = !!legacyId || CODE.test(code);
  const filter = legacyId ? `id=eq.${legacyId}` : `share_code=eq.${code}`;
  const rows = valid ? await sb(`properties?${filter}&status=eq.approved&select=*`) : null;
  const p = rows?.[0] || null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");

  if (!p) {
    res.status(404).send(layout({
      title: "Listing not found · EasyHouseHunt", desc: "This listing has been let out or removed.",
      canonical: SITE + "/", status: 404,
      body: `<main style="text-align:center;padding-top:80px"><h1>This home is no longer listed</h1><p class="muted">It may have been let out. Plenty more on the map.</p><p><a class="btn btn-o" href="/">Browse homes on the map</a></p></main>`,
    }));
    return;
  }

  const canonical = SITE + listingPath(p);
  const appUrl = `${SITE}/?p=${p.share_code || p.id}`;
  const size = sizeLabel(p), price = priceLabel(p), pics = photos(p);
  const sale = p.listing_type === "sale";
  const area = nearestLocality(p);
  const furnishing = p.furnishing ? (p.furnishing === "Semi" ? "Semi-furnished" : p.furnishing) : null;
  const text = String(p.description || "").replace(/\s+/g, " ").trim();
  const title = `${size} ${sale ? "for sale" : "for rent"}${area ? ` in ${area.name}` : ""} · ${p.title || "Home"} · ${price}`;
  const desc = [[furnishing, p.area_sqft && `${p.area_sqft} sq ft`, !sale && availability(p)].filter(Boolean).join(" · "),
    text.length > 150 ? text.slice(0, 147) + "…" : text, "Zero brokerage, direct from owner."].filter(Boolean).join(". ");
  const wa = `https://wa.me/?text=${encodeURIComponent(`${size} · ${p.title} · ${price}\n${canonical}`)}`;

  const chips = [
    `<span class="chip o">${esc(size)}</span>`,
    p.is_verified && `<span class="chip" style="background:#1e3a8a;color:#bfdbfe">✓ Verified owner</span>`,
    furnishing && `<span class="chip">${esc(furnishing)}</span>`,
    p.area_sqft && `<span class="chip">${esc(p.area_sqft)} sq ft</span>`,
    !sale && p.deposit && `<span class="chip">Deposit ${esc(inr(p.deposit))}</span>`,
    !sale && `<span class="chip">${esc(availability(p))}</span>`,
    !sale && p.preferred_tenants?.length && `<span class="chip">Prefers ${esc(p.preferred_tenants.join(", "))}</span>`,
  ].filter(Boolean).join("");

  const gal = pics.length
    ? `<div class="gal ${pics.length === 1 ? "one" : pics.length === 2 ? "two" : ""}">${pics.slice(0, 12).map((u, i) => `<img src="${esc(u)}" alt="${esc(p.title)} photo ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join("")}</div>`
    : `<div class="nophoto">Photos on request · ask the owner</div>`;

  // Similar homes nearby (same listing type), for visitors and internal linking.
  let similar = [];
  if (p.latitude != null && p.longitude != null) {
    const d = 0.03;
    const near = await sb(`properties?status=eq.approved&is_sample=eq.false&listing_type=eq.${sale ? "sale" : "rent"}&id=neq.${p.id}` +
      `&latitude=gte.${p.latitude - d}&latitude=lte.${p.latitude + d}&longitude=gte.${p.longitude - d}&longitude=lte.${p.longitude + d}` +
      `&select=id,title,bhk,rent,sale_price,listing_type,property_type,commercial_type,occupancy,address,media_urls,share_code&limit=6`);
    similar = (near || []).filter((x) => x.availability !== "let_out");
  }

  const jsonld = {
    "@context": "https://schema.org", "@type": "RealEstateListing",
    name: p.title, description: text || desc, url: canonical, image: pics.slice(0, 5),
    datePosted: p.created_at || undefined,
    offers: { "@type": "Offer", priceCurrency: "INR", price: sale ? p.sale_price || undefined : p.rent || undefined,
      ...(sale ? {} : { priceSpecification: { "@type": "UnitPriceSpecification", price: p.rent || undefined, priceCurrency: "INR", unitCode: "MON" } }),
      availability: p.availability === "reserved" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock" },
    about: {
      "@type": p.property_type === "Commercial" ? "Place" : "Apartment",
      ...(p.bhk ? { numberOfRooms: p.bhk } : {}),
      ...(p.area_sqft ? { floorSize: { "@type": "QuantitativeValue", value: p.area_sqft, unitCode: "FTK" } } : {}),
      address: { "@type": "PostalAddress", streetAddress: p.address || undefined, addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
      ...(p.latitude != null ? { geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude } } : {}),
    },
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Bengaluru", item: SITE + "/" },
    ...(area ? [{ "@type": "ListItem", position: 2, name: `Rent in ${area.name}`, item: `${SITE}/rent/${area.slug}` }] : []),
    { "@type": "ListItem", position: area ? 3 : 2, name: p.title, item: canonical },
  ] };

  const body = `<main>
<p class="muted" style="font-size:13px;margin:0 0 12px"><a href="/">Bengaluru</a>${area ? ` › <a href="/rent/${esc(area.slug)}">Rent in ${esc(area.name)}</a>` : ""}</p>
${p.is_sample ? `<div class="warn"><b>Sample listing</b> · for demonstration only, not a real home or price.</div><br>` : ""}
${gal}
${pics.length > 1 ? `<p class="muted" style="font-size:13px;margin:6px 0 0">${pics.length} photos${pics.length > 3 ? " · swipe on phone, or open on the map to see all" : ""}</p>` : ""}
<div class="cols"><div>
<h1>${esc(p.title || "Home")}</h1>
<div class="price">${esc(price)}</div>
${p.address ? `<p class="muted">${esc(p.address)}</p>` : ""}
<div class="chips">${chips}</div>
${text ? `<h2>About this ${sale ? "property" : "home"}</h2><p style="white-space:pre-line">${esc(p.description)}</p>` : ""}
${p.amenities?.length ? `<h2>Amenities</h2><div class="chips">${p.amenities.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div>` : ""}
${sale ? `<div class="warn">Before paying any money, verify title deeds, khata, encumbrance certificate and RERA registration, preferably with a lawyer. EasyHouseHunt does not verify ownership.</div>` : ""}
</div>
<aside><div class="card">
<div class="price" style="font-size:24px">${esc(price)}</div>
<div class="muted" style="font-size:14px">${esc(size)}${furnishing ? " · " + esc(furnishing) : ""}</div>
<a class="btn btn-o" href="${esc(appUrl)}">${sale ? "Contact the seller" : "Contact the owner"}</a>
<a class="btn btn-g" href="${esc(wa)}" target="_blank" rel="noopener">Share on WhatsApp</a>
<a class="btn btn-d" href="${esc(appUrl)}">See it on the map</a>
<p class="note">Zero brokerage. You chat with the owner directly on EasyHouseHunt.</p>
</div></aside></div>
${similar.length ? `<h2>More homes nearby</h2><div class="grid">${similar.map(tile).join("")}</div>` : ""}
${area ? `<p style="margin-top:28px"><a class="btn btn-d" href="/rent/${esc(area.slug)}">All homes for rent in ${esc(area.name)} →</a></p>` : ""}
</main>
<div class="bar"><a class="btn btn-g" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-o" href="${esc(appUrl)}">Contact owner</a></div>`;

  res.status(200).send(layout({ title, desc, canonical, image: pics[0], jsonld: [jsonld, crumbs], body }));
}
