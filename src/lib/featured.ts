/** Boost plans shown to owners. Prices are display-only; payment is collected offline for now. */
export const BOOST_PLANS = [
  { days: 7, label: "7 days", price: 299 },
  { days: 15, label: "15 days", price: 499 },
  { days: 30, label: "30 days", price: 799 },
] as const;

export const isFeatured = (p: { featured_until?: string | null }) =>
  !!p.featured_until && new Date(p.featured_until).getTime() > Date.now();

export const featuredUntil = (days: number, from = new Date()) => new Date(from.getTime() + days * 86_400_000).toISOString();
