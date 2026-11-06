// Dynamic sitemap: static pages, every area page and every approved listing.
import { SITE, esc, sb, listingPath } from "./_lib/page.js";
import { LOCALITIES } from "./_lib/localities.js";

export default async function handler(req, res) {
  const rows = (await sb("properties?status=eq.approved&is_sample=eq.false&select=id,title,bhk,property_type,share_code,availability,updated_at,created_at&limit=5000")) || [];
  const today = new Date().toISOString().slice(0, 10);
  const url = (loc, lastmod, pr) => `<url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${pr ? `<priority>${pr}</priority>` : ""}</url>`;
  const urls = [
    url(`${SITE}/`, today, "1.0"),
    url(`${SITE}/rent`, today, "0.8"),
    ...LOCALITIES.map((l) => url(`${SITE}/rent/${l.slug}`, today, "0.7")),
    ...rows.filter((p) => p.availability !== "let_out").map((p) => url(SITE + listingPath(p), String(p.updated_at || p.created_at || "").slice(0, 10) || null, "0.6")),
    ...["about", "contact", "privacy", "terms"].map((n) => url(`${SITE}/${n}.html`, null, "0.3")),
  ];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
}
