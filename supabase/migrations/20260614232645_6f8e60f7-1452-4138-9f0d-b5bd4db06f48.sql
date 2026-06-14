-- Remove controle por empresa no almoxarifado (estoque é único)
TRUNCATE public.almox_devolucoes, public.almox_entregas, public.almox_movimentacoes, public.almox_estoque RESTART IDENTITY CASCADE;

ALTER TABLE public.almox_estoque DROP CONSTRAINT IF EXISTS almox_estoque_empresa_id_item_id_tamanho_key;
ALTER TABLE public.almox_estoque DROP COLUMN IF EXISTS empresa_id;
ALTER TABLE public.almox_estoque ALTER COLUMN tamanho SET DEFAULT '';
UPDATE public.almox_estoque SET tamanho='' WHERE tamanho IS NULL;
ALTER TABLE public.almox_estoque ALTER COLUMN tamanho SET NOT NULL;
ALTER TABLE public.almox_estoque ADD CONSTRAINT almox_estoque_item_tamanho_key UNIQUE (item_id, tamanho);

ALTER TABLE public.almox_movimentacoes DROP COLUMN IF EXISTS empresa_id;
ALTER TABLE public.almox_entregas DROP COLUMN IF EXISTS empresa_id;

-- Recria função sem empresa
DROP FUNCTION IF EXISTS public.almox_registrar_movimentacao(uuid, uuid, text, text, text, integer, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.almox_registrar_movimentacao(
  p_item_id uuid,
  p_tamanho text,
  p_tipo text,
  p_motivo text,
  p_quantidade integer,
  p_colaborador_id uuid DEFAULT NULL,
  p_entrega_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_estoque_id uuid;
  v_atual int;
  v_mov_id uuid;
  v_tam text := COALESCE(p_tamanho,'');
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid,'gestor_operacional'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar estoque';
  END IF;
  IF p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

  SELECT id, quantidade_atual INTO v_estoque_id, v_atual
  FROM public.almox_estoque
  WHERE item_id = p_item_id AND tamanho = v_tam
  FOR UPDATE;

  IF v_estoque_id IS NULL THEN
    INSERT INTO public.almox_estoque (item_id, tamanho, quantidade_atual)
    VALUES (p_item_id, v_tam, 0)
    RETURNING id, quantidade_atual INTO v_estoque_id, v_atual;
  END IF;

  IF p_tipo = 'entrada' THEN
    UPDATE public.almox_estoque SET quantidade_atual = v_atual + p_quantidade, updated_at = now()
    WHERE id = v_estoque_id;
  ELSIF p_tipo = 'saida' THEN
    IF v_atual < p_quantidade THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
    UPDATE public.almox_estoque SET quantidade_atual = v_atual - p_quantidade, updated_at = now()
    WHERE id = v_estoque_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido';
  END IF;

  INSERT INTO public.almox_movimentacoes (item_id, tamanho, tipo, motivo, quantidade, colaborador_id, entrega_id, observacao, responsavel_id)
  VALUES (p_item_id, v_tam, p_tipo, p_motivo, p_quantidade, p_colaborador_id, p_entrega_id, p_observacao, v_uid)
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.almox_registrar_movimentacao(uuid, text, text, text, integer, uuid, uuid, text) TO authenticated;