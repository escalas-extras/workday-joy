
-- Fase 1: Medidas Disciplinares — adiciona tipo de medida e campos de suspensão
ALTER TABLE public.disciplinary_warnings
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'advertencia_escrita',
  ADD COLUMN IF NOT EXISTS suspension_days integer,
  ADD COLUMN IF NOT EXISTS suspension_start_date date,
  ADD COLUMN IF NOT EXISTS suspension_end_date date;

ALTER TABLE public.disciplinary_warnings
  DROP CONSTRAINT IF EXISTS disciplinary_warnings_action_type_chk;
ALTER TABLE public.disciplinary_warnings
  ADD CONSTRAINT disciplinary_warnings_action_type_chk
  CHECK (action_type IN ('orientacao_verbal','advertencia_escrita','suspensao'));

-- Validação: suspensão exige dias > 0
CREATE OR REPLACE FUNCTION public.tg_disciplinary_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.action_type = 'suspensao' THEN
    IF NEW.suspension_days IS NULL OR NEW.suspension_days <= 0 THEN
      RAISE EXCEPTION 'Suspensão exige número de dias maior que zero';
    END IF;
    IF NEW.suspension_start_date IS NOT NULL AND NEW.suspension_end_date IS NULL THEN
      NEW.suspension_end_date := NEW.suspension_start_date + (NEW.suspension_days - 1);
    END IF;
  ELSE
    NEW.suspension_days := NULL;
    NEW.suspension_start_date := NULL;
    NEW.suspension_end_date := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_disciplinary_validate ON public.disciplinary_warnings;
CREATE TRIGGER tg_disciplinary_validate
  BEFORE INSERT OR UPDATE ON public.disciplinary_warnings
  FOR EACH ROW EXECUTE FUNCTION public.tg_disciplinary_validate();
