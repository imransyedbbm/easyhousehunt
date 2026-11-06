-- Owner insights + listing freshness. Safe to run more than once.
--  1. listing_views: one row per (listing, visitor, day); written only via log_listing_view().
--  2. listing_stats(): views / saves / enquiries for the signed-in owner's listings.
--  3. confirmed_at + confirm_listing() / mark_listing_let_out(): owners keep listings fresh
--     without an edit sending them back to review.
--  4. rent_benchmark(): median rent of similar live homes nearby, for price suggestions.

CREATE TABLE IF NOT EXISTS public.listing_views (
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  visitor     TEXT NOT NULL,              -- auth user id, or a random per-browser id
  day         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  source      TEXT,                       -- 'app' | 'share'
  PRIMARY KEY (property_id, visitor, day)
);
ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;  -- no policies: only the functions below touch it
CREATE INDEX IF NOT EXISTS listing_views_property_idx ON public.listing_views (property_id);

CREATE OR REPLACE FUNCTION public.log_listing_view(p_property UUID, p_visitor TEXT, p_source TEXT DEFAULT 'app')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v TEXT := COALESCE(auth.uid()::text, left(p_visitor, 64));
BEGIN
  IF v IS NULL OR length(v) < 8 THEN RETURN; END IF;
  -- Owners viewing their own listing don't count.
  IF EXISTS (SELECT 1 FROM properties WHERE id = p_property AND landlord_id::text = v) THEN RETURN; END IF;
  INSERT INTO listing_views (property_id, visitor, source)
  SELECT p_property, v, left(COALESCE(p_source, 'app'), 10)
  WHERE EXISTS (SELECT 1 FROM properties WHERE id = p_property AND status = 'approved')
  ON CONFLICT DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.log_listing_view(UUID, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.listing_stats()
RETURNS TABLE (property_id UUID, views BIGINT, views_7d BIGINT, saves BIGINT, enquiries BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
    (SELECT count(*) FROM listing_views v WHERE v.property_id = p.id),
    (SELECT count(*) FROM listing_views v WHERE v.property_id = p.id AND v.day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 7),
    (SELECT count(*) FROM saved_properties s WHERE s.property_id::text = p.id::text),
    (SELECT count(DISTINCT m.sender_id) FROM messages m WHERE m.property_id::text = p.id::text AND m.sender_id::text <> p.landlord_id::text)
  FROM properties p
  WHERE p.landlord_id::text = auth.uid()::text;
$$;
GRANT EXECUTE ON FUNCTION public.listing_stats() TO authenticated;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
UPDATE public.properties SET confirmed_at = COALESCE(updated_at, created_at, now()) WHERE confirmed_at IS NULL;
ALTER TABLE public.properties ALTER COLUMN confirmed_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.confirm_listing(p_property UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE properties SET confirmed_at = now() WHERE id = p_property AND landlord_id::text = auth.uid()::text;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_listing(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_listing_let_out(p_property UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE properties SET availability = 'let_out', confirmed_at = now() WHERE id = p_property AND landlord_id::text = auth.uid()::text;
$$;
GRANT EXECUTE ON FUNCTION public.mark_listing_let_out(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_listing_available(p_property UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE properties SET availability = 'available', confirmed_at = now() WHERE id = p_property AND landlord_id::text = auth.uid()::text;
$$;
GRANT EXECUTE ON FUNCTION public.mark_listing_available(UUID) TO authenticated;

-- Median rent of live, real rental listings within ~2 km with the same type/BHK.
CREATE OR REPLACE FUNCTION public.rent_benchmark(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_type TEXT, p_bhk INT)
RETURNS TABLE (median INT, low INT, high INT, n INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT rent FROM properties
    WHERE status = 'approved' AND COALESCE(is_sample, false) = false AND listing_type = 'rent' AND rent > 0
      AND latitude BETWEEN p_lat - 0.018 AND p_lat + 0.018
      AND longitude BETWEEN p_lng - 0.019 AND p_lng + 0.019
      AND COALESCE(property_type, 'Apartment') = COALESCE(p_type, 'Apartment')
      AND (p_bhk IS NULL OR bhk = p_bhk)
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rent)::int,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY rent)::int,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY rent)::int,
         count(*)::int
  FROM c HAVING count(*) >= 3;   -- too few comparables = no suggestion
$$;
GRANT EXECUTE ON FUNCTION public.rent_benchmark(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INT) TO anon, authenticated;
