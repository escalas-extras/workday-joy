-- Fase C: snapshots imutáveis de fechamentos semanais
-- Cria uma cópia completa (linha-a-linha em JSONB) de todos os extras da semana
-- no momento em que a semana passa para "fechada". Garante imutabilidade do histórico.

CREATE TABLE IF NOT EXISTS public.fechamentos_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos_semanais(id) ON DELETE RESTRICT,
  semana_ref date NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  gerado_por uuid,
  total_registros integer NOT NULL DEFAULT 0,
  total_valor numeric(14,2) NOT NULL DEFAULT 0,
  agregados jsonb NOT NULL DEFAULT '{}'::jsonb,
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fechamentos_snapshots TO authenticated;
GRANT ALL ON public.fechamentos_snapshots TO service_role;

ALTER TABLE public.fechamentos_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_auth" ON public.fechamentos_snapshots
  FOR SELECT TO authenticated USING (true);

-- INSERT só ocorre via trigger SECURITY DEFINER; bloqueado para clientes diretamente.
CREATE POLICY "snapshots_no_direct_insert" ON public.fechamentos_snapshots
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_fech_snap_fech ON public.fechamentos_snapshots(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fech_snap_semana ON public.fechamentos_snapshots(semana_ref);

-- Imutabilidade: bloqueia UPDATE e DELETE de snapshots.
CREATE OR REPLACE FUNCTION public.tg_fech_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fechamentos_snapshots é imutável (operação % proibida)', tg_op;
END $$;

DROP TRIGGER IF EXISTS trg_fech_snap_no_update ON public.fechamentos_snapshots;
CREATE TRIGGER trg_fech_snap_no_update
  BEFORE UPDATE OR DELETE ON public.fechamentos_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_fech_snapshots_immutable();

-- Gera snapshot quando a semana passa de aberta -> fechada.
CREATE OR REPLACE FUNCTION public.tg_fech_gera_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extras jsonb;
  v_count integer;
  v_total numeric(14,2);
  v_agg jsonb;
BEGIN
  IF NOT (tg_op = 'UPDATE' AND old.status = 'aberta' AND new.status = 'fechada') THEN
    RETURN new;
  END IF;

  -- Cópia completa dos extras da semana (linha-a-linha) com joins úteis.
  SELECT COALESCE(jsonb_agg(to_jsonb(e.*) || jsonb_build_object(
            'colaborador_nome', c.nome,
            'colaborador_matricula', c.matricula,
            'cliente_nome', cl.nome_fantasia,
            'empresa_nome', emp.nome,
            'funcao_nome', fn.nome
         ) ORDER BY e.data, e.hora_inicio), '[]'::jsonb),
         COUNT(*),
         COALESCE(SUM(e.valor), 0)
    INTO v_extras, v_count, v_total
    FROM public.extras e
    LEFT JOIN public.colaboradores c ON c.id = e.colaborador_id
    LEFT JOIN public.clientes cl ON cl.id = e.cliente_id
    LEFT JOIN public.empresas emp ON emp.id = e.empresa_id
    LEFT JOIN public.funcoes fn ON fn.id = e.funcao_id
   WHERE e.semana_ref = new.semana_ref;

  -- Agregados úteis para consulta rápida sem desserializar JSON inteiro.
  SELECT jsonb_build_object(
    'por_status', COALESCE(jsonb_object_agg(status, qtd), '{}'::jsonb),
    'por_situacao_financeira', COALESCE((
      SELECT jsonb_object_agg(COALESCE(situacao_financeira::text,'sem_situacao'), qtd2)
      FROM (
        SELECT situacao_financeira, COUNT(*) qtd2
          FROM public.extras WHERE semana_ref = new.semana_ref
         GROUP BY situacao_financeira
      ) s
    ), '{}'::jsonb),
    'por_classificacao', COALESCE((
      SELECT jsonb_object_agg(COALESCE(classificacao_comercial::text,'sem_classificacao'), valor_tot)
      FROM (
        SELECT classificacao_comercial, SUM(valor) valor_tot
          FROM public.extras WHERE semana_ref = new.semana_ref
         GROUP BY classificacao_comercial
      ) s
    ), '{}'::jsonb)
  )
  INTO v_agg
  FROM (
    SELECT status, COUNT(*) qtd
      FROM public.extras WHERE semana_ref = new.semana_ref
     GROUP BY status
  ) t;

  INSERT INTO public.fechamentos_snapshots (
    fechamento_id, semana_ref, gerado_por, total_registros, total_valor, agregados, extras
  ) VALUES (
    new.id, new.semana_ref, auth.uid(), v_count, v_total, COALESCE(v_agg,'{}'::jsonb), v_extras
  );

  RETURN new;
END $$;

DROP TRIGGER IF EXISTS trg_fech_gera_snapshot ON public.fechamentos_semanais;
CREATE TRIGGER trg_fech_gera_snapshot
  AFTER UPDATE ON public.fechamentos_semanais
  FOR EACH ROW EXECUTE FUNCTION public.tg_fech_gera_snapshot();