-- Make sure columns the app and the admin guard rely on exist. Safe to run more than once.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
NOTIFY pgrst, 'reload schema';
