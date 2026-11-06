-- Site visits: tenant proposes up to 3 slots, owner confirms one. Safe to run more than once.
-- Each step also posts a line into the existing chat thread, so the usual in-app notifications fire.

CREATE TABLE IF NOT EXISTS public.visit_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  owner_id    UUID NOT NULL,
  slots       TIMESTAMPTZ[] NOT NULL CHECK (cardinality(slots) BETWEEN 1 AND 3),
  chosen_slot TIMESTAMPTZ,
  note        TEXT CHECK (char_length(note) <= 300),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS visit_requests_owner_idx ON public.visit_requests (owner_id, status);
CREATE INDEX IF NOT EXISTS visit_requests_tenant_idx ON public.visit_requests (tenant_id, status);

DROP POLICY IF EXISTS "Visits: parties read" ON public.visit_requests;
CREATE POLICY "Visits: parties read" ON public.visit_requests
  FOR SELECT USING (tenant_id = auth.uid() OR owner_id = auth.uid() OR public.is_site_admin());
-- No insert/update policies: all changes go through the functions below.

CREATE OR REPLACE FUNCTION public._visit_fmt(t TIMESTAMPTZ) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(t AT TIME ZONE 'Asia/Kolkata', 'Dy DD Mon, FMHH12:MI AM');
$$;

CREATE OR REPLACE FUNCTION public.request_visit(p_property UUID, p_slots TIMESTAMPTZ[], p_note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid(); prop RECORD; vid UUID; s TIMESTAMPTZ; txt TEXT;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  SELECT id, title, landlord_id, status, availability INTO prop FROM properties WHERE id = p_property;
  IF prop.id IS NULL OR prop.status <> 'approved' OR prop.availability = 'let_out' THEN RAISE EXCEPTION 'This listing is not available'; END IF;
  IF prop.landlord_id = me THEN RAISE EXCEPTION 'This is your own listing'; END IF;
  IF p_slots IS NULL OR cardinality(p_slots) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Pick 1 to 3 time slots'; END IF;
  FOREACH s IN ARRAY p_slots LOOP
    IF s < now() + interval '1 hour' OR s > now() + interval '30 days' THEN RAISE EXCEPTION 'Slots must be between 1 hour and 30 days from now'; END IF;
  END LOOP;

  -- One open request per tenant per listing: replace any pending one.
  UPDATE visit_requests SET status = 'cancelled', updated_at = now()
   WHERE property_id = p_property AND tenant_id = me AND status = 'pending';

  INSERT INTO visit_requests (property_id, tenant_id, owner_id, slots, note)
  VALUES (p_property, me, prop.landlord_id, p_slots, NULLIF(left(trim(COALESCE(p_note, '')), 300), ''))
  RETURNING id INTO vid;

  SELECT '📅 Visit request for "' || prop.title || '". Any of: ' || string_agg(_visit_fmt(x), ' · ' ORDER BY x)
         || COALESCE(E'\nNote: ' || NULLIF(left(trim(COALESCE(p_note, '')), 300), ''), '')
         || E'\nConfirm a slot under My Dashboard → Visits.'
    INTO txt FROM unnest(p_slots) x;
  INSERT INTO messages (property_id, sender_id, receiver_id, message, read) VALUES (p_property, me, prop.landlord_id, txt, false);
  RETURN vid;
END $$;
GRANT EXECUTE ON FUNCTION public.request_visit(UUID, TIMESTAMPTZ[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_visit(p_visit UUID, p_action TEXT, p_slot TIMESTAMPTZ DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid(); v RECORD; title TEXT; txt TEXT;
BEGIN
  SELECT * INTO v FROM visit_requests WHERE id = p_visit;
  IF v.id IS NULL OR v.owner_id <> me THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v.status <> 'pending' THEN RAISE EXCEPTION 'This request was already answered'; END IF;
  SELECT p.title INTO title FROM properties p WHERE p.id = v.property_id;
  IF p_action = 'confirm' THEN
    IF p_slot IS NULL OR NOT (p_slot = ANY (v.slots)) THEN RAISE EXCEPTION 'Pick one of the proposed slots'; END IF;
    UPDATE visit_requests SET status = 'confirmed', chosen_slot = p_slot, updated_at = now() WHERE id = p_visit;
    txt := '✅ Visit confirmed for "' || title || '" on ' || _visit_fmt(p_slot) || '. See you then!';
  ELSIF p_action = 'decline' THEN
    UPDATE visit_requests SET status = 'declined', updated_at = now() WHERE id = p_visit;
    txt := '❌ None of those times work for "' || title || '". Please suggest other slots, or reply here.';
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
  INSERT INTO messages (property_id, sender_id, receiver_id, message, read) VALUES (v.property_id, me, v.tenant_id, txt, false);
END $$;
GRANT EXECUTE ON FUNCTION public.respond_visit(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_visit(p_visit UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := auth.uid(); v RECORD; title TEXT;
BEGIN
  SELECT * INTO v FROM visit_requests WHERE id = p_visit;
  IF v.id IS NULL OR me NOT IN (v.tenant_id, v.owner_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v.status NOT IN ('pending', 'confirmed') THEN RETURN; END IF;
  UPDATE visit_requests SET status = 'cancelled', updated_at = now() WHERE id = p_visit;
  SELECT p.title INTO title FROM properties p WHERE p.id = v.property_id;
  INSERT INTO messages (property_id, sender_id, receiver_id, message, read)
  VALUES (v.property_id, me, CASE WHEN me = v.tenant_id THEN v.owner_id ELSE v.tenant_id END,
          '🚫 Visit ' || CASE WHEN v.chosen_slot IS NOT NULL THEN 'on ' || _visit_fmt(v.chosen_slot) || ' ' ELSE '' END
          || 'for "' || title || '" was cancelled.', false);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_visit(UUID) TO authenticated;
