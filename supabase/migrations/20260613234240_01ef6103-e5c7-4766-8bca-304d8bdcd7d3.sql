ALTER TABLE public.extras
  ALTER COLUMN emitente_id DROP NOT NULL;

ALTER TABLE public.recibos
  ALTER COLUMN gerado_por DROP NOT NULL;