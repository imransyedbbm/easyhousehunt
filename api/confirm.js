// One-tap buttons from the owner reminder email: /api/confirm?t=<token>&a=available|let_out
// GET shows a confirmation button (so email link scanners can't trigger it); POST applies it.
import { SITE, esc, env, layout, listingPath } from "./_lib/page.js";

async function apply(token, action) {
  const { url, key } = env();
  const r = await fetch(`${url}/rest/v1/rpc/confirm_by_token`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token, p_action: action }),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const q = req.method === "POST" ? Object.fromEntries(new URLSearchParams(await readBody(req))) : req.query;
  const token = String(q.t || "");
  const action = q.a === "let_out" ? "let_out" : "available";
  const label = action === "let_out" ? "Mark as let out / sold" : "Yes, it's still available";
  const page = (title, body) => layout({ title: `${title} · EasyHouseHunt`, desc: "", canonical: SITE + "/", status: 404, body: `<main style="max-width:520px;text-align:center;padding-top:60px">${body}</main>` });

  if (!/^[a-f0-9]{20,64}$/.test(token)) {
    res.status(400).send(page("Link not valid", `<h1>This link isn't valid</h1><p class="muted">Manage your listing from My Dashboard instead.</p><p><a class="btn btn-o" href="/">Open EasyHouseHunt</a></p>`));
    return;
  }

  if (req.method !== "POST") {
    res.status(200).send(page("Confirm", `<h1>${action === "let_out" ? "Has it been let out?" : "Still available?"}</h1>
<p class="muted">${action === "let_out" ? "We'll take the listing off the map. You can put it back any time from My Dashboard." : "We'll mark it as confirmed today, so tenants know it's fresh."}</p>
<form method="post"><input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="a" value="${action}">
<button class="btn ${action === "let_out" ? "btn-d" : "btn-g"}" style="width:100%;margin-top:12px">${label}</button></form>`));
    return;
  }

  const row = await apply(token, action);
  if (!row) {
    res.status(404).send(page("Not found", `<h1>We couldn't find that listing</h1><p class="muted">It may have been removed.</p><p><a class="btn btn-o" href="/">Open EasyHouseHunt</a></p>`));
    return;
  }
  const link = row.share_code ? listingPath({ title: row.title, share_code: row.share_code }) : "/";
  res.status(200).send(page("Done", action === "let_out"
    ? `<h1>Congratulations! 🎉</h1><p class="muted">"${esc(row.title)}" is off the map now.</p><p><a class="btn btn-o" href="/?list=1">List another property</a></p>`
    : `<h1>Thanks, you're all set ✓</h1><p class="muted">"${esc(row.title)}" is confirmed as available today.</p><p><a class="btn btn-o" href="${esc(link)}">View your listing</a></p>`));
}

function readBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (req.body && typeof req.body === "object") return Promise.resolve(new URLSearchParams(req.body).toString());
  return new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); });
}
