// Shared shortlist: https://easyhousehunt.com/s/k7x2qm-abc234-q9w8e7
// A tenant sends their saved homes to family/flatmates as one link. No login needed to view.
import { SITE, esc, sb, layout, tile } from "./_lib/page.js";

const CODE = /^[a-z2-9]{6}$/;
const FIELDS = "id,title,bhk,rent,sale_price,listing_type,property_type,commercial_type,occupancy,address,media_urls,share_code,availability,status";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.setHeader("X-Robots-Tag", "noindex");
  const codes = [...new Set(String(req.query.codes || "").toLowerCase().split("-").filter((c) => CODE.test(c)))].slice(0, 10);
  const rows = codes.length ? await sb(`properties?share_code=in.(${codes.join(",")})&status=eq.approved&select=${FIELDS}`) : null;
  const homes = (rows || []).sort((a, b) => codes.indexOf(a.share_code) - codes.indexOf(b.share_code));
  const live = homes.filter((h) => h.availability !== "let_out");
  const gone = homes.length - live.length;
  const canonical = `${SITE}/s/${codes.join("-")}`;
  const title = live.length ? `${live.length} home${live.length > 1 ? "s" : ""} shortlisted on EasyHouseHunt` : "Shortlist · EasyHouseHunt";
  const first = live.map((h) => (h.media_urls || []).find((u) => /^https:/.test(u))).find(Boolean);
  const wa = `https://wa.me/?text=${encodeURIComponent(`Have a look at these homes I shortlisted:\n${canonical}`)}`;

  res.status(homes.length ? 200 : 404).send(layout({
    title, desc: live.slice(0, 3).map((h) => h.title).join(" · ") || "Homes in Bengaluru, direct from owners.",
    canonical, image: first, status: homes.length ? 200 : 404,
    body: `<main>
<h1>${esc(title)}</h1>
<p class="muted">Zero-brokerage homes in Bengaluru, direct from owners. Tap a home to see photos and details.</p>
${live.length ? `<div class="grid">${live.map(tile).join("")}</div>` : `<p class="muted" style="margin-top:24px">These homes are no longer listed.</p>`}
${gone ? `<p class="muted" style="margin-top:16px">${gone} home${gone > 1 ? "s have" : " has"} been let out since this was shared.</p>` : ""}
<p style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-g" href="${esc(wa)}" target="_blank" rel="noopener">Forward on WhatsApp</a><a class="btn btn-o" href="/">Find more homes</a></p>
</main>`,
  }));
}
