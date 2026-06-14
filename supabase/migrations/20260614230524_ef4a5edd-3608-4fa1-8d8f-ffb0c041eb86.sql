
CREATE TABLE public.almox_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  tipo_tamanho text NOT NULL CHECK (tipo_tamanho IN ('vestuario','calca','calcado','bone','sem_tamanho')),
  ordem int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_categorias TO authenticated;
GRANT ALL ON public.almox_categorias TO service_role;
ALTER TABLE public.almox_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_cat read" ON public.almox_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_cat admin" ON public.almox_categorias FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.almox_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid NOT NULL REFERENCES public.almox_categorias(id),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_itens TO authenticated;
GRANT ALL ON public.almox_itens TO service_role;
ALTER TABLE public.almox_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_itens read" ON public.almox_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_itens admin" ON public.almox_itens FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.almox_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.almox_itens(id),
  tamanho text,
  quantidade_atual int NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
  quantidade_minima int NOT NULL DEFAULT 0 CHECK (quantidade_minima >= 0),
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, item_id, tamanho)
);
CREATE INDEX almox_estoque_empresa_idx ON public.almox_estoque(empresa_id);
CREATE INDEX almox_estoque_item_idx ON public.almox_estoque(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_estoque TO authenticated;
GRANT ALL ON public.almox_estoque TO service_role;
ALTER TABLE public.almox_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_estoque read" ON public.almox_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_estoque write" ON public.almox_estoque FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role));

CREATE TABLE public.almox_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  item_id uuid NOT NULL REFERENCES public.almox_itens(id),
  tamanho text,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  motivo text NOT NULL CHECK (motivo IN (
    'compra','devolucao','ajuste_entrada','transferencia_recebida',
    'entrega_colaborador','perda','descarte','transferencia_enviada','ajuste_saida'
  )),
  quantidade int NOT NULL CHECK (quantidade > 0),
  colaborador_id uuid REFERENCES public.colaboradores(id),
  entrega_id uuid,
  observacao text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX almox_mov_empresa_idx ON public.almox_movimentacoes(empresa_id, created_at DESC);
CREATE INDEX almox_mov_colab_idx ON public.almox_movimentacoes(colaborador_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_movimentacoes TO authenticated;
GRANT ALL ON public.almox_movimentacoes TO service_role;
ALTER TABLE public.almox_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_mov read" ON public.almox_movimentacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_mov write" ON public.almox_movimentacoes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role));

CREATE TABLE public.almox_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  item_id uuid NOT NULL REFERENCES public.almox_itens(id),
  tamanho text,
  quantidade int NOT NULL CHECK (quantidade > 0),
  quantidade_devolvida int NOT NULL DEFAULT 0 CHECK (quantidade_devolvida >= 0),
  data_entrega date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  responsavel_id uuid REFERENCES auth.users(id),
  observacao text,
  status text NOT NULL DEFAULT 'em_uso' CHECK (status IN ('em_uso','devolvido_parcial','devolvido_total','perda_justificada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX almox_entregas_colab_idx ON public.almox_entregas(colaborador_id);
CREATE INDEX almox_entregas_status_idx ON public.almox_entregas(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_entregas TO authenticated;
GRANT ALL ON public.almox_entregas TO service_role;
ALTER TABLE public.almox_entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_entregas read" ON public.almox_entregas FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_entregas write" ON public.almox_entregas FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role));

CREATE TABLE public.almox_devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.almox_entregas(id) ON DELETE CASCADE,
  quantidade int NOT NULL CHECK (quantidade > 0),
  condicao text NOT NULL CHECK (condicao IN ('novo','bom','regular','danificado','inservivel','perda_justificada')),
  retorna_estoque boolean NOT NULL DEFAULT true,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  responsavel_id uuid REFERENCES auth.users(id),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX almox_dev_entrega_idx ON public.almox_devolucoes(entrega_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almox_devolucoes TO authenticated;
GRANT ALL ON public.almox_devolucoes TO service_role;
ALTER TABLE public.almox_devolucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almox_dev read" ON public.almox_devolucoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "almox_dev write" ON public.almox_devolucoes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'gestor_operacional'::app_role));

INSERT INTO public.almox_categorias (nome, tipo_tamanho, ordem) VALUES
  ('Vestuário','vestuario',1),
  ('Calça','calca',2),
  ('Calçado','calcado',3),
  ('Boné','bone',4),
  ('Sem Tamanho','sem_tamanho',5)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.almox_itens (categoria_id, nome)
SELECT c.id, i.nome FROM (VALUES
  ('Camisa','Vestuário'),
  ('Jaqueta','Vestuário'),
  ('Blusa','Vestuário'),
  ('Jaleco','Vestuário'),
  ('Capa de Chuva','Vestuário'),
  ('Calça','Calça'),
  ('Coturno','Calçado'),
  ('Sapato','Calçado'),
  ('Bota','Calçado'),
  ('Boné','Boné'),
  ('Cinto','Sem Tamanho'),
  ('Cinturão','Sem Tamanho'),
  ('Fiel','Sem Tamanho'),
  ('Coldre','Sem Tamanho'),
  ('Baleiro','Sem Tamanho'),
  ('Manguito','Sem Tamanho'),
  ('Fone de Ouvido','Sem Tamanho'),
  ('Abafador','Sem Tamanho'),
  ('Crachá','Sem Tamanho')
) AS i(nome, categoria)
JOIN public.almox_categorias c ON c.nome = i.categoria
ON CONFLICT (nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.almox_registrar_movimentacao(
  p_empresa_id uuid,
  p_item_id uuid,
  p_tamanho text,
  p_tipo text,
  p_motivo text,
  p_quantidade int,
  p_colaborador_id uuid DEFAULT NULL,
  p_entrega_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_estoque_id uuid;
  v_atual int;
  v_mov_id uuid;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid,'gestor_operacional'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar estoque';
  END IF;
  IF p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

  SELECT id, quantidade_atual INTO v_estoque_id, v_atual
  FROM public.almox_estoque
  WHERE empresa_id = p_empresa_id AND item_id = p_item_id
    AND COALESCE(tamanho,'') = COALESCE(p_tamanho,'')
  FOR UPDATE;

  IF v_estoque_id IS NULL THEN
    INSERT INTO public.almox_estoque (empresa_id, item_id, tamanho, quantidade_atual)
    VALUES (p_empresa_id, p_item_id, p_tamanho, 0)
    RETURNING id, quantidade_atual INTO v_estoque_id, v_atual;
  END IF;

  IF p_tipo = 'entrada' THEN
    UPDATE public.almox_estoque SET quantidade_atual = v_atual + p_quantidade, updated_at = now()
    WHERE id = v_estoque_id;
  ELSIF p_tipo = 'saida' THEN
    IF v_atual < p_quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente (% disponíveis, % solicitados)', v_atual, p_quantidade;
    END IF;
    UPDATE public.almox_estoque SET quantidade_atual = v_atual - p_quantidade, updated_at = now()
    WHERE id = v_estoque_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo;
  END IF;

  INSERT INTO public.almox_movimentacoes(empresa_id, item_id, tamanho, tipo, motivo, quantidade, colaborador_id, entrega_id, observacao, user_id)
  VALUES (p_empresa_id, p_item_id, p_tamanho, p_tipo, p_motivo, p_quantidade, p_colaborador_id, p_entrega_id, p_observacao, v_uid)
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END $$;

GRANT EXECUTE ON FUNCTION public.almox_registrar_movimentacao(uuid,uuid,text,text,text,int,uuid,uuid,text) TO authenticated;
