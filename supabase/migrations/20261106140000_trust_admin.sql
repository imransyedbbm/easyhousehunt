-- Trust & admin: listing reports, admin-only fields guard, admin weekly stats. Safe to run more than once.

-- 1. Guard: only admins (or the service role) may approve listings or set the Verified badge.
--    Before this, an owner could call the API directly and approve their own listing.
--    Also: owner edits to a rejected listing now send it back to Pending.
CREATE OR REPLACE FUNCTION public.guard_admin_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_admin BOOLEAN := auth.uid() IS NULL  -- service role / SQL editor
  OR COALESCE((SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid()), false)
  OR public.has_role(auth.uid(), 'admin');
BEGIN
  IF is_admin THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.is_verified := false;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Only admins can change a listing to %', NEW.status;
  END IF;
  -- An owner editing a rejected listing resubmits it for review.
  IF OLD.status = 'rejected' AND NEW.status = 'rejected' THEN NEW.status := 'pending'; END IF;
  NEW.is_verified := OLD.is_verified;
  NEW.rejection_reason := CASE WHEN NEW.status = 'pending' THEN NULL ELSE OLD.rejection_reason END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_admin_fields ON public.properties;
CREATE TRIGGER guard_admin_fields BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_fields();

-- 2. Listing reports from tenants.
CREATE TABLE IF NOT EXISTS public.listing_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL DEFAULT auth.uid(),
  reason      TEXT NOT NULL CHECK (reason IN ('let_out', 'wrong_details', 'fake', 'broker', 'other')),
  details     TEXT CHECK (char_length(details) <= 500),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (property_id, reporter_id)   -- one report per person per listing
);
ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS listing_reports_open_idx ON public.listing_reports (status, created_at DESC);

DROP POLICY IF EXISTS "Reports: signed-in users file their own" ON public.listing_reports;
CREATE POLICY "Reports: signed-in users file their own" ON public.listing_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND status = 'open');
DROP POLICY IF EXISTS "Reports: reporter or admin reads" ON public.listing_reports;
CREATE POLICY "Reports: reporter or admin reads" ON public.listing_reports
  FOR SELECT USING (reporter_id = auth.uid() OR public.is_site_admin());
DROP POLICY IF EXISTS "Reports: admin updates" ON public.listing_reports;
CREATE POLICY "Reports: admin updates" ON public.listing_reports
  FOR UPDATE USING (public.is_site_admin());

-- 3. Admin weekly numbers (last 7 days vs the 7 before).
CREATE OR REPLACE FUNCTION public.admin_weekly_stats()
RETURNS TABLE (metric TEXT, this_week BIGINT, last_week BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w1 TIMESTAMPTZ := now() - interval '7 days'; w2 TIMESTAMPTZ := now() - interval '14 days';
BEGIN
  IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
    SELECT 'New listings', count(*) FILTER (WHERE created_at >= w1), count(*) FILTER (WHERE created_at >= w2 AND created_at < w1) FROM properties WHERE COALESCE(is_sample, false) = false
    UNION ALL
    SELECT 'Enquiries', count(DISTINCT (property_id::text || sender_id::text)) FILTER (WHERE created_at >= w1),
                        count(DISTINCT (property_id::text || sender_id::text)) FILTER (WHERE created_at >= w2 AND created_at < w1) FROM messages
    UNION ALL
    SELECT 'Sign-ups', count(*) FILTER (WHERE created_at >= w1), count(*) FILTER (WHERE created_at >= w2 AND created_at < w1) FROM auth.users
    UNION ALL
    SELECT 'Listing views', count(*) FILTER (WHERE day >= w1::date), count(*) FILTER (WHERE day >= w2::date AND day < w1::date) FROM listing_views
    UNION ALL
    SELECT 'Requirements', count(*) FILTER (WHERE created_at >= w1), count(*) FILTER (WHERE created_at >= w2 AND created_at < w1) FROM requirements
    UNION ALL
    SELECT 'Let out', count(*) FILTER (WHERE availability = 'let_out' AND confirmed_at >= w1), count(*) FILTER (WHERE availability = 'let_out' AND confirmed_at >= w2 AND confirmed_at < w1) FROM properties;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_weekly_stats() TO authenticated;
