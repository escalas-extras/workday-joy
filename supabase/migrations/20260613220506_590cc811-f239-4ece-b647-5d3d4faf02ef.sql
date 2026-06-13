
ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_por uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_recibos_arquivado_em ON public.recibos(arquivado_em);
