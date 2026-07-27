CREATE INDEX IF NOT EXISTS user_onboarding_claims_mission_code_idx
  ON public.user_onboarding_mission_claims (mission_code);
