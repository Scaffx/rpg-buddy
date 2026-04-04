
CREATE TABLE public.body_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC,
  body_fat_percent NUMERIC,
  chest_cm NUMERIC,
  waist_cm NUMERIC,
  hip_cm NUMERIC,
  arm_cm NUMERIC,
  thigh_cm NUMERIC,
  calf_cm NUMERIC,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own body measurements"
  ON public.body_measurements FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('body-photos', 'body-photos', true);

CREATE POLICY "Users can upload own body photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own body photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view body photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'body-photos');

CREATE POLICY "Users can delete own body photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
