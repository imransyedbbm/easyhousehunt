// Checks the live site from the outside. Exit code 1 (and a list of problems) if anything is wrong.
// Usage: node scripts/health-check.mjs [https://easyhousehunt.com]
const SITE = (process.argv[2] || "https://easyhousehunt.com").replace(/\/$/, "");
const problems = [];

async function check(name, path, test) {
  try {
    const r = await fetch(SITE + path, { redirect: "follow", headers: { "User-Agent": "EasyHouseHunt-HealthCheck" } });
    const body = await r.text();
    const why = await test(r, body);
    console.log(`${why ? "✗" : "✓"} ${name}${why ? ` — ${why}` : ""}`);
    if (why) problems.push(`${name}: ${why}`);
    return body;
  } catch (e) {
    console.log(`✗ ${name} — ${e.message}`);
    problems.push(`${name}: ${e.message}`);
    return "";
  }
}

await check("Home page", "/", (r, b) => (r.status !== 200 ? `HTTP ${r.status}` : !b.includes('id="root"') ? "app shell missing" : null));
const sitemap = await check("Sitemap", "/sitemap.xml", (r, b) => {
  if (r.status !== 200) return `HTTP ${r.status}`;
  if (!b.includes("/rent/koramangala")) return "area pages missing";
  // No listing URLs means the database query is failing (e.g. a missing column) — the map would be empty too.
  if (!/\/l\/[a-z0-9-]+<\/loc>/.test(b)) return "no listings in sitemap — listings query is probably failing";
  return null;
});
await check("Area page", "/rent/koramangala", (r, b) => (r.status !== 200 ? `HTTP ${r.status}` : !b.includes("Homes for rent in Koramangala") ? "content missing" : null));
const first = sitemap.match(/<loc>(https?:\/\/[^<]+\/l\/[^<]+)<\/loc>/)?.[1];
if (first) {
  await check("A listing page", new URL(first).pathname, (r, b) => (r.status !== 200 ? `HTTP ${r.status}` : !b.includes("RealEstateListing") ? "structured data missing" : null));
}
await check("Web app manifest", "/site.webmanifest", (r, b) => (r.status !== 200 ? `HTTP ${r.status}` : !b.includes('"start_url"') ? "invalid" : null));

if (problems.length) {
  console.error(`\n${problems.length} problem(s) on ${SITE}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nAll good on ${SITE}.`);
