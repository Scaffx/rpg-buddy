-- Create meal_details table with comprehensive meal information
CREATE TABLE IF NOT EXISTS meal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL,
  meal_number INT DEFAULT 1, -- 1=breakfast, 2=lunch, 3=dinner
  food_description TEXT NOT NULL, -- O que foi comido
  calories INT, -- Calorias
  quantity TEXT, -- Quantidade/Porção
  beverages TEXT, -- O que bebeu
  retention_days INT NOT NULL DEFAULT 7, -- 3, 7 ou 30 dias
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create RLS policies
ALTER TABLE meal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own meal details"
  ON meal_details FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal details"
  ON meal_details FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meal details"
  ON meal_details FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meal details"
  ON meal_details FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for efficient queries
CREATE INDEX idx_meal_details_user_id ON meal_details(user_id);
CREATE INDEX idx_meal_details_meal_date ON meal_details(meal_date DESC);
CREATE INDEX idx_meal_details_expires_at ON meal_details(expires_at);
CREATE INDEX idx_meal_details_user_date ON meal_details(user_id, meal_date);

-- Create function to clean up expired meal records
CREATE OR REPLACE FUNCTION cleanup_expired_meals()
RETURNS void AS $$
BEGIN
  DELETE FROM meal_details
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
