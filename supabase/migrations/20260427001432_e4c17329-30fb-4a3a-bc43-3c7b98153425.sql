-- Tabela de log estruturado de transações de XP
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mission_id UUID NULL,
  reason TEXT NOT NULL,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  gold_delta INTEGER NOT NULL DEFAULT 0,
  local_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own xp transactions"
ON public.xp_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own xp transactions"
ON public.xp_transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_xp_tx_user_date ON public.xp_transactions(user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_xp_tx_user_mission ON public.xp_transactions(user_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_xp_tx_user_reason ON public.xp_transactions(user_id, reason);