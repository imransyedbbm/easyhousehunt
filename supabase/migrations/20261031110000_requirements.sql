-- "Post your requirement": tenants save what they are looking for; the site matches new listings to them.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT,
  phone TEXT,
  areas JSONB NOT NULL DEFAULT '[]'::jsonb,         -- [{ "name": "Indiranagar", "lat": 12.97, "lng": 77.64 }]
  radius_km NUMERIC NOT NULL DEFAULT 3 CHECK (radius_km BETWEEN 0.5 AND 25),
  property_type TEXT NOT NULL DEFAULT 'Any',         -- Any | Apartment | Independent House | PG
  bhk INT[] NOT NULL DEFAULT '{}',                    -- empty = any
  budget_max INT CHECK (budget_max IS NULL OR budget_max > 0),
  furnishing TEXT[] NOT NULL DEFAULT '{}',            -- empty = any; values: Unfurnished | Semi | Fully Furnished
  move_in DATE,
  tenant_type TEXT,                                   -- Family | Bachelor(s) | Working professional | Student | Any
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(areas) = 'array' AND jsonb_array_length(areas) BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_requirements_user ON public.requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_requirements_active ON public.requirements(status) WHERE status = 'active';

-- Already-notified pairs, so nobody is emailed twice about the same home.
CREATE TABLE IF NOT EXISTS public.requirement_notifications (
  requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (requirement_id, property_id)
);
ALTER TABLE public.requirement_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

DROP POLICY IF EXISTS "Own requirements: read" ON public.requirements;
CREATE POLICY "Own requirements: read" ON public.requirements
  FOR SELECT USING (user_id = auth.uid() OR public.is_site_admin());
DROP POLICY IF EXISTS "Own requirements: insert" ON public.requirements;
CREATE POLICY "Own requirements: insert" ON public.requirements
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own requirements: update" ON public.requirements;
CREATE POLICY "Own requirements: update" ON public.requirements
  FOR UPDATE USING (user_id = auth.uid() OR public.is_site_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_site_admin());
DROP POLICY IF EXISTS "Own requirements: delete" ON public.requirements;
CREATE POLICY "Own requirements: delete" ON public.requirements
  FOR DELETE USING (user_id = auth.uid());

-- Max 3 active requirements per person (stops spam).
CREATE OR REPLACE FUNCTION public.requirements_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'active' AND (
    SELECT count(*) FROM public.requirements
    WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id
  ) >= 3 THEN
    RAISE EXCEPTION 'You can have up to 3 active requirements. Pause or close one first.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_requirements_guard ON public.requirements;
CREATE TRIGGER trg_requirements_guard BEFORE INSERT OR UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION public.requirements_guard();

-- Great-circle distance in km.
CREATE OR REPLACE FUNCTION public.km_between(lat1 FLOAT8, lng1 FLOAT8, lat2 FLOAT8, lng2 FLOAT8)
RETURNS FLOAT8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Does a requirement fit a home? (shared by matching + demand counts)
CREATE OR REPLACE FUNCTION public.requirement_fits(
  r public.requirements, _lat FLOAT8, _lng FLOAT8, _ptype TEXT, _bhk INT, _rent NUMERIC, _furnishing TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    r.status = 'active'
    AND (r.property_type = 'Any' OR r.property_type = COALESCE(_ptype, 'Apartment'))
    AND (cardinality(r.bhk) = 0 OR COALESCE(_ptype, '') = 'PG' OR _bhk = ANY (r.bhk)
         OR (_bhk >= 4 AND 4 = ANY (r.bhk)))
    AND (r.budget_max IS NULL OR _rent IS NULL OR _rent <= r.budget_max * 1.10)   -- 10% stretch
    AND (cardinality(r.furnishing) = 0 OR _furnishing IS NULL OR _furnishing = ANY (r.furnishing))
    AND _lat IS NOT NULL AND _lng IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r.areas) a
      WHERE public.km_between((a->>'lat')::float8, (a->>'lng')::float8, _lat, _lng) <= r.radius_km
    );
$$;

-- Owners/anyone: how many active tenants are looking for a home like this? (counts only, no personal data)
CREATE OR REPLACE FUNCTION public.demand_count(
  _lat FLOAT8, _lng FLOAT8, _ptype TEXT DEFAULT NULL, _bhk INT DEFAULT NULL,
  _rent NUMERIC DEFAULT NULL, _furnishing TEXT DEFAULT NULL)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.requirements r
  WHERE public.requirement_fits(r, _lat, _lng, _ptype, _bhk, _rent, _furnishing)
    AND (auth.uid() IS NULL OR r.user_id <> auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.demand_count(FLOAT8, FLOAT8, TEXT, INT, NUMERIC, TEXT) TO anon, authenticated;

-- For the notify-matches function (service role only): who to email about this approved listing.
CREATE OR REPLACE FUNCTION public.requirement_matches_for_property(_property_id UUID)
RETURNS TABLE (requirement_id UUID, user_id UUID, email TEXT, name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.user_id, u.email::text, r.name
  FROM public.properties p
  JOIN public.requirements r
    ON public.requirement_fits(r, p.latitude, p.longitude, p.property_type, p.bhk, p.rent, p.furnishing)
  JOIN auth.users u ON u.id = r.user_id
  WHERE p.id = _property_id
    AND p.status = 'approved'
    AND COALESCE(p.listing_type, 'rent') <> 'sale'
    AND r.user_id <> p.landlord_id
    AND NOT EXISTS (SELECT 1 FROM public.requirement_notifications n
                    WHERE n.requirement_id = r.id AND n.property_id = p.id);
$$;
REVOKE ALL ON FUNCTION public.requirement_matches_for_property(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requirement_matches_for_property(UUID) TO service_role;
