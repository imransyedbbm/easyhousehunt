-- Weekly owner reminders with one-tap "Still available" / "Let out" email buttons. Safe to run more than once.
-- Step 2 (scheduling) is at the bottom and needs two values filled in.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secret per-listing tokens for the email buttons. Own table with RLS and no policies,
-- so they are never readable through the public API (properties is publicly readable).
CREATE TABLE IF NOT EXISTS public.listing_tokens (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex')
);
ALTER TABLE public.listing_tokens ENABLE ROW LEVEL SECURITY;

-- Drop the column from an earlier draft of this file, if it was ever run.
ALTER TABLE public.properties DROP COLUMN IF EXISTS confirm_token;

-- Called by the email buttons (via /api/confirm). The token is the proof of ownership.
CREATE OR REPLACE FUNCTION public.confirm_by_token(p_token TEXT, p_action TEXT)
RETURNS TABLE (title TEXT, share_code TEXT, action TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 OR p_action NOT IN ('available', 'let_out') THEN RETURN; END IF;
  RETURN QUERY
  UPDATE properties p
     SET confirmed_at = now(),
         availability = CASE WHEN p_action = 'let_out' THEN 'let_out' ELSE 'available' END
    FROM listing_tokens t
   WHERE t.token = p_token AND p.id = t.property_id
  RETURNING p.title, p.share_code, p_action;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_by_token(TEXT, TEXT) TO anon, authenticated;

-- ── Step 2: schedule it (run once, after deploying the owner-reminders function) ──
-- Database → Extensions: enable pg_cron and pg_net. Then replace the two <…> values and run:
--
-- select cron.schedule('owner-reminders-weekly', '30 4 * * 1',   -- Mondays 10:00 IST
--   $$ select net.http_post(
--        url := 'https://<PROJECT-REF>.supabase.co/functions/v1/owner-reminders',
--        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--        body := '{}'::jsonb) $$);
