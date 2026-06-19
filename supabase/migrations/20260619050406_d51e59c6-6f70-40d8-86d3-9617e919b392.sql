
-- Permite exclusão definitiva de recibos por admin
CREATE OR REPLACE FUNCTION public.tg_recibos_itens_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'recibos_itens é imutável após criação';
  end if;
  -- DELETE é permitido (controlado pelo RPC excluir_recibo)
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.excluir_recibo(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if not public.is_admin(v_uid) then
    raise exception 'Apenas administradores podem excluir recibos';
  end if;
  delete from public.recibos_itens where recibo_id = p_id;
  delete from public.recibos where id = p_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.excluir_recibo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_recibo(uuid) TO authenticated;

-- Limpa recibos já cancelados anteriormente (soft-cancel) — agora exclusão é definitiva
DELETE FROM public.recibos_itens WHERE recibo_id IN (SELECT id FROM public.recibos WHERE ativo = false);
DELETE FROM public.recibos WHERE ativo = false;
