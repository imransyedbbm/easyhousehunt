-- First-party, privacy-friendly analytics: anonymous visitor id per browser, no IPs, no cookies banner needed.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.site_events (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  day         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  visitor     TEXT NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('visit', 'area_search', 'listing_open', 'contact_click', 'visit_request', 'list_start', 'requirement_open', 'signup')),
  area        TEXT,
  property_id UUID,
  source      TEXT
);
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;   -- no policies: write via log_event(), read via admin_analytics()
CREATE INDEX IF NOT EXISTS site_events_day_idx ON public.site_events (day, event);
CREATE INDEX IF NOT EXISTS site_events_visitor_idx ON public.site_events (visitor, day);

CREATE OR REPLACE FUNCTION public.log_event(p_visitor TEXT, p_event TEXT, p_area TEXT DEFAULT NULL, p_property UUID DEFAULT NULL, p_source TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v TEXT := left(COALESCE(auth.uid()::text, p_visitor), 64); today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v IS NULL OR length(v) < 8 THEN RETURN; END IF;
  -- Cap noise / abuse: 200 events per visitor per day, one 'visit' per visitor per day.
  IF (SELECT count(*) FROM site_events WHERE visitor = v AND day = today) >= 200 THEN RETURN; END IF;
  IF p_event = 'visit' AND EXISTS (SELECT 1 FROM site_events WHERE visitor = v AND day = today AND event = 'visit') THEN RETURN; END IF;
  INSERT INTO site_events (visitor, event, area, property_id, source)
  VALUES (v, p_event, left(p_area, 60), p_property, left(p_source, 40));
EXCEPTION WHEN check_violation THEN RETURN;
END $$;
GRANT EXECUTE ON FUNCTION public.log_event(TEXT, TEXT, TEXT, UUID, TEXT) TO anon, authenticated;

-- Admin dashboard data for the last p_days days.
CREATE OR REPLACE FUNCTION public.admin_analytics(p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date - (LEAST(GREATEST(p_days, 1), 180) - 1);
BEGIN
  IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN jsonb_build_object(
    'daily', (SELECT COALESCE(jsonb_agg(d ORDER BY d->>'day'), '[]') FROM (
      SELECT jsonb_build_object('day', g::date,
        'visitors', (SELECT count(DISTINCT visitor) FROM site_events WHERE day = g::date),
        'contacts', (SELECT count(*) FROM site_events WHERE day = g::date AND event = 'contact_click')) d
      FROM generate_series(since, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') g) x),
    'funnel', jsonb_build_object(
      'visitors',        (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since),
      'searched',        (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since AND event = 'area_search'),
      'opened_listing',  (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since AND event = 'listing_open'),
      'contacted',       (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since AND event = 'contact_click'),
      'booked_visit',    (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since AND event = 'visit_request'),
      'started_listing', (SELECT count(DISTINCT visitor) FROM site_events WHERE day >= since AND event = 'list_start')),
    'areas', (SELECT COALESCE(jsonb_agg(a ORDER BY (a->>'searches')::int DESC), '[]') FROM (
      SELECT jsonb_build_object('area', area, 'searches', count(*), 'people', count(DISTINCT visitor)) a
      FROM site_events WHERE day >= since AND event = 'area_search' AND area IS NOT NULL
      GROUP BY area ORDER BY count(*) DESC LIMIT 25) y),
    'sources', (SELECT COALESCE(jsonb_agg(s ORDER BY (s->>'visitors')::int DESC), '[]') FROM (
      SELECT jsonb_build_object('source', COALESCE(source, 'direct'), 'visitors', count(DISTINCT visitor)) s
      FROM site_events WHERE day >= since AND event = 'visit' GROUP BY COALESCE(source, 'direct') LIMIT 10) z),
    'top_listings', (SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'opens')::int DESC), '[]') FROM (
      SELECT jsonb_build_object('property_id', e.property_id, 'title', p.title, 'opens', count(*),
        'contacts', count(*) FILTER (WHERE e.event = 'contact_click')) t
      FROM site_events e JOIN properties p ON p.id = e.property_id
      WHERE e.day >= since AND e.event IN ('listing_open', 'contact_click')
      GROUP BY e.property_id, p.title ORDER BY count(*) DESC LIMIT 10) w)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.admin_analytics(INT) TO authenticated;
