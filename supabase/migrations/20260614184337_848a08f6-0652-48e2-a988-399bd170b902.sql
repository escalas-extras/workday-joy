
-- 1. Empresas: razão social + CNPJ
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cnpj text;
CREATE UNIQUE INDEX IF NOT EXISTS empresas_cnpj_uidx ON public.empresas(cnpj) WHERE cnpj IS NOT NULL;

UPDATE public.empresas SET razao_social='J.A JULIANI LTDA', cnpj='18.044.421/0001-80' WHERE nome='J.A' AND cnpj IS NULL;
UPDATE public.empresas SET razao_social='R. A. DE OLIVEIRA LOPES - G3 FORCE SERVIÇOS', cnpj='20.609.218/0001-55' WHERE nome='G3' AND cnpj IS NULL;
UPDATE public.empresas SET razao_social='JULIANI SEGURANÇA PATRIMONIAL LTDA', cnpj='35.822.792/0001-64' WHERE nome='JSP' AND cnpj IS NULL;

-- 2. warning_reasons
CREATE TABLE public.warning_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  clt_article text NOT NULL DEFAULT 'Art. 482',
  clt_subsections text[] NOT NULL DEFAULT '{}',
  descricao_padrao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.warning_reasons TO authenticated;
GRANT ALL ON public.warning_reasons TO service_role;
ALTER TABLE public.warning_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warning_reasons select authenticated" ON public.warning_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "warning_reasons admin write" ON public.warning_reasons
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'));

CREATE TRIGGER tg_warning_reasons_updated BEFORE UPDATE ON public.warning_reasons
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.warning_reasons(nome, clt_article, clt_subsections, descricao_padrao) VALUES
('Atrasos recorrentes','Art. 482',ARRAY['e','h'],'Chegada atrasada ao posto de trabalho de forma recorrente, mesmo após orientações da supervisão.'),
('Falta injustificada','Art. 482',ARRAY['e'],'Ausência ao trabalho sem justificativa válida.'),
('Abandono temporário de posto','Art. 482',ARRAY['h'],'Ausência do posto de serviço sem autorização da supervisão.'),
('Descumprimento de normas internas','Art. 482',ARRAY['h'],'Descumprimento de procedimentos internos da empresa.'),
('Insubordinação','Art. 482',ARRAY['h'],'Recusa injustificada ao cumprimento de ordem legítima de superior hierárquico.'),
('Mau procedimento','Art. 482',ARRAY['b'],'Comportamento incompatível com os padrões exigidos pela empresa.'),
('Desídia','Art. 482',ARRAY['e'],'Negligência reiterada no desempenho das funções.'),
('Uso indevido de equipamentos','Art. 482',ARRAY['h'],'Utilização inadequada de equipamentos ou recursos da empresa.'),
('Violação de normas de segurança','Art. 482',ARRAY['h'],'Descumprimento de normas de segurança operacional.'),
('Conduta inadequada com clientes','Art. 482',ARRAY['b'],'Tratamento inadequado ou incompatível com os padrões da empresa.');

-- 3. disciplinary_warnings
CREATE TABLE public.disciplinary_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id),
  warning_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  city text NOT NULL DEFAULT 'Londrina',
  employee_name text NOT NULL,
  employee_cpf text,
  employee_role text,
  empresa_razao_social text,
  empresa_cnpj text,
  warning_reason_id uuid REFERENCES public.warning_reasons(id),
  conduct_description text NOT NULL,
  observacoes text,
  clt_article text NOT NULL DEFAULT 'Art. 482',
  clt_subsections text[] NOT NULL DEFAULT '{}',
  generated_document_url text,
  employee_signature_url text,
  witness_signature_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX disciplinary_warnings_empresa_idx ON public.disciplinary_warnings(empresa_id);
CREATE INDEX disciplinary_warnings_colab_idx ON public.disciplinary_warnings(colaborador_id);
CREATE INDEX disciplinary_warnings_date_idx ON public.disciplinary_warnings(warning_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_warnings TO authenticated;
GRANT ALL ON public.disciplinary_warnings TO service_role;
ALTER TABLE public.disciplinary_warnings ENABLE ROW LEVEL SECURITY;

-- Admin / RH (gestor_operacional): tudo
CREATE POLICY "warnings admin all" ON public.disciplinary_warnings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'));

-- Supervisor: ver e criar advertências (escopo de empresa pode ser refinado depois; por ora todas)
CREATE POLICY "warnings supervisor select" ON public.disciplinary_warnings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'supervisor'));

CREATE POLICY "warnings supervisor insert" ON public.disciplinary_warnings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'supervisor') AND created_by = auth.uid());

CREATE TRIGGER tg_warnings_updated BEFORE UPDATE ON public.disciplinary_warnings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TRIGGER tg_warnings_audit AFTER INSERT OR UPDATE ON public.disciplinary_warnings
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
