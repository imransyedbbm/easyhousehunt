-- Featured listings: admins feature a listing until a date; owners can request a boost.
-- Payment is collected offline for now (UPI / invoice). Safe to run more than once.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS properties_featured_idx ON public.properties (featured_until) WHERE featured_until IS NOT NULL;

-- Owners must not be able to feature themselves: extend the admin-fields guard.
CREATE OR REPLACE FUNCTION public.guard_admin_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_admin BOOLEAN := auth.uid() IS NULL
  OR COALESCE((SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid()), false)
  OR public.has_role(auth.uid(), 'admin');
BEGIN
  IF is_admin THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.is_verified := false;
    NEW.featured_until := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Only admins can change a listing to %', NEW.status;
  END IF;
  IF OLD.status = 'rejected' AND NEW.status = 'rejected' THEN NEW.status := 'pending'; END IF;
  NEW.is_verified := OLD.is_verified;
  NEW.featured_until := OLD.featured_until;
  NEW.rejection_reason := CASE WHEN NEW.status = 'pending' THEN NULL ELSE OLD.rejection_reason END;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS public.boost_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL DEFAULT auth.uid(),
  plan_days   INT  NOT NULL CHECK (plan_days IN (7, 15, 30)),
  phone       TEXT CHECK (char_length(phone) <= 20),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boost_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Boost: owner files for own listing" ON public.boost_requests;
CREATE POLICY "Boost: owner files for own listing" ON public.boost_requests
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = auth.uid() AND status = 'open'
    AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.landlord_id = auth.uid()));
DROP POLICY IF EXISTS "Boost: owner or admin reads" ON public.boost_requests;
CREATE POLICY "Boost: owner or admin reads" ON public.boost_requests
  FOR SELECT USING (owner_id = auth.uid() OR public.is_site_admin());
DROP POLICY IF EXISTS "Boost: admin updates" ON public.boost_requests;
CREATE POLICY "Boost: admin updates" ON public.boost_requests
  FOR UPDATE USING (public.is_site_admin());
