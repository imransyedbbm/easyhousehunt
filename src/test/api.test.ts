// Server-rendered public pages (api/*.js), run against a mocked Supabase REST API.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { listingUrl } from "@/lib/share";
import { listingPath } from "../../api/_lib/page.js";
import { LOCALITIES as API_LOCALITIES } from "../../api/_lib/localities.js";
import { LOCALITIES } from "@/data/localities";

const HOME = {
  id: "11111111-1111-1111-1111-111111111111", title: "Prestige Sunrise Park", bhk: 2, rent: 38000, deposit: 150000,
  furnishing: "Semi", area_sqft: 1150, property_type: "Apartment", listing_type: "rent", status: "approved",
  address: "5th Block, Koramangala, Bengaluru", latitude: 12.9352, longitude: 77.6245, share_code: "k7x2qm",
  media_urls: ["https://img.example/1.jpg"], amenities: ["Lift", "Gym"], description: "Bright <b>east</b>-facing home.",
  availability: "available", created_at: "2026-10-20", is_verified: true,
};

type Res = { code?: number; body: string; headers: Record<string, string> };
const res = (): Res & { setHeader: (k: string, v: string) => void; status: (c: number) => any; send: (b: string) => void } => {
  const r: any = { body: "", headers: {} };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  r.status = (c: number) => { r.code = c; return r; };
  r.send = (b: string) => { r.body = b; };
  return r;
};
let rows: any[] = [];
let calls: string[] = [];

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = "https://db.example";
  process.env.VITE_SUPABASE_ANON_KEY = "anon";
  rows = [HOME]; calls = [];
  vi.stubGlobal("fetch", async (url: string) => { calls.push(String(url)); return { ok: true, json: async () => rows }; });
});

describe("listing page /l/:slug", () => {
  it("renders the listing with escaped text, JSON-LD and verified badge", async () => {
    const { default: h } = await import("../../api/listing.js");
    const r = res(); await h({ query: { id: "2bhk-prestige-sunrise-park-k7x2qm" } }, r);
    expect(r.code).toBe(200);
    expect(calls[0]).toContain("share_code=eq.k7x2qm");
    expect(r.body).toContain("₹38,000/month");
    expect(r.body).toContain("&lt;b&gt;east&lt;/b&gt;");      // owner text is escaped
    expect(r.body).toContain('"@type":"RealEstateListing"');
    expect(r.body).toContain("Verified owner");
    expect(r.body).toContain("in Koramangala");
  });
  it("404s unknown or malformed links without querying", async () => {
    const { default: h } = await import("../../api/listing.js");
    rows = [];
    const r = res(); await h({ query: { id: "bad link'--" } }, r);
    expect(r.code).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe("area pages /rent", () => {
  it("lists homes near the area", async () => {
    const { default: h } = await import("../../api/rent.js");
    const r = res(); await h({ query: { area: "koramangala" } }, r);
    expect(r.code).toBe(200);
    expect(r.body).toContain("Homes for rent in Koramangala");
    expect(r.body).toContain("Prestige Sunrise Park");
  });
  it("has an index and 404s unknown areas", async () => {
    const { default: h } = await import("../../api/rent.js");
    const a = res(); await h({ query: {} }, a); expect(a.code).toBe(200);
    const b = res(); await h({ query: { area: "atlantis" } }, b); expect(b.code).toBe(404);
  });
});

describe("sitemap", () => {
  it("includes areas and listings", async () => {
    const { default: h } = await import("../../api/sitemap.js");
    const r = res(); await h({ query: {} }, r);
    expect(r.body).toContain("/rent/koramangala");
    expect(r.body).toContain("/l/2bhk-prestige-sunrise-park-k7x2qm");
    expect(calls[0]).not.toContain("updated_at");               // column doesn't exist in production
  });
});

describe("shortlist /s/:codes", () => {
  it("dedupes and validates codes", async () => {
    const { default: h } = await import("../../api/shortlist.js");
    const r = res(); await h({ query: { codes: "k7x2qm-BAD!!-k7x2qm" } }, r);
    expect(calls[0]).toContain("share_code=in.(k7x2qm)");
    expect(r.code).toBe(200);
  });
});

describe("one-tap confirm /api/confirm", () => {
  it("GET only shows a button; POST applies", async () => {
    const { default: h } = await import("../../api/confirm.js");
    const t = "a".repeat(36);
    rows = [{ title: "Prestige Sunrise Park", share_code: "k7x2qm", action: "available" }];
    const g = res(); await h({ method: "GET", query: { t, a: "available" } }, g);
    expect(g.body).toContain('<form method="post">');
    expect(calls).toHaveLength(0);
    const p = res(); await h({ method: "POST", body: `t=${t}&a=available`, query: {} }, p);
    expect(calls[0]).toContain("rpc/confirm_by_token");
    expect(p.body).toContain("all set");
  });
});

describe("client and server agree", () => {
  it("build identical listing links", () => {
    expect("https://easyhousehunt.com" + listingPath(HOME)).toBe(listingUrl(HOME as any));
  });
  it("have the same localities", () => {
    expect(API_LOCALITIES.map((l: any) => l.name)).toEqual(LOCALITIES.map((l) => l.name));
  });
});
