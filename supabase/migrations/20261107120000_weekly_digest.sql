-- Weekly "new homes for you" email. Uses the same matching rules as instant alerts (requirement_fits).
-- Safe to run more than once. Scheduling is at the bottom (fill in <CRON_SECRET>).

CREATE TABLE IF NOT EXISTS public.digest_optouts (
  user_id    UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.digest_optouts ENABLE ROW LEVEL SECURITY;   -- no policies: only the edge function (service role)

-- Approved rental listings created since p_since that fit each active requirement, one row per (user, home).
CREATE OR REPLACE FUNCTION public.weekly_digest_matches(p_since TIMESTAMPTZ)
RETURNS TABLE (user_id UUID, email TEXT, name TEXT, area TEXT, property_id UUID, title TEXT, rent INT, bhk INT,
               property_type TEXT, furnishing TEXT, address TEXT, media_urls TEXT[], share_code TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (r.user_id, p.id)
         r.user_id, u.email::text, r.name, (r.areas->0->>'name'), p.id, p.title, p.rent::int, p.bhk,
         p.property_type, p.furnishing, p.address, p.media_urls, p.share_code, p.created_at
  FROM public.requirements r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.properties p
    ON public.requirement_fits(r, p.latitude, p.longitude, p.property_type, p.bhk, p.rent, p.furnishing)
  WHERE r.status = 'active'
    AND p.status = 'approved'
    AND COALESCE(p.is_sample, false) = false
    AND COALESCE(p.listing_type, 'rent') <> 'sale'
    AND COALESCE(p.availability, 'available') <> 'let_out'
    AND p.created_at >= p_since
    AND p.landlord_id <> r.user_id
    AND NOT EXISTS (SELECT 1 FROM public.digest_optouts o WHERE o.user_id = r.user_id)
  ORDER BY r.user_id, p.id;
$$;
REVOKE ALL ON FUNCTION public.weekly_digest_matches(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_digest_matches(TIMESTAMPTZ) TO service_role;

-- ── Schedule: Saturdays 10:00 IST. Replace <CRON_SECRET> and run once (pg_cron + pg_net already enabled). ──
-- select cron.schedule('weekly-digest', '30 4 * * 6',
--   $$ select net.http_post(
--        url := 'https://skvlnxlbdyjxroxwqmeq.supabase.co/functions/v1/weekly-digest',
--        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--        body := '{}'::jsonb) $$);
