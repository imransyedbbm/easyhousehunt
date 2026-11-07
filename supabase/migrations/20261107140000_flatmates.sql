-- Flatmate listings (a room in a shared flat, property_type = 'Flatmate').
-- Matching: a requirement for "Any" home no longer matches rooms; only requirements for 'Flatmate' do.
-- Flat size (BHK) is ignored for rooms. Safe to run more than once.
CREATE OR REPLACE FUNCTION public.requirement_fits(
  r public.requirements, _lat FLOAT8, _lng FLOAT8, _ptype TEXT, _bhk INT, _rent NUMERIC, _furnishing TEXT,
  _available DATE DEFAULT NULL, _preferred TEXT[] DEFAULT '{}')
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    r.status = 'active'
    AND (r.property_type = COALESCE(_ptype, 'Apartment')
         OR (r.property_type = 'Any' AND COALESCE(_ptype, 'Apartment') NOT IN ('Commercial', 'Flatmate')))
    AND (cardinality(r.bhk) = 0 OR COALESCE(_ptype, '') IN ('PG', 'Commercial', 'Flatmate') OR _bhk = ANY (r.bhk)
         OR (_bhk >= 4 AND 4 = ANY (r.bhk)))
    AND (r.budget_max IS NULL OR _rent IS NULL OR _rent <= r.budget_max * 1.10)
    AND (cardinality(r.furnishing) = 0 OR _furnishing IS NULL OR _furnishing = ANY (r.furnishing))
    AND (r.move_in IS NULL OR (
          COALESCE(_available, CURRENT_DATE) <= r.move_in + 15
      AND r.move_in <= GREATEST(COALESCE(_available, CURRENT_DATE), CURRENT_DATE) + 45))
    AND (r.tenant_type IS NULL OR _preferred IS NULL OR cardinality(_preferred) = 0
         OR r.tenant_type = ANY (_preferred))
    AND _lat IS NOT NULL AND _lng IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r.areas) a
      WHERE public.km_between((a->>'lat')::float8, (a->>'lng')::float8, _lat, _lng) <= r.radius_km
    );
$$;
