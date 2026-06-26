
CREATE INDEX IF NOT EXISTS idx_recibos_itens_extra ON public.recibos_itens(extra_id);

CREATE OR REPLACE FUNCTION public.tg_recibos_itens_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare e record;
begin
  select status, situacao_financeira, valor into e from public.extras where id = new.extra_id;
  if e.status <> 'aprovado_financeiro' or e.situacao_financeira <> 'pago' then
    raise exception 'Extra % não elegível para recibo (status=%, sit_fin=%)', new.extra_id, e.status, e.situacao_financeira;
  end if;
  if new.valor_snapshot is null then new.valor_snapshot := e.valor; end if;

  -- Impede que a mesma extra esteja vinculada a mais de um recibo ATIVO
  if exists (
    select 1
    from public.recibos_itens ri
    join public.recibos r on r.id = ri.recibo_id
    where ri.extra_id = new.extra_id
      and ri.recibo_id <> new.recibo_id
      and r.ativo = true
  ) then
    raise exception 'Extra % já está vinculada a um recibo ativo', new.extra_id;
  end if;

  return new;
end $function$;
