
-- 1. CPF no colaborador
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS cpf TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_cpf_unique ON public.colaboradores(cpf) WHERE cpf IS NOT NULL;

-- 2. CNPJ do cliente passa a ser nullable, mantendo unique parcial
ALTER TABLE public.clientes ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cnpj_key;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cnpj_unique ON public.clientes(cnpj) WHERE cnpj IS NOT NULL;

-- 3. Vínculo colaborador <-> cliente
CREATE TABLE IF NOT EXISTS public.colaborador_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  situacao entity_status NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, cliente_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaborador_clientes TO authenticated;
GRANT ALL ON public.colaborador_clientes TO service_role;
ALTER TABLE public.colaborador_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "colaborador_clientes_select" ON public.colaborador_clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "colaborador_clientes_admin_ins" ON public.colaborador_clientes FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "colaborador_clientes_admin_upd" ON public.colaborador_clientes FOR UPDATE TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "colaborador_clientes_admin_del" ON public.colaborador_clientes FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE TRIGGER trg_touch_colaborador_clientes BEFORE UPDATE ON public.colaborador_clientes FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_colab_clientes_colab ON public.colaborador_clientes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colab_clientes_cliente ON public.colaborador_clientes(cliente_id);

-- 4. Histórico de importações de lotação
CREATE TABLE IF NOT EXISTS public.importacoes_lotacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  arquivo_nome TEXT,
  total_linhas INT NOT NULL DEFAULT 0,
  criadas INT NOT NULL DEFAULT 0,
  atualizadas INT NOT NULL DEFAULT 0,
  ignoradas INT NOT NULL DEFAULT 0,
  erros INT NOT NULL DEFAULT 0,
  resumo JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.importacoes_lotacao TO authenticated;
GRANT ALL ON public.importacoes_lotacao TO service_role;
ALTER TABLE public.importacoes_lotacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_lotacao_admin_select" ON public.importacoes_lotacao FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "imp_lotacao_admin_ins" ON public.importacoes_lotacao FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
