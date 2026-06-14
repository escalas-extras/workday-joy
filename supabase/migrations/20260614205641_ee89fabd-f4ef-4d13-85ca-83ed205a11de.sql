
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  ip_address text,
  user_agent text,
  action text NOT NULL CHECK (action IN ('create','update','delete','deactivate','view','print','download','reprint','approve','reject','generate_pdf','upload','login')),
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  company_id uuid REFERENCES public.empresas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_trail_entity_idx ON public.audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_trail_user_idx ON public.audit_trail(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_trail_created_idx ON public.audit_trail(created_at DESC);
GRANT SELECT, INSERT ON public.audit_trail TO authenticated;
GRANT ALL ON public.audit_trail TO service_role;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read" ON public.audit_trail FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'));
CREATE POLICY "audit insert" ON public.audit_trail FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.tg_audit_trail_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_trail é imutável'; END $$;
DROP TRIGGER IF EXISTS audit_trail_no_update ON public.audit_trail;
CREATE TRIGGER audit_trail_no_update BEFORE UPDATE ON public.audit_trail
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_trail_immutable();
DROP TRIGGER IF EXISTS audit_trail_no_delete ON public.audit_trail;
CREATE TRIGGER audit_trail_no_delete BEFORE DELETE ON public.audit_trail
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_trail_immutable();

CREATE TABLE IF NOT EXISTS public.disciplinary_print_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('warning','case','justa_causa','dossie','suspensao','orientacao')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view','download','print','reprint')),
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_log_entity_idx ON public.disciplinary_print_log(entity_type, entity_id);
GRANT SELECT, INSERT ON public.disciplinary_print_log TO authenticated;
GRANT ALL ON public.disciplinary_print_log TO service_role;
ALTER TABLE public.disciplinary_print_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "print_log read" ON public.disciplinary_print_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'));
CREATE POLICY "print_log insert" ON public.disciplinary_print_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.equipment_return_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsible_user_id uuid REFERENCES auth.users(id),
  return_date date,
  observations text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id)
);
GRANT SELECT, INSERT, UPDATE ON public.equipment_return_checklist TO authenticated;
GRANT ALL ON public.equipment_return_checklist TO service_role;
ALTER TABLE public.equipment_return_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equip all" ON public.equipment_return_checklist FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional') OR public.has_role(auth.uid(),'supervisor'));
DROP TRIGGER IF EXISTS equip_checklist_updated ON public.equipment_return_checklist;
CREATE TRIGGER equip_checklist_updated BEFORE UPDATE ON public.equipment_return_checklist
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.digital_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('empregado','testemunha','rh','diretoria','representante')),
  signer_name text NOT NULL,
  signer_cpf text,
  signer_email text,
  signature_hash text,
  signed_at timestamptz,
  provider text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digital_sig_entity_idx ON public.digital_signatures(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE ON public.digital_signatures TO authenticated;
GRANT ALL ON public.digital_signatures TO service_role;
ALTER TABLE public.digital_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "digsig all" ON public.digital_signatures FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'));
DROP TRIGGER IF EXISTS digital_sig_updated ON public.digital_signatures;
CREATE TRIGGER digital_sig_updated BEFORE UPDATE ON public.digital_signatures
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.disciplinary_cases
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
ALTER TABLE public.disciplinary_case_evidences
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
ALTER TABLE public.disciplinary_case_witnesses
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
ALTER TABLE public.disciplinary_case_approvals
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;
ALTER TABLE public.disciplinary_warnings
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

CREATE OR REPLACE FUNCTION public.tg_block_disciplinary_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Exclusão proibida em registros disciplinares. Use inativação para preservar rastreabilidade.'; END $$;

DROP TRIGGER IF EXISTS no_delete_cases ON public.disciplinary_cases;
CREATE TRIGGER no_delete_cases BEFORE DELETE ON public.disciplinary_cases FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();
DROP TRIGGER IF EXISTS no_delete_evidences ON public.disciplinary_case_evidences;
CREATE TRIGGER no_delete_evidences BEFORE DELETE ON public.disciplinary_case_evidences FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();
DROP TRIGGER IF EXISTS no_delete_witnesses ON public.disciplinary_case_witnesses;
CREATE TRIGGER no_delete_witnesses BEFORE DELETE ON public.disciplinary_case_witnesses FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();
DROP TRIGGER IF EXISTS no_delete_approvals ON public.disciplinary_case_approvals;
CREATE TRIGGER no_delete_approvals BEFORE DELETE ON public.disciplinary_case_approvals FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();
DROP TRIGGER IF EXISTS no_delete_warnings ON public.disciplinary_warnings;
CREATE TRIGGER no_delete_warnings BEFORE DELETE ON public.disciplinary_warnings FOR EACH ROW EXECUTE FUNCTION public.tg_block_disciplinary_delete();

CREATE OR REPLACE VIEW public.v_disciplinary_stats_by_employee AS
SELECT
  c.id AS colaborador_id,
  c.nome,
  c.cpf,
  c.empresa_id,
  COUNT(w.id) FILTER (WHERE w.action_type='orientacao_verbal' AND w.active) AS qtd_orientacoes,
  COUNT(w.id) FILTER (WHERE w.action_type='advertencia_escrita' AND w.active) AS qtd_advertencias,
  COUNT(w.id) FILTER (WHERE w.action_type='suspensao' AND w.active) AS qtd_suspensoes,
  COUNT(w.id) FILTER (WHERE w.action_type='justa_causa' AND w.active) AS qtd_justas_causas,
  MAX(w.warning_date) AS ultima_ocorrencia,
  MAX(w.warning_date) FILTER (WHERE w.action_type='suspensao') AS ultima_suspensao,
  MAX(w.warning_date) FILTER (WHERE w.action_type='advertencia_escrita') AS ultima_advertencia
FROM public.colaboradores c
LEFT JOIN public.disciplinary_warnings w ON w.colaborador_id = c.id
GROUP BY c.id, c.nome, c.cpf, c.empresa_id;
GRANT SELECT ON public.v_disciplinary_stats_by_employee TO authenticated;

CREATE OR REPLACE VIEW public.v_disciplinary_dashboard AS
SELECT
  w.id, w.empresa_id, e.nome AS empresa_nome,
  w.colaborador_id, c.nome AS colaborador_nome, c.cpf,
  w.action_type, w.warning_date, w.warning_reason_id,
  wr.nome AS reason_nome, w.created_by, w.active,
  date_trunc('month', w.warning_date)::date AS mes_ref
FROM public.disciplinary_warnings w
LEFT JOIN public.empresas e ON e.id = w.empresa_id
LEFT JOIN public.colaboradores c ON c.id = w.colaborador_id
LEFT JOIN public.warning_reasons wr ON wr.id = w.warning_reason_id;
GRANT SELECT ON public.v_disciplinary_dashboard TO authenticated;

CREATE OR REPLACE FUNCTION public.get_recidivism_counts(_employee_id uuid, _reason_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'd30', COUNT(*) FILTER (WHERE warning_date >= current_date - 30),
    'd90', COUNT(*) FILTER (WHERE warning_date >= current_date - 90),
    'd180', COUNT(*) FILTER (WHERE warning_date >= current_date - 180),
    'd365', COUNT(*) FILTER (WHERE warning_date >= current_date - 365),
    'd30_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 30 AND warning_reason_id = _reason_id),
    'd90_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 90 AND warning_reason_id = _reason_id),
    'd180_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 180 AND warning_reason_id = _reason_id),
    'd365_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 365 AND warning_reason_id = _reason_id)
  )
  FROM public.disciplinary_warnings
  WHERE colaborador_id = _employee_id AND active = true;
$$;
