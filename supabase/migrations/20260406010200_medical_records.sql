-- Create medical_records table for storing user medical exam files
CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, file_name, uploaded_at)
);

-- Create policy to allow users to view their own medical records
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own medical records"
  ON medical_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own medical records"
  ON medical_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medical records"
  ON medical_records FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_medical_records_user_id ON medical_records(user_id);
CREATE INDEX idx_medical_records_uploaded_at ON medical_records(uploaded_at DESC);
