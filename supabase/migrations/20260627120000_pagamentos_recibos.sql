-- Pagamentos: agrupamento de recibos por colaborador + pagamento (não por semana_ref).
-- Migration ADITIVA: não remove colunas/índices legados; backfill 1:1 (sem merge de recibos).
--
-- Rollback lógico (manual, pós-testes) — ver bloco ROLLBACK no final deste arquivo.

-- ---------------------------------------------------------------------------
-- Enum pagamento_status (idempotente)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  CREATE TYPE public.pagamento_status AS ENUM (
    'EM_PREPARACAO',
    'GERADO',
    'FECHADO',
    'CANCELADO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

-- ---------------------------------------------------------------------------
-- Tabela pagamentos
-- criado_por nullable: registros LEGADO podem não ter usuário identificável
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia text,
  data_pagamento date NOT NULL,
  periodo_de date,
  periodo_ate date,
  status public.pagamento_status NOT NULL DEFAULT 'EM_PREPARACAO',
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  gerado_em timestamptz,
  fechado_por uuid REFERENCES auth.users(id),
  fechado_em timestamptz,
  cancelado_por uuid REFERENCES auth.users(id),
  cancelado_em timestamptz,
  motivo_reabertura text,
  reaberto_por uuid REFERENCES auth.users(id),
  reaberto_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data ON public.pagamentos(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_criado ON public.pagamentos(criado_em DESC);

GRANT SELECT, INSERT, UPDATE ON public.pagamentos TO authenticated;
GRANT ALL ON public.pagamentos TO service_role;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pagamentos_select" ON public.pagamentos;
CREATE POLICY "pagamentos_select" ON public.pagamentos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pagamentos_ins" ON public.pagamentos;
CREATE POLICY "pagamentos_ins" ON public.pagamentos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'gestor_financeiro'));

DROP POLICY IF EXISTS "pagamentos_upd" ON public.pagamentos;
CREATE POLICY "pagamentos_upd" ON public.pagamentos
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'gestor_financeiro'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'gestor_financeiro'));

-- ---------------------------------------------------------------------------
-- recibos.pagamento_id (nullable até backfill; sem alterar dados existentes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_recibos_pagamento_id ON public.recibos(pagamento_id);

-- Neutraliza índice legado por semana: não bloqueia recibos com pagamento_id preenchido.
-- Mantém o nome para rollback lógico (recriar versão completa se necessário).
DROP INDEX IF EXISTS public.uq_recibos_colab_semana_ativo;
CREATE UNIQUE INDEX uq_recibos_colab_semana_ativo
  ON public.recibos(colaborador_id, semana_ref)
  WHERE ativo AND pagamento_id IS NULL;

-- ---------------------------------------------------------------------------
-- extras.pagamento_id NOVA coluna (preserva lote_pagamento_id legado intacta)
-- ---------------------------------------------------------------------------
ALTER TABLE public.extras
  ADD COLUMN IF NOT EXISTS pagamento_id uuid;

CREATE INDEX IF NOT EXISTS idx_extras_pagamento ON public.extras(pagamento_id);

DO $do$
BEGIN
  ALTER TABLE public.extras
    ADD CONSTRAINT extras_pagamento_id_fkey
    FOREIGN KEY (pagamento_id) REFERENCES public.pagamentos(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

-- ---------------------------------------------------------------------------
-- Backfill idempotente: 1 pagamento LEGADO FECHADO por recibo (sem merge)
-- Processa apenas recibos ainda sem pagamento_id.
-- criado_por/fechado_por toleram gerado_por NULL (fallback em cadeia).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_pagamento_id uuid;
  v_criado_por uuid;
  v_fechado_por uuid;
  v_fallback_user uuid;
BEGIN
  SELECT ur.user_id INTO v_fallback_user
  FROM public.user_roles ur
  WHERE ur.role IN ('admin', 'gestor_financeiro')
  ORDER BY CASE ur.role WHEN 'admin' THEN 0 ELSE 1 END, ur.user_id
  LIMIT 1;

  FOR r IN
    SELECT *
    FROM public.recibos
    WHERE pagamento_id IS NULL
    ORDER BY gerado_em, numero
  LOOP
    v_criado_por := COALESCE(r.gerado_por, r.arquivado_por, v_fallback_user);
    v_fechado_por := COALESCE(r.gerado_por, r.arquivado_por, v_fallback_user);

    INSERT INTO public.pagamentos (
      referencia, data_pagamento, status, criado_por, criado_em,
      gerado_em, fechado_por, fechado_em
    ) VALUES (
      'LEGADO recibo #' || r.numero,
      r.data_pagamento,
      'FECHADO',
      v_criado_por,
      r.gerado_em,
      r.gerado_em,
      v_fechado_por,
      COALESCE(r.arquivado_em, r.gerado_em)
    )
    RETURNING id INTO v_pagamento_id;

    UPDATE public.recibos
    SET pagamento_id = v_pagamento_id
    WHERE id = r.id;

    -- Preenche apenas extras.pagamento_id (nova coluna); lote_pagamento_id intacto
    UPDATE public.extras e
    SET pagamento_id = v_pagamento_id
    FROM public.recibos_itens ri
    WHERE ri.recibo_id = r.id
      AND ri.extra_id = e.id
      AND e.pagamento_id IS NULL;
  END LOOP;
END $$;

-- NOT NULL somente após verificação explícita (falha clara se backfill incompleto)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.recibos WHERE pagamento_id IS NULL) THEN
    RAISE EXCEPTION
      'Backfill incompleto: existem recibos sem pagamento_id. Abortando SET NOT NULL.';
  END IF;
END $$;

ALTER TABLE public.recibos
  ALTER COLUMN pagamento_id SET NOT NULL;

-- Nova unicidade por pagamento; índice por semana permanece parcial (inerte após backfill).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recibos_colab_pagamento_ativo
  ON public.recibos(colaborador_id, pagamento_id)
  WHERE ativo;

-- ---------------------------------------------------------------------------
-- Triggers e funções (CREATE OR REPLACE — reversível via migration de rollback)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_touch_pagamentos ON public.pagamentos;
CREATE TRIGGER trg_touch_pagamentos
  BEFORE UPDATE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.recalc_recibo_valor_total(p_recibo_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(ri.valor_snapshot), 0)
  INTO v_total
  FROM public.recibos_itens ri
  WHERE ri.recibo_id = p_recibo_id;

  UPDATE public.recibos
  SET valor_total = v_total
  WHERE id = p_recibo_id;

  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recibos_itens_recalc_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recalc_recibo_valor_total(
    CASE WHEN tg_op = 'DELETE' THEN old.recibo_id ELSE new.recibo_id END
  );
  RETURN COALESCE(new, old);
END;
$function$;

DROP TRIGGER IF EXISTS trg_recibos_itens_recalc_total ON public.recibos_itens;
CREATE TRIGGER trg_recibos_itens_recalc_total
  AFTER INSERT OR DELETE ON public.recibos_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_recibos_itens_recalc_total();

CREATE OR REPLACE FUNCTION public.tg_recibos_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_soma numeric(12,2);
BEGIN
  IF old.valor_total IS DISTINCT FROM new.valor_total THEN
    SELECT COALESCE(SUM(ri.valor_snapshot), 0)
    INTO v_soma
    FROM public.recibos_itens ri
    WHERE ri.recibo_id = new.id;

    IF new.valor_total IS DISTINCT FROM v_soma THEN
      RAISE EXCEPTION 'valor_total do recibo é congelado (esperado %)', v_soma;
    END IF;
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recibos_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF new.ativo AND new.pagamento_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recibos r
    WHERE r.colaborador_id = new.colaborador_id
      AND r.pagamento_id = new.pagamento_id
      AND r.ativo
      AND r.id <> new.id
  ) THEN
    RAISE EXCEPTION 'Já existe recibo ativo para este colaborador neste pagamento';
  END IF;
  RETURN new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_pagamento(
  p_data_pagamento date,
  p_referencia text DEFAULT NULL,
  p_periodo_de date DEFAULT NULL,
  p_periodo_ate date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'gestor_financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  INSERT INTO public.pagamentos (
    referencia, data_pagamento, periodo_de, periodo_ate, status, criado_por
  ) VALUES (
    p_referencia, p_data_pagamento, p_periodo_de, p_periodo_ate, 'EM_PREPARACAO', v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fechar_pagamento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'gestor_financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.pagamentos
  SET status = 'FECHADO',
      fechado_por = v_uid,
      fechado_em = now()
  WHERE id = p_id
    AND status IN ('EM_PREPARACAO', 'GERADO');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou não pode ser fechado (status atual inválido)';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reabrir_pagamento(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'gestor_financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'motivo é obrigatório para reabertura';
  END IF;

  UPDATE public.pagamentos
  SET status = 'EM_PREPARACAO',
      motivo_reabertura = p_motivo,
      reaberto_por = v_uid,
      reaberto_em = now(),
      fechado_por = NULL,
      fechado_em = NULL
  WHERE id = p_id AND status = 'FECHADO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou não está FECHADO';
  END IF;

  INSERT INTO public.auditoria(tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa)
  VALUES ('pagamentos', p_id, v_uid, 'REABERTURA', 'status', 'FECHADO', 'EM_PREPARACAO', p_motivo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_pagamento(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar pagamentos';
  END IF;

  UPDATE public.pagamentos
  SET status = 'CANCELADO',
      cancelado_por = v_uid,
      cancelado_em = now()
  WHERE id = p_id AND status IN ('EM_PREPARACAO', 'GERADO');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou não pode ser cancelado';
  END IF;

  IF p_motivo IS NOT NULL THEN
    INSERT INTO public.auditoria(tabela, registro_id, usuario_id, acao, justificativa)
    VALUES ('pagamentos', p_id, v_uid, 'CANCELAMENTO', p_motivo);
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_pagamento(date, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_pagamento(date, text, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fechar_pagamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_pagamento(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reabrir_pagamento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_pagamento(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancelar_pagamento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_pagamento(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.recalc_recibo_valor_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_recibo_valor_total(uuid) TO authenticated;

-- ===========================================================================
-- ROLLBACK LÓGICO (executar manualmente apenas se necessário reverter)
-- ===========================================================================
-- Pré-requisito: código da aplicação já revertido para fluxo anterior.
--
-- 1) Remover NOT NULL (permite desvincular recibos):
--    ALTER TABLE public.recibos ALTER COLUMN pagamento_id DROP NOT NULL;
--
-- 2) Desvincular recibos e extras da nova coluna:
--    UPDATE public.recibos SET pagamento_id = NULL;
--    UPDATE public.extras SET pagamento_id = NULL;
--
-- 3) Remover pagamentos LEGADO (opcional, preserva histórico se mantidos):
--    DELETE FROM public.pagamentos WHERE referencia LIKE 'LEGADO recibo #%';
--
-- 4) Dropar objetos novos (ordem sugerida):
--    DROP INDEX IF EXISTS public.uq_recibos_colab_pagamento_ativo;
--    DROP TRIGGER IF EXISTS trg_recibos_itens_recalc_total ON public.recibos_itens;
--    DROP TRIGGER IF EXISTS trg_touch_pagamentos ON public.pagamentos;
--    DROP FUNCTION IF EXISTS public.cancelar_pagamento(uuid, text);
--    DROP FUNCTION IF EXISTS public.reabrir_pagamento(uuid, text);
--    DROP FUNCTION IF EXISTS public.fechar_pagamento(uuid);
--    DROP FUNCTION IF EXISTS public.criar_pagamento(date, text, date, date);
--    DROP FUNCTION IF EXISTS public.recalc_recibo_valor_total(uuid);
--    DROP FUNCTION IF EXISTS public.tg_recibos_itens_recalc_total();
--    ALTER TABLE public.extras DROP CONSTRAINT IF EXISTS extras_pagamento_id_fkey;
--    ALTER TABLE public.extras DROP COLUMN IF EXISTS pagamento_id;
--    ALTER TABLE public.recibos DROP COLUMN IF EXISTS pagamento_id;
--    DROP TABLE IF EXISTS public.pagamentos;
--    DROP TYPE IF EXISTS public.pagamento_status;
--
-- 5) Restaurar funções legadas de triggers (via migration anterior ou backup).
-- 6) Restaurar índice por semana na forma original (se rollback completo):
--    DROP INDEX IF EXISTS public.uq_recibos_colab_semana_ativo;
--    CREATE UNIQUE INDEX uq_recibos_colab_semana_ativo
--      ON public.recibos(colaborador_id, semana_ref) WHERE ativo;
-- 7) extras.lote_pagamento_id permanece intacto (nunca foi renomeado aqui).
