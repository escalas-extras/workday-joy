
-- 1) Corrige semana_ref_de(timestamptz) para alinhar com a versão (date) — sexta-feira como início
CREATE OR REPLACE FUNCTION public.semana_ref_de(ts timestamp with time zone)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare
  d date := (ts at time zone 'America/Sao_Paulo')::date;
  dow int := extract(isodow from d)::int;
  diff int;
begin
  -- Semana de referência inicia sempre na sexta-feira (dow 5).
  diff := (dow - 5 + 7) % 7;
  return d - diff;
end
$function$;

-- 2) Limpeza dos dados operacionais de teste
DO $cleanup$
DECLARE
  v_recibos_itens int;
  v_recibos int;
  v_extras int;
  v_fech int;
  v_import int;
  v_auditoria int;
BEGIN
  -- desativa triggers para permitir delete em extras (que tem no_delete) e auditoria
  SET LOCAL session_replication_role = 'replica';

  SELECT count(*) INTO v_recibos_itens FROM public.recibos_itens;
  DELETE FROM public.recibos_itens;

  SELECT count(*) INTO v_recibos FROM public.recibos;
  DELETE FROM public.recibos;

  SELECT count(*) INTO v_extras FROM public.extras;
  DELETE FROM public.extras;

  SELECT count(*) INTO v_fech FROM public.fechamentos_semanais;
  DELETE FROM public.fechamentos_semanais;

  SELECT count(*) INTO v_import FROM public.importacoes_lotacao;
  DELETE FROM public.importacoes_lotacao;

  SELECT count(*) INTO v_auditoria FROM public.auditoria;
  DELETE FROM public.auditoria;

  RAISE NOTICE 'Limpeza concluída: recibos_itens=%, recibos=%, extras=%, fechamentos=%, importacoes=%, auditoria=%',
    v_recibos_itens, v_recibos, v_extras, v_fech, v_import, v_auditoria;
END
$cleanup$;

-- 3) Reinicia a sequência de número de recibo
ALTER SEQUENCE public.recibos_numero_seq RESTART WITH 1;

-- 4) Registra a operação de limpeza na auditoria (entrada limpa, pós-reset)
INSERT INTO public.auditoria(tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa)
VALUES (
  'sistema',
  gen_random_uuid(),
  '5bbc3c16-8b6a-4726-8a8f-221706336cc9',
  'LIMPEZA',
  'inicio_operacao',
  NULL,
  'Limpeza de dados de homologação executada. Removidos: recibos_itens, recibos, extras, fechamentos_semanais, importacoes_lotacao, auditoria. Sequência recibos_numero_seq reiniciada para 1.',
  'Início da operação real autorizado pelo administrador.'
);
