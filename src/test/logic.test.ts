import { describe, it, expect } from "vitest";
import { listingQuality, rankScore } from "@/lib/quality";
import { driveMinutes, isNewListing, distanceMeters, formatDistance } from "@/lib/geo";
import { freshnessLabel, daysSince } from "@/lib/insights";
import { listingSlug, listingUrl, linkKey } from "@/lib/share";
import { shortlistUrl } from "@/lib/invite";
import { LOCALITIES } from "@/data/localities";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("listingQuality", () => {
  it("scores an empty listing low and asks for a photo first", () => {
    const q = listingQuality({ property_type: "Apartment" });
    expect(q.score).toBeLessThan(25);
    expect(q.tips[0].key).toBe("photo");
  });
  it("scores a complete listing 100", () => {
    const q = listingQuality({
      media_urls: ["https://a", "https://b", "https://c", "https://d"], description: "x".repeat(150),
      amenities: ["Lift", "Gym", "Parking"], area_sqft: 1100, deposit: 100000, furnishing: "Semi",
      availability_date: "2026-12-01", preferred_tenants: ["Family"], property_type: "Apartment", latitude: 12.9,
    });
    expect(q.score).toBe(100);
    expect(q.tips).toHaveLength(0);
  });
  it("ignores non-https photo URLs", () => {
    expect(listingQuality({ media_urls: ["javascript:alert(1)"] }).tips.some((t) => t.key === "photo")).toBe(true);
  });
  it("does not ask PGs for furnishing or preferred tenants", () => {
    const keys = listingQuality({ property_type: "PG" }).tips.map((t) => t.key);
    expect(keys).not.toContain("furn");
    expect(keys).not.toContain("pref");
  });
  it("ranks fresh + verified above stale", () => {
    expect(rankScore({ is_verified: true, created_at: daysAgo(0) })).toBeGreaterThan(rankScore({ created_at: daysAgo(90) }));
  });
});

describe("geo", () => {
  it("estimates drive time in 5-minute steps, minimum 3", () => {
    expect(driveMinutes(100)).toBe(3);
    expect(driveMinutes(5000) % 5).toBe(0);
    expect(driveMinutes(10000)).toBeGreaterThan(driveMinutes(5000));
  });
  it("flags listings under 7 days as new", () => {
    expect(isNewListing(daysAgo(2))).toBe(true);
    expect(isNewListing(daysAgo(9))).toBe(false);
    expect(isNewListing(null)).toBe(false);
  });
  it("measures Koramangala to Indiranagar at roughly 5 km", () => {
    const d = distanceMeters({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9719, lng: 77.6412 });
    expect(d).toBeGreaterThan(3500);
    expect(d).toBeLessThan(6000);
    expect(formatDistance(d)).toMatch(/km$/);
  });
});

describe("freshness", () => {
  it("labels recent confirmations and hides old ones", () => {
    expect(freshnessLabel(daysAgo(0))).toBe("Owner confirmed today");
    expect(freshnessLabel(daysAgo(3))).toBe("Owner confirmed 3 days ago");
    expect(freshnessLabel(daysAgo(45))).toBeNull();
    expect(daysSince(null)).toBe(Infinity);
  });
});

describe("share links", () => {
  const p = { id: "11111111-1111-1111-1111-111111111111", title: "Prestige Sunrise Park!", bhk: 2, property_type: "Apartment", share_code: "k7x2qm" };
  it("builds a readable slug + code and parses it back", () => {
    expect(listingSlug(p)).toBe("2bhk-prestige-sunrise-park");
    expect(listingUrl(p)).toBe("https://easyhousehunt.com/l/2bhk-prestige-sunrise-park-k7x2qm");
    expect(linkKey("2bhk-prestige-sunrise-park-k7x2qm")).toEqual({ code: "k7x2qm" });
    expect(linkKey(p.id)).toEqual({ id: p.id });
    expect(linkKey("nonsense")).toBeNull();
  });
  it("caps shortlists at 10 homes", () => {
    expect(shortlistUrl(Array(12).fill("abc234")).split("/s/")[1].split("-")).toHaveLength(10);
  });
});

describe("localities", () => {
  it("are inside Bengaluru and uniquely named", () => {
    const names = new Set<string>();
    for (const l of LOCALITIES) {
      expect(l.lat).toBeGreaterThan(12.6); expect(l.lat).toBeLessThan(13.4);
      expect(l.lng).toBeGreaterThan(77.3); expect(l.lng).toBeLessThan(77.9);
      expect(names.has(l.name)).toBe(false); names.add(l.name);
    }
  });
});
