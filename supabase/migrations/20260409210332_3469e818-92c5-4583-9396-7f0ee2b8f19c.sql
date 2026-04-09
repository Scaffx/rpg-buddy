
-- ============================================
-- 1. Tighten policies from public → authenticated
-- ============================================

-- checklist_items
ALTER POLICY "Users can manage own checklist items" ON public.checklist_items TO authenticated;

-- profiles
ALTER POLICY "Users can insert own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can update own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can view own profile" ON public.profiles TO authenticated;

-- user_balance
ALTER POLICY "Users can insert own balance" ON public.user_balance TO authenticated;
ALTER POLICY "Users can update own balance" ON public.user_balance TO authenticated;
ALTER POLICY "Users can view own balance" ON public.user_balance TO authenticated;

-- attributes
ALTER POLICY "Users can update own attributes" ON public.attributes TO authenticated;
ALTER POLICY "Users can view own attributes" ON public.attributes TO authenticated;

-- missions
ALTER POLICY "Users can create own missions" ON public.missions TO authenticated;
ALTER POLICY "Users can delete own missions" ON public.missions TO authenticated;
ALTER POLICY "Users can update own missions" ON public.missions TO authenticated;
ALTER POLICY "Users can view own missions" ON public.missions TO authenticated;

-- boss_battles
ALTER POLICY "Users can create own battles" ON public.boss_battles TO authenticated;
ALTER POLICY "Users can view own battles" ON public.boss_battles TO authenticated;

-- activity_log
ALTER POLICY "Users can insert own activity" ON public.activity_log TO authenticated;
ALTER POLICY "Users can view own activity" ON public.activity_log TO authenticated;

-- user_buffs
ALTER POLICY "Users can insert own buffs" ON public.user_buffs TO authenticated;
ALTER POLICY "Users can view own buffs" ON public.user_buffs TO authenticated;

-- ============================================
-- 2. Add missing UPDATE/DELETE policies on user_buffs
-- ============================================

CREATE POLICY "Users can update own buffs"
  ON public.user_buffs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own buffs"
  ON public.user_buffs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 3. Add missing UPDATE policy on body-photos storage
-- ============================================

CREATE POLICY "Users can update own body photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
