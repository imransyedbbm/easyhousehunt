-- Matching v2: listing "available from" date + preferred tenants, move-in/tenant-type matching,
-- WhatsApp opt-in, and re-alerts when an owner lowers the rent.
-- Run AFTER 20261031110000_requirements.sql. Safe to run more than once.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS availability_date DATE;          -- NULL = available now
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS preferred_tenants TEXT[] NOT NULL DEFAULT '{}';  -- empty = anyone

ALTER TABLE public.requirements ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.requirement_notifications ADD COLUMN IF NOT EXISTS rent_notified NUMERIC;

-- Replace the matcher with one that also checks dates and tenant type.
DROP FUNCTION IF EXISTS public.requirement_matches_for_property(UUID);
DROP FUNCTION IF EXISTS public.demand_count(FLOAT8, FLOAT8, TEXT, INT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.requirement_fits(public.requirements, FLOAT8, FLOAT8, TEXT, INT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.requirement_fits(
  r public.requirements, _lat FLOAT8, _lng FLOAT8, _ptype TEXT, _bhk INT, _rent NUMERIC, _furnishing TEXT,
  _available DATE DEFAULT NULL, _preferred TEXT[] DEFAULT '{}')
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    r.status = 'active'
    AND (r.property_type = 'Any' OR r.property_type = COALESCE(_ptype, 'Apartment'))
    AND (cardinality(r.bhk) = 0 OR COALESCE(_ptype, '') = 'PG' OR _bhk = ANY (r.bhk)
         OR (_bhk >= 4 AND 4 = ANY (r.bhk)))
    AND (r.budget_max IS NULL OR _rent IS NULL OR _rent <= r.budget_max * 1.10)     -- 10% stretch
    AND (cardinality(r.furnishing) = 0 OR _furnishing IS NULL OR _furnishing = ANY (r.furnishing))
    -- Dates: home must be free within 15 days of the tenant's move-in, and the tenant
    -- must want to move within 45 days of the home becoming free.
    AND (r.move_in IS NULL OR (
          COALESCE(_available, CURRENT_DATE) <= r.move_in + 15
      AND r.move_in <= GREATEST(COALESCE(_available, CURRENT_DATE), CURRENT_DATE) + 45))
    -- Tenant type: only filters when both sides said something.
    AND (r.tenant_type IS NULL OR _preferred IS NULL OR cardinality(_preferred) = 0
         OR r.tenant_type = ANY (_preferred))
    AND _lat IS NOT NULL AND _lng IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r.areas) a
      WHERE public.km_between((a->>'lat')::float8, (a->>'lng')::float8, _lat, _lng) <= r.radius_km
    );
$$;

CREATE OR REPLACE FUNCTION public.demand_count(
  _lat FLOAT8, _lng FLOAT8, _ptype TEXT DEFAULT NULL, _bhk INT DEFAULT NULL,
  _rent NUMERIC DEFAULT NULL, _furnishing TEXT DEFAULT NULL,
  _available DATE DEFAULT NULL, _preferred TEXT[] DEFAULT '{}')
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.requirements r
  WHERE public.requirement_fits(r, _lat, _lng, _ptype, _bhk, _rent, _furnishing, _available, _preferred)
    AND (auth.uid() IS NULL OR r.user_id <> auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.demand_count(FLOAT8, FLOAT8, TEXT, INT, NUMERIC, TEXT, DATE, TEXT[]) TO anon, authenticated;

-- Who to alert about a listing: never alerted before ('new'), or alerted at a higher rent ('price_drop').
CREATE OR REPLACE FUNCTION public.requirement_matches_for_property(_property_id UUID)
RETURNS TABLE (requirement_id UUID, user_id UUID, email TEXT, name TEXT, phone TEXT,
               whatsapp_opt_in BOOLEAN, reason TEXT, previous_rent NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.user_id, u.email::text, r.name, r.phone, r.whatsapp_opt_in,
         CASE WHEN n.requirement_id IS NULL THEN 'new' ELSE 'price_drop' END,
         n.rent_notified
  FROM public.properties p
  JOIN public.requirements r
    ON public.requirement_fits(r, p.latitude, p.longitude, p.property_type, p.bhk, p.rent, p.furnishing,
                               p.availability_date, p.preferred_tenants)
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.requirement_notifications n ON n.requirement_id = r.id AND n.property_id = p.id
  WHERE p.id = _property_id
    AND p.status = 'approved'
    AND COALESCE(p.listing_type, 'rent') <> 'sale'
    AND COALESCE(p.availability, 'available') <> 'let_out'
    AND r.user_id <> p.landlord_id
    AND (n.requirement_id IS NULL OR (n.rent_notified IS NOT NULL AND p.rent < n.rent_notified));
$$;
REVOKE ALL ON FUNCTION public.requirement_matches_for_property(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requirement_matches_for_property(UUID) TO service_role;
