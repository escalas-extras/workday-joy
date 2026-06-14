
-- ============ Fase 2: Processo Disciplinar e Justa Causa ============

-- 1. Adiciona justa_causa ao CHECK da medida disciplinar
ALTER TABLE public.disciplinary_warnings
  DROP CONSTRAINT IF EXISTS disciplinary_warnings_action_type_chk;
ALTER TABLE public.disciplinary_warnings
  ADD CONSTRAINT disciplinary_warnings_action_type_chk
  CHECK (action_type IN ('orientacao_verbal','advertencia_escrita','suspensao','justa_causa'));

-- 2. disciplinary_cases
CREATE TABLE IF NOT EXISTS public.disciplinary_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id),
  employee_id uuid NOT NULL REFERENCES public.colaboradores(id),
  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','em_apuracao','aguardando_rh','aguardando_diretoria','aprovado','arquivado','convertido_justa_causa')),
  occurrence_date date,
  description text NOT NULL,
  legal_basis text[] NOT NULL DEFAULT '{}',
  final_decision text,
  observations text,
  warning_id uuid REFERENCES public.disciplinary_warnings(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disciplinary_cases_empresa_idx ON public.disciplinary_cases(company_id);
CREATE INDEX IF NOT EXISTS disciplinary_cases_emp_idx ON public.disciplinary_cases(employee_id);
CREATE INDEX IF NOT EXISTS disciplinary_cases_status_idx ON public.disciplinary_cases(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_cases TO authenticated;
GRANT ALL ON public.disciplinary_cases TO service_role;
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases admin all" ON public.disciplinary_cases
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "cases staff select" ON public.disciplinary_cases
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'gestor_financeiro')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "cases staff insert" ON public.disciplinary_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "cases staff update" ON public.disciplinary_cases
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE TRIGGER tg_disc_cases_upd BEFORE UPDATE ON public.disciplinary_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER tg_disc_cases_audit AFTER INSERT OR UPDATE ON public.disciplinary_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- 3. evidências
CREATE TABLE IF NOT EXISTS public.disciplinary_case_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint,
  descricao text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disc_evid_case_idx ON public.disciplinary_case_evidences(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_case_evidences TO authenticated;
GRANT ALL ON public.disciplinary_case_evidences TO service_role;
ALTER TABLE public.disciplinary_case_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evid admin all" ON public.disciplinary_case_evidences
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "evid staff select" ON public.disciplinary_case_evidences
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'gestor_financeiro')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "evid staff write" ON public.disciplinary_case_evidences
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "evid staff delete" ON public.disciplinary_case_evidences
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE TRIGGER tg_disc_evid_audit AFTER INSERT OR UPDATE ON public.disciplinary_case_evidences
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- 4. testemunhas
CREATE TABLE IF NOT EXISTS public.disciplinary_case_witnesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cpf text,
  cargo text,
  telefone text,
  relato text,
  observacoes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disc_wit_case_idx ON public.disciplinary_case_witnesses(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_case_witnesses TO authenticated;
GRANT ALL ON public.disciplinary_case_witnesses TO service_role;
ALTER TABLE public.disciplinary_case_witnesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wit admin all" ON public.disciplinary_case_witnesses
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "wit staff select" ON public.disciplinary_case_witnesses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'gestor_financeiro')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "wit staff write" ON public.disciplinary_case_witnesses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "wit staff update" ON public.disciplinary_case_witnesses
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "wit staff delete" ON public.disciplinary_case_witnesses
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE TRIGGER tg_disc_wit_audit AFTER INSERT OR UPDATE ON public.disciplinary_case_witnesses
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- 5. aprovações
CREATE TABLE IF NOT EXISTS public.disciplinary_case_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.disciplinary_cases(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('supervisor','rh','diretoria')),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('aprovado','rejeitado')),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, step)
);
CREATE INDEX IF NOT EXISTS disc_appr_case_idx ON public.disciplinary_case_approvals(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_case_approvals TO authenticated;
GRANT ALL ON public.disciplinary_case_approvals TO service_role;
ALTER TABLE public.disciplinary_case_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appr admin all" ON public.disciplinary_case_approvals
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "appr select" ON public.disciplinary_case_approvals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_operacional')
    OR public.has_role(auth.uid(),'gestor_financeiro')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "appr supervisor insert" ON public.disciplinary_case_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    step = 'supervisor' AND (
      public.has_role(auth.uid(),'supervisor')
      OR public.has_role(auth.uid(),'gestor_operacional')
    )
  );

CREATE POLICY "appr rh insert" ON public.disciplinary_case_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    step = 'rh' AND public.has_role(auth.uid(),'gestor_operacional')
  );

-- diretoria: somente admin (já coberto pelo policy admin all)

CREATE TRIGGER tg_disc_appr_audit AFTER INSERT OR UPDATE ON public.disciplinary_case_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
