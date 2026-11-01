// Shareable listing links: https://easyhousehunt.com/l/2bhk-karle-vario-homes-k7x2qm
// (readable slug + 6-char share code; the database ID is never exposed). Old /l/<uuid> links still work.
// Serves a tiny page with the listing's title, price and photo as link-preview tags
// (WhatsApp, Facebook, LinkedIn, X), then forwards people to the app with that listing open.

const SITE = "https://easyhousehunt.com";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z2-9]{6}$/;

function availability(date) {
  if (!date) return "Available now";
  const d = new Date(date + "T00:00:00");
  if (d <= new Date()) return "Available now";
  return "Available from " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const seg = String(req.query.id || "").trim();
  const legacyId = UUID.test(seg) ? seg : null;
  const code = legacyId ? null : (seg.split("-").pop() || "");
  const valid = !!legacyId || CODE.test(code);
  const filter = legacyId ? `id=eq.${legacyId}` : `share_code=eq.${code}`;

  let p = null;
  if (valid && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/properties?${filter}&status=eq.approved&select=*`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      );
      if (r.ok) p = (await r.json())[0] || null;
    } catch { /* fall through to a generic preview */ }
  }

  let title = "EasyHouseHunt · Rental homes in Bengaluru";
  let desc = "Find your next home in Bengaluru, the easy way. Zero brokerage, direct to owners.";
  let image = `${SITE}/og-image.png`;

  if (p) {
    const size = p.property_type === "Commercial" ? (p.commercial_type || "Commercial space")
      : p.property_type === "PG" ? "PG" : p.bhk ? `${p.bhk} BHK` : p.property_type || "Home";
    const price = p.listing_type === "sale" && p.sale_price ? inr(p.sale_price) : p.rent ? `${inr(p.rent)}/month` : "";
    title = [`${size} · ${p.title || "Home for rent"}`, price].filter(Boolean).join(" · ");
    const bits = [
      p.furnishing && `${p.furnishing === "Semi" ? "Semi-furnished" : p.furnishing}`,
      p.area_sqft && `${p.area_sqft} sq ft`,
      p.listing_type !== "sale" && availability(p.availability_date),
      p.availability === "reserved" && "Reserved",
    ].filter(Boolean).join(" · ");
    const text = String(p.description || "").replace(/\s+/g, " ").trim();
    desc = [bits, text.length > 160 ? text.slice(0, 157) + "…" : text].filter(Boolean).join(". ");
    const photo = (p.media_urls || []).find((u) => /^https:\/\//i.test(u));
    if (photo) image = photo;
  }

  // Always point people at the short link and open the app by code, never by database ID.
  const slug = p ? [p.property_type === "PG" ? "pg" : p.property_type === "Commercial" ? "commercial" : p.bhk ? `${p.bhk}bhk` : "", p.title || "home"].join(" ")
    .toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") : "";
  const url = p?.share_code ? `${SITE}/l/${slug}-${p.share_code}` : `${SITE}/`;
  const appUrl = p?.share_code ? `${SITE}/?p=${p.share_code}` : legacyId && p ? `${SITE}/?p=${legacyId}` : `${SITE}/`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(p || !valid ? 200 : 404).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="EasyHouseHunt">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)})</script>
<style>body{font-family:system-ui,sans-serif;background:#0F172A;color:#F8FAFC;display:grid;place-items:center;height:100vh;margin:0}a{color:#FB923C}</style>
</head><body><p>Opening <a href="${esc(appUrl)}">${esc(p?.title || "EasyHouseHunt")}</a>…</p></body></html>`);
}
