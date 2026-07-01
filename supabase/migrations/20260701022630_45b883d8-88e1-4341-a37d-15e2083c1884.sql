
-- Fix mutable search_path on trigger functions
ALTER FUNCTION public.tg_audit_trail_immutable() SET search_path = public;
ALTER FUNCTION public.tg_block_disciplinary_delete() SET search_path = public;
ALTER FUNCTION public.tg_fech_snapshots_immutable() SET search_path = public;

-- Lock down SECURITY DEFINER functions: revoke public/anon everywhere
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND d.objid IS NULL
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Trigger functions should NOT be directly executable by anyone but the trigger context.
-- Revoke from authenticated too.
REVOKE ALL ON FUNCTION public.tg_audit() FROM authenticated;
REVOKE ALL ON FUNCTION public.tg_audit_fech() FROM authenticated;
REVOKE ALL ON FUNCTION public.tg_fech_gera_snapshot() FROM authenticated;
REVOKE ALL ON FUNCTION public.tg_recibos_itens_recalc_total() FROM authenticated;

-- handle_new_user runs from auth trigger only
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- RPC functions that authenticated users legitimately call (with internal role checks):
-- keep EXECUTE for authenticated on:
--   almox_registrar_movimentacao, cancelar_pagamento, criar_pagamento,
--   excluir_recibo, fechar_pagamento, reabrir_pagamento,
--   recalc_recibo_valor_total, has_role, is_admin, is_admin_or_gestor,
--   get_recidivism_counts
-- (these already had EXECUTE via default; no further action needed)
