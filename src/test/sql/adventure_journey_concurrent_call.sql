SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT public.save_adventure_journey_choice(1,1,'restore') AS result;
