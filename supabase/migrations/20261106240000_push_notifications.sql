-- Phone/desktop push notifications for new chat messages (which also covers visit requests,
-- confirmations and cancellations, since those post into the chat). Safe to run more than once.
-- Needs pg_net (already enabled for the weekly reminders) and the send-push edge function.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid(),
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

DROP POLICY IF EXISTS "Push: own rows" ON public.push_subscriptions;
CREATE POLICY "Push: own rows" ON public.push_subscriptions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- On every new message, ask the send-push function to notify the receiver.
-- Before running: replace <CRON_SECRET> with your CRON_SECRET edge-function secret (and check the project URL).
CREATE OR REPLACE FUNCTION public.push_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.receiver_id IS NULL OR NEW.receiver_id = NEW.sender_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.receiver_id) THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://skvlnxlbdyjxroxwqmeq.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := jsonb_build_object('message_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- never block a message because a notification failed
END $$;
DROP TRIGGER IF EXISTS push_on_message ON public.messages;
CREATE TRIGGER push_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.push_on_message();
