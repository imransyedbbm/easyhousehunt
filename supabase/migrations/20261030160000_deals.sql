-- Deals: a tenant and a landlord both confirm they have agreed terms for a property.
-- RentRight (rental agreement drafting) unlocks only for parties to an agreed deal.

CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  landlord_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_agreed_at TIMESTAMPTZ,
  landlord_agreed_at TIMESTAMPTZ,
  agreed_at TIMESTAMPTZ,                 -- set when both sides have agreed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, tenant_id),
  CHECK (tenant_id <> landlord_id)
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deal parties can view" ON public.deals;
CREATE POLICY "Deal parties can view" ON public.deals
  FOR SELECT USING (auth.uid() = tenant_id OR auth.uid() = landlord_id);
-- No INSERT/UPDATE/DELETE policies: changes go only through the functions below.

-- Caller marks (or withdraws) their side of the deal with the other party for a property.
CREATE OR REPLACE FUNCTION public.set_deal_agreement(_property_id UUID, _other_user UUID, _agree BOOLEAN)
RETURNS public.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
  _landlord UUID;
  _tenant UUID;
  _row public.deals;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT landlord_id INTO _landlord FROM public.properties WHERE id = _property_id;
  IF _landlord IS NULL THEN RAISE EXCEPTION 'Property not found'; END IF;

  IF _me = _landlord THEN _tenant := _other_user;
  ELSIF _other_user = _landlord THEN _tenant := _me;
  ELSE RAISE EXCEPTION 'Only the owner and a tenant of this property can agree a deal';
  END IF;
  IF _tenant = _landlord THEN RAISE EXCEPTION 'Invalid deal'; END IF;

  -- They must actually have talked about this property.
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.property_id = _property_id
      AND ((m.sender_id = _tenant AND m.receiver_id = _landlord)
        OR (m.sender_id = _landlord AND m.receiver_id = _tenant))
  ) THEN
    RAISE EXCEPTION 'Start a conversation before agreeing a deal';
  END IF;

  INSERT INTO public.deals (property_id, tenant_id, landlord_id)
  VALUES (_property_id, _tenant, _landlord)
  ON CONFLICT (property_id, tenant_id) DO NOTHING;

  SELECT * INTO _row FROM public.deals
  WHERE property_id = _property_id AND tenant_id = _tenant FOR UPDATE;

  IF _row.agreed_at IS NOT NULL AND NOT _agree THEN
    RAISE EXCEPTION 'This deal is already agreed by both sides';
  END IF;

  IF _me = _landlord THEN
    _row.landlord_agreed_at := CASE WHEN _agree THEN COALESCE(_row.landlord_agreed_at, now()) END;
  ELSE
    _row.tenant_agreed_at := CASE WHEN _agree THEN COALESCE(_row.tenant_agreed_at, now()) END;
  END IF;

  UPDATE public.deals SET
    tenant_agreed_at = _row.tenant_agreed_at,
    landlord_agreed_at = _row.landlord_agreed_at,
    agreed_at = CASE WHEN _row.tenant_agreed_at IS NOT NULL AND _row.landlord_agreed_at IS NOT NULL
                     THEN COALESCE(agreed_at, now()) END,
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_deal_agreement(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_deal_agreement(UUID, UUID, BOOLEAN) TO authenticated;

-- Used by the RentRight backend to enforce access.
CREATE OR REPLACE FUNCTION public.has_agreed_deal(_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deals
    WHERE agreed_at IS NOT NULL AND (_user = tenant_id OR _user = landlord_id)
  );
$$;
REVOKE ALL ON FUNCTION public.has_agreed_deal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_agreed_deal(UUID) TO service_role;
