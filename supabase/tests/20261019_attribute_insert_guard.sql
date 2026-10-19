-- Local grant/RLS model for the A5 attribute INSERT finding. The migration
-- itself does not GRANT INSERT; this transaction rolls every model change back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL request.jwt.claim.sub = 'b6000000-0000-0000-0000-000000000002';

-- Server-side Auth seed still creates ordinary zero-XP profile/attributes.
INSERT INTO auth.users(id,email) VALUES
  ('b6000000-0000-0000-0000-000000000002','guard-p2@example.invalid');
DO $seed$
BEGIN
  IF (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> 0
     OR (SELECT level FROM public.profiles WHERE user_id=auth.uid()) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.attributes
                     WHERE user_id=auth.uid() AND name='Disciplina' AND xp=0 AND level=1)
  THEN RAISE EXCEPTION 'legitimate server-side seed failed'; END IF;
  RAISE NOTICE 'server-side seed at base zero/level one: PASS';
END;
$seed$;

-- Exercise the other trigger shape too, using a second Auth seed whose
-- generated profile is removed only inside this rollback transaction.
INSERT INTO auth.users(id,email) VALUES
  ('b6000000-0000-0000-0000-000000000003','guard-profile-p2@example.invalid');
DELETE FROM public.profiles
 WHERE user_id='b6000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.sub = 'b6000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
DO $profile_client$
DECLARE
  v_denied boolean := false;
  v_message text;
BEGIN
  BEGIN
    INSERT INTO public.profiles(user_id,total_xp,level)
    VALUES (auth.uid(),777,1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'Initial progression values must be server defaults'
    THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'forged profile XP was accepted'; END IF;
  INSERT INTO public.profiles(user_id,total_xp,level)
  VALUES (auth.uid(),0,1);
  RAISE NOTICE 'authenticated profile guard: forged XP rejected; base zero/level one accepted';
END;
$profile_client$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub = 'b6000000-0000-0000-0000-000000000002';

-- Reproduce the independent review's lean client model, separately from
-- whatever final direct-INSERT ACL is integrated later.
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY p2_attribute_insert ON public.attributes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY p2_attribute_select ON public.attributes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
GRANT INSERT ON public.attributes TO authenticated;
SET LOCAL ROLE authenticated;
DO $client$
DECLARE
  v_id uuid := 'b6000000-0000-0000-0000-000000000020';
  v_message text;
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN
    INSERT INTO public.attributes(id,user_id,name,xp,level)
    VALUES (v_id,auth.uid(),'Forged XP',777,1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'Initial attribute progression must be server defaults'
    THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'forged attribute XP was accepted'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.attributes(id,user_id,name,xp,level)
    VALUES (v_id,auth.uid(),'Forged level',0,2);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'Initial attribute progression must be server defaults'
    THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'forged attribute level was accepted'; END IF;

  INSERT INTO public.attributes(id,user_id,name,xp,level)
  VALUES (v_id,auth.uid(),'Valid zero XP',0,1);
  RAISE NOTICE 'authenticated grant model: forged XP/level rejected by guard; base zero/level one accepted';
END;
$client$;
RESET ROLE;

DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.attributes
       WHERE user_id=auth.uid() AND id='b6000000-0000-0000-0000-000000000020'
         AND xp=0 AND level=1) <> 1
     OR EXISTS (SELECT 1 FROM public.attributes
                 WHERE user_id=auth.uid() AND (xp<>0 OR level<>1))
  THEN RAISE EXCEPTION 'client model left forged attribute'; END IF;
END;
$assert$;
ROLLBACK;
