export type Property = {
  listing_type?: string | null;
  sale_price?: number | null;
  is_sample?: boolean | null;
  commercial_type?: string | null;
  share_code?: string | null;
  availability_date?: string | null;
  /** Last time the owner confirmed the listing is still available. */
  confirmed_at?: string | null;
  /** Paid/admin boost: shown first with a Featured badge until this time. */
  featured_until?: string | null;
  /** PG / Flatmate only. */
  gender_preference?: string | null;
  bathroom_type?: string | null;
  preferred_tenants?: string[] | null;
  availability?: "available" | "reserved" | "let_out" | string | null;
  distance_m?: number | null;
  /** When an area/office is picked: "2.1 km · ~12 min drive to Manyata Tech Park". */
  distance_label?: string | null;
  created_at?: string | null;
  property_type?: string | null;
  occupancy?: string | null;
  is_verified?: boolean | null;
  landlord_id?: string | null;
  id: string;
  title: string;
  rent: number;
  bhk?: number | null;
  address?: string;
  latitude: number | null;
  longitude: number | null;
  deposit?: number | null;
  furnishing?: string | null;
  area_sqft?: number | null;
  description?: string | null;
  amenities?: string[];
  media_urls?: string[];
  image_url?: string | null;
};
