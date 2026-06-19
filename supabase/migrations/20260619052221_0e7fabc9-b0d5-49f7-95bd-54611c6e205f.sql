-- C3: Hardening de funções SECURITY DEFINER

-- 1) get_recidivism_counts: adicionar gate interno por papel
CREATE OR REPLACE FUNCTION public.get_recidivism_counts(_employee_id uuid, _reason_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (
    public.is_admin(v_uid)
    OR public.has_role(v_uid, 'gestor_operacional'::app_role)
    OR public.has_role(v_uid, 'supervisor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar reincidência disciplinar';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'd30',       COUNT(*) FILTER (WHERE warning_date >= current_date - 30),
      'd90',       COUNT(*) FILTER (WHERE warning_date >= current_date - 90),
      'd180',      COUNT(*) FILTER (WHERE warning_date >= current_date - 180),
      'd365',      COUNT(*) FILTER (WHERE warning_date >= current_date - 365),
      'd30_same',  COUNT(*) FILTER (WHERE warning_date >= current_date - 30  AND warning_reason_id = _reason_id),
      'd90_same',  COUNT(*) FILTER (WHERE warning_date >= current_date - 90  AND warning_reason_id = _reason_id),
      'd180_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 180 AND warning_reason_id = _reason_id),
      'd365_same', COUNT(*) FILTER (WHERE warning_date >= current_date - 365 AND warning_reason_id = _reason_id)
    )
    FROM public.disciplinary_warnings
    WHERE colaborador_id = _employee_id AND active = true
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_recidivism_counts(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_recidivism_counts(uuid, uuid) TO authenticated;

-- 2) proximo_numero_recibo: revogar EXECUTE de authenticated.
-- A numeração de recibos é gerada pelo DEFAULT nextval('recibos_numero_seq')
-- na coluna `recibos.numero`, executado pelo próprio Postgres no INSERT.
-- Nenhum caller no código frontend usa esta RPC diretamente.
REVOKE EXECUTE ON FUNCTION public.proximo_numero_recibo() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.proximo_numero_recibo() TO service_role;