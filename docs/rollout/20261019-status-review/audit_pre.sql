-- Run with psql -X -v ON_ERROR_STOP=1 -f audit_pre.sql -f <BUG32 migration>
-- -f audit_post.sql against a disposable PG17 database with the three
-- 20261019 integration fixtures and the thirteen reform migrations applied.
-- audit_post.sql rolls this transaction back, including the migration.
BEGIN;
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.missions ALTER COLUMN status DROP NOT NULL;
ALTER TABLE public.missions ALTER COLUMN status DROP DEFAULT;
-- The reduced integration fixture grants DML but omits the historical mission
-- policies. Reproduce only the published own-row policies for this auth probe.
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bug32_audit_mission_select ON public.missions
  FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY bug32_audit_mission_insert ON public.missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY bug32_audit_mission_update ON public.missions
  FOR UPDATE TO authenticated USING (auth.uid()=user_id);

INSERT INTO auth.users(id,email) VALUES
  ('b3210000-0000-0000-0000-000000000001','bug32-review-a@example.invalid'),
  ('b3210000-0000-0000-0000-000000000002','bug32-review-b@example.invalid');

INSERT INTO public.missions(user_id,title,attribute_id,priority,status,
                            completed,is_failed,days_of_week)
SELECT u.id, x.title, a.id, 'baixa', x.status, x.completed, x.is_failed,
       '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb
FROM (VALUES
  ('b3210000-0000-0000-0000-000000000001'::uuid,'audit-active',NULL::text,false,false),
  ('b3210000-0000-0000-0000-000000000001'::uuid,'audit-failed',NULL::text,false,true),
  ('b3210000-0000-0000-0000-000000000001'::uuid,'audit-completed',NULL::text,true,false),
  ('b3210000-0000-0000-0000-000000000001'::uuid,'audit-archived','arquivada'::text,true,false),
  ('b3210000-0000-0000-0000-000000000002'::uuid,'audit-other',NULL::text,false,false)
) AS x(user_id,title,status,completed,is_failed)
JOIN auth.users u ON u.id=x.user_id
JOIN public.attributes a ON a.user_id=u.id AND a.name='Disciplina';

CREATE TEMP TABLE bug32_review_economy AS
SELECT jsonb_build_object(
  'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id=u.id),
  'balance',(SELECT to_jsonb(b) FROM public.user_balance b WHERE b.user_id=u.id),
  'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                FROM public.attributes a WHERE a.user_id=u.id),
  'ledger',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
            FROM public.mission_daily_completions c WHERE c.user_id=u.id),
  'xp_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                FROM public.xp_history h WHERE h.user_id=u.id),
  'gold_history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id)
                  FROM public.gold_history h WHERE h.user_id=u.id),
  'mission_business',(SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'xp_reward',m.xp_reward,'completed',m.completed,
    'is_failed',m.is_failed,'daily_status',m.daily_status,
    'priority',m.priority,'days_of_week',m.days_of_week,
    'frequency_type',m.frequency_type) ORDER BY m.id)
    FROM public.missions m WHERE m.user_id=u.id)
) AS state
FROM auth.users u WHERE u.id='b3210000-0000-0000-0000-000000000001';

CREATE TEMP TABLE bug32_review_metadata AS
SELECT jsonb_build_object(
  'mission_owner', c.relowner,
  'mission_acl', c.relacl,
  'mission_policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname)
                       FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),
  'mission_triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tgname)
                       FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid
                         AND t.tgname<>'before_mission_status_normalize'),
  'complete', pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.complete_mission(uuid,date)'::regprocedure)),
  'undo', pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.undo_mission(uuid,date)'::regprocedure)),
  'priority', pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'private.enforce_mission_priority()'::regprocedure))
) AS state FROM pg_catalog.pg_class c WHERE c.oid='public.missions'::regclass;
