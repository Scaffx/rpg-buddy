
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own plans" ON public.plans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.plan_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own plan_missions" ON public.plan_missions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_missions.plan_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_missions.plan_id AND p.user_id = auth.uid()));
