-- Daily cap for the AI description writer. Safe to run more than once.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL,
  day     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  uses    INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;  -- no policies: only the edge function (service role) touches it

-- Atomically count one use; returns false once the user hits the daily cap.
CREATE OR REPLACE FUNCTION public.take_ai_use(p_user UUID, p_cap INT DEFAULT 10)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  INSERT INTO ai_usage (user_id, uses) VALUES (p_user, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET uses = ai_usage.uses + 1
  RETURNING uses INTO n;
  RETURN n <= p_cap;
END $$;
REVOKE EXECUTE ON FUNCTION public.take_ai_use(UUID, INT) FROM PUBLIC, anon, authenticated;
