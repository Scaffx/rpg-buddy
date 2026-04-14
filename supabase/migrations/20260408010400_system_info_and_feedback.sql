CREATE TABLE public.system_update_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  details TEXT,
  is_highlighted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_update_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system update logs"
ON public.system_update_logs
FOR SELECT
USING (true);

CREATE TABLE public.system_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
ON public.system_feedback
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
ON public.system_feedback
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
ON public.system_feedback
FOR UPDATE
USING (auth.uid() = user_id);

CREATE TRIGGER update_system_feedback_updated_at
BEFORE UPDATE ON public.system_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_update_logs (version_tag, title, summary, details, is_highlighted) VALUES
  (
    'v0.8.0',
    'Onboarding reformulado',
    'Tutorial inicial, escolha de classe moderna e missões predefinidas.',
    'Novos usuários agora passam por um onboarding com contexto do sistema, classe inicial e criação de missões coerentes com sua rotina.',
    true
  ),
  (
    'v0.8.1',
    'Sistema de habilidades por classe',
    'Cada classe ganhou kit Novato, item inicial e habilidades exclusivas.',
    'As habilidades agora escalam com atributos de missão. Magia foi propositalmente enfraquecida para abrir espaço a builds híbridas e criativas.',
    true
  ),
  (
    'v0.8.2',
    'Respec e leitura tática de bosses',
    'Troca de classe com custo em ouro e exibição de status de bosses.',
    'Foi adicionada troca de classe na aba de habilidades e um painel tático com ameaça, fraqueza e atributos relevantes dos bosses.',
    false
  );