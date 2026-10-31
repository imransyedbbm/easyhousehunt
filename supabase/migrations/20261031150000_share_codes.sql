-- Short public codes for shareable listing links (easyhousehunt.com/l/2bhk-karle-vario-homes-k7x2qm),
-- so links never expose the internal database ID. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.gen_share_code()
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  -- 6 characters without look-alikes (no 0/o, 1/l/i): ~887 million combinations
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
  FROM generate_series(1, 6);
$$;

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS share_code TEXT;
UPDATE public.properties SET share_code = public.gen_share_code() WHERE share_code IS NULL;
ALTER TABLE public.properties ALTER COLUMN share_code SET DEFAULT public.gen_share_code();
ALTER TABLE public.properties ALTER COLUMN share_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS properties_share_code_key ON public.properties (share_code);
