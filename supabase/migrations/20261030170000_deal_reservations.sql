-- Listing availability follows deals:
--   available -> reserved  (both sides agree a deal; not for PG, which has several beds)
--   reserved  -> let_out   (owner confirms the tenant moved in; listing leaves the map)
--   reserved  -> available (owner cancels the deal; listing reopens for everyone)
-- Run AFTER 20261030160000_deals.sql. Safe to run more than once.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available';
DO $$ BEGIN
  ALTER TABLE public.properties
    ADD CONSTRAINT properties_availability_check CHECK (availability IN ('available', 'reserved', 'let_out'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Agree / withdraw (replaces the earlier version: adds the reservation rules).
CREATE OR REPLACE FUNCTION public.set_deal_agreement(_property_id UUID, _other_user UUID, _agree BOOLEAN)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
  _landlord UUID;
  _ptype TEXT;
  _tenant UUID;
  _row public.deals;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT landlord_id, property_type INTO _landlord, _ptype FROM public.properties WHERE id = _property_id;
  IF _landlord IS NULL THEN RAISE EXCEPTION 'Property not found'; END IF;

  IF _me = _landlord THEN _tenant := _other_user;
  ELSIF _other_user = _landlord THEN _tenant := _me;
  ELSE RAISE EXCEPTION 'Only the owner and a tenant of this property can agree a deal';
  END IF;
  IF _tenant = _landlord THEN RAISE EXCEPTION 'Invalid deal'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.property_id = _property_id
      AND ((m.sender_id = _tenant AND m.receiver_id = _landlord)
        OR (m.sender_id = _landlord AND m.receiver_id = _tenant))
  ) THEN
    RAISE EXCEPTION 'Start a conversation before agreeing a deal';
  END IF;

  -- One deal at a time for a whole home (PG rooms can have several).
  IF _agree AND COALESCE(_ptype, '') <> 'PG' AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.property_id = _property_id AND d.tenant_id <> _tenant
      AND d.agreed_at IS NOT NULL AND d.cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This property is already reserved for another tenant';
  END IF;

  INSERT INTO public.deals (property_id, tenant_id, landlord_id)
  VALUES (_property_id, _tenant, _landlord)
  ON CONFLICT (property_id, tenant_id) DO NOTHING;

  SELECT * INTO _row FROM public.deals
  WHERE property_id = _property_id AND tenant_id = _tenant FOR UPDATE;

  -- A cancelled deal can be agreed again from scratch.
  IF _row.cancelled_at IS NOT NULL THEN
    _row.cancelled_at := NULL; _row.agreed_at := NULL;
    _row.tenant_agreed_at := NULL; _row.landlord_agreed_at := NULL;
  END IF;

  IF _row.agreed_at IS NOT NULL AND NOT _agree THEN
    RAISE EXCEPTION 'This deal is already agreed by both sides; the owner can cancel it';
  END IF;

  IF _me = _landlord THEN
    _row.landlord_agreed_at := CASE WHEN _agree THEN COALESCE(_row.landlord_agreed_at, now()) END;
  ELSE
    _row.tenant_agreed_at := CASE WHEN _agree THEN COALESCE(_row.tenant_agreed_at, now()) END;
  END IF;

  UPDATE public.deals SET
    tenant_agreed_at = _row.tenant_agreed_at,
    landlord_agreed_at = _row.landlord_agreed_at,
    cancelled_at = NULL,
    agreed_at = CASE WHEN _row.tenant_agreed_at IS NOT NULL AND _row.landlord_agreed_at IS NOT NULL
                     THEN COALESCE(_row.agreed_at, now()) END,
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  IF _row.agreed_at IS NOT NULL AND COALESCE(_ptype, '') <> 'PG' THEN
    UPDATE public.properties SET availability = 'reserved'
    WHERE id = _property_id AND availability = 'available';
  END IF;

  RETURN _row;
END;
$$;

-- Owner closes out an agreed deal: 'let_out' (tenant moved in) or 'cancel' (fell through).
CREATE OR REPLACE FUNCTION public.close_deal(_deal_id UUID, _action TEXT)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.deals;
BEGIN
  SELECT * INTO _row FROM public.deals WHERE id = _deal_id FOR UPDATE;
  IF _row.id IS NULL OR _row.landlord_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the owner can do this';
  END IF;
  IF _row.agreed_at IS NULL OR _row.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'There is no agreed deal to close';
  END IF;

  IF _action = 'let_out' THEN
    UPDATE public.properties SET availability = 'let_out' WHERE id = _row.property_id;
  ELSIF _action = 'cancel' THEN
    UPDATE public.deals SET cancelled_at = now(), updated_at = now() WHERE id = _row.id RETURNING * INTO _row;
    -- Reopen unless another deal is still active (PG).
    IF NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.property_id = _row.property_id
                   AND d.agreed_at IS NOT NULL AND d.cancelled_at IS NULL) THEN
      UPDATE public.properties SET availability = 'available' WHERE id = _row.property_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_deal_agreement(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_deal_agreement(UUID, UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.close_deal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_deal(UUID, TEXT) TO authenticated;

-- Cancelled deals no longer unlock RentRight.
CREATE OR REPLACE FUNCTION public.has_agreed_deal(_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deals
    WHERE agreed_at IS NOT NULL AND cancelled_at IS NULL
      AND (_user = tenant_id OR _user = landlord_id)
  );
$$;
REVOKE ALL ON FUNCTION public.has_agreed_deal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_agreed_deal(UUID) TO service_role;
