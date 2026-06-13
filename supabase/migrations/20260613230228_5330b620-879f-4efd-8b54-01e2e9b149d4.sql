-- Add new situacao_servico enum values
ALTER TYPE public.situacao_servico ADD VALUE IF NOT EXISTS 'extra_normal';
ALTER TYPE public.situacao_servico ADD VALUE IF NOT EXISTS 'cobertura_folga';
ALTER TYPE public.situacao_servico ADD VALUE IF NOT EXISTS 'treinamento';

-- Add colaborador_coberto_id column to extras
ALTER TABLE public.extras
  ADD COLUMN IF NOT EXISTS colaborador_coberto_id uuid REFERENCES public.colaboradores(id);

CREATE INDEX IF NOT EXISTS idx_extras_colaborador_coberto ON public.extras(colaborador_coberto_id);

-- Validation trigger: colaborador_coberto_id obrigatório para coberturas, null para demais
CREATE OR REPLACE FUNCTION public.tg_extras_coberto_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF new.situacao_servico IN ('cobertura_ferias','cobertura_atestado') THEN
    IF new.colaborador_coberto_id IS NULL THEN
      RAISE EXCEPTION 'colaborador_coberto_id é obrigatório para Cobertura de Férias/Atestado';
    END IF;
    IF new.colaborador_coberto_id = new.colaborador_id THEN
      RAISE EXCEPTION 'Colaborador coberto não pode ser o mesmo que executa o extra';
    END IF;
  ELSE
    new.colaborador_coberto_id := NULL;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS tg_extras_coberto_validate ON public.extras;
CREATE TRIGGER tg_extras_coberto_validate
BEFORE INSERT OR UPDATE ON public.extras
FOR EACH ROW EXECUTE FUNCTION public.tg_extras_coberto_validate();