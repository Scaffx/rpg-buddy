-- Keep reminders available through the Data API without inheriting broader
-- table privileges such as TRUNCATE, TRIGGER, or REFERENCES.

REVOKE ALL ON TABLE public.reminders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO authenticated;

NOTIFY pgrst, 'reload schema';
