-- Admins can post listings on behalf of owners who have no account/email.
-- The owner's real phone number is kept here, visible to admins only; tenants contact
-- the listing through chat (which reaches the admin), so the number stays masked.
-- Run AFTER 20261031110000_requirements.sql (uses is_site_admin). Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.listing_owner_contacts (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_name TEXT,
  owner_phone TEXT NOT NULL CHECK (length(owner_phone) BETWEEN 8 AND 20),
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_owner_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage owner contacts" ON public.listing_owner_contacts;
CREATE POLICY "Admins manage owner contacts" ON public.listing_owner_contacts
  FOR ALL USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());
