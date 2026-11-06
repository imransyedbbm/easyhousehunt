// Shared helpers for the server-rendered public pages (listing, area, sitemap).
export const SITE = "https://easyhousehunt.com";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");

export function env() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  };
}

export async function sb(path) {
  const { url, key } = env();
  if (!url || !key) return null;
  try {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export function sizeLabel(p) {
  if (p.property_type === "Commercial") return p.commercial_type || "Commercial space";
  if (p.property_type === "PG") return p.occupancy ? `PG · ${p.occupancy} occupancy` : "PG";
  return p.bhk ? `${p.bhk} BHK` : p.property_type || "Home";
}

export function priceLabel(p) {
  if (p.listing_type === "sale") {
    const n = p.sale_price;
    if (!n) return "Price on request";
    if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
    return inr(n);
  }
  return p.rent ? `${inr(p.rent)}/month` : "Price on request";
}

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

export function listingPath(p) {
  const size = p.property_type === "PG" ? "pg" : p.property_type === "Commercial" ? "commercial" : p.bhk ? `${p.bhk}bhk` : "";
  return p.share_code ? `/l/${slugify(`${size} ${p.title || "home"}`)}-${p.share_code}` : `/l/${p.id}`;
}

export const photos = (p) => (p.media_urls || []).filter((u) => /^https:\/\//i.test(u));

export function availability(p) {
  if (p.availability === "reserved") return "Reserved";
  const d = p.availability_date;
  if (!d) return "Available now";
  const dt = new Date(d + "T00:00:00");
  if (dt <= new Date()) return "Available now";
  return "Available from " + dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function distanceKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0f19;color:#e5e7eb;line-height:1.55}
a{color:inherit}header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;background:rgba(11,15,25,.92);backdrop-filter:blur(8px);border-bottom:1px solid #1f2937}
.brand{font-weight:800;font-size:18px;text-decoration:none;color:#fff}.brand span{color:#f97316}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px;border:0;cursor:pointer}
.btn-o{background:#cf460b;color:#fff}.btn-o:hover{background:#b33c09}.btn-g{background:#16a34a;color:#fff}.btn-g:hover{background:#15803d}.btn-d{background:#1f2937;color:#fff;border:1px solid #374151}
main{max-width:1040px;margin:0 auto;padding:20px 16px 110px}
.gal{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:8px;height:420px;border-radius:16px;overflow:hidden}
.gal img{width:100%;height:100%;object-fit:cover;display:block;background:#111827}.gal img:first-child{grid-row:1/3}
.gal img:nth-child(n+4){display:none}.gal.one{grid-template-columns:1fr;grid-template-rows:1fr}.gal.two{grid-template-rows:1fr}.gal.two img:first-child{grid-row:auto}
.nophoto{height:220px;border-radius:16px;background:#111827;display:grid;place-items:center;color:#6b7280}
.cols{display:grid;grid-template-columns:1fr 320px;gap:28px;margin-top:24px}
h1{font-size:28px;line-height:1.2;margin:0 0 6px;color:#fff}h2{font-size:18px;color:#fff;margin:28px 0 10px}
.price{font-size:30px;font-weight:800;color:#4ade80}.muted{color:#9ca3af}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.chip{background:#1f2937;border-radius:999px;padding:6px 12px;font-size:14px}.chip.o{background:rgba(207,70,11,.2);color:#fdba74}
.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:18px;position:sticky;top:80px}
.card .btn{width:100%;margin-top:10px}.note{font-size:12px;color:#9ca3af;margin-top:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-top:16px}
.tile{background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden;text-decoration:none;display:block;transition:transform .15s}.tile:hover{transform:translateY(-2px);border-color:#f97316}
.tile img,.tile .ph{width:100%;height:160px;object-fit:cover;display:block;background:#1f2937}.tile div{padding:12px}.tile b{display:block;color:#fff}.tile .p{color:#4ade80;font-weight:700}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{background:#111827;border:1px solid #1f2937;border-radius:999px;padding:6px 12px;font-size:13px;text-decoration:none}.links a:hover{border-color:#f97316}
.bar{display:none}footer{border-top:1px solid #1f2937;padding:24px 16px;text-align:center;font-size:13px;color:#6b7280}footer a{margin:0 8px}
.warn{background:#422006;color:#fde68a;border-radius:12px;padding:10px 14px;font-size:13px;margin-top:16px}
@media(max-width:760px){.gal{height:280px;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.gal img,.gal img:nth-child(n+4){display:block;flex:0 0 100%;scroll-snap-align:center}.cols{grid-template-columns:1fr}.card{position:static}h1{font-size:23px}
.bar{display:flex;gap:8px;position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#0b0f19;border-top:1px solid #1f2937;z-index:9}.bar .btn{flex:1}}`;

export function layout({ title, desc, canonical, image, jsonld, body, status }) {
  return `<!doctype html><html lang="en-IN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0b0f19">${status === 404 ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="EasyHouseHunt"><meta property="og:locale" content="en_IN">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(image || SITE + "/og-image.png")}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(image || SITE + "/og-image.png")}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
<style>${CSS}</style></head><body>
<header><a class="brand" href="/">EasyHouse<span>Hunt</span></a><a class="btn btn-o" style="padding:9px 14px;font-size:14px" href="/">Open map</a></header>
${body}
<footer>Zero brokerage · direct to owners · Bengaluru<br><br><a href="/rent">Homes by area</a><a href="/office-space">Office space</a><a href="/about.html">About</a><a href="/contact.html">Contact</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer>
</body></html>`;
}

export function tile(p) {
  const ph = photos(p)[0];
  return `<a class="tile" href="${esc(listingPath(p))}">${ph ? `<img src="${esc(ph)}" alt="${esc(p.title)}" loading="lazy">` : `<div class="ph"></div>`}
<div><b>${esc(sizeLabel(p))} · ${esc(p.title || "Home")}</b><span class="p">${esc(priceLabel(p))}</span><br><span class="muted" style="font-size:13px">${esc((p.address || "").split(",").slice(0, 2).join(","))}</span></div></a>`;
}
