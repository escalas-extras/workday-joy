
ALTER TYPE public.situacao_financeira ADD VALUE IF NOT EXISTS 'a_cobrar';

CREATE OR REPLACE FUNCTION public.tg_fech_reabertura()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); tem_pgto boolean;
begin
  if tg_op = 'UPDATE' and old.status = 'fechada' and new.status = 'aberta' then
    if new.motivo_reabertura is null or length(trim(new.motivo_reabertura)) = 0 then
      raise exception 'motivo_reabertura é obrigatório';
    end if;
    select exists(
      select 1 from public.extras
       where semana_ref = new.semana_ref
         and (situacao_financeira in ('pago','faturado','a_cobrar'))
    ) into tem_pgto;
    if tem_pgto and not public.is_admin(uid) then
      raise exception 'Somente Admin pode reabrir semana com pagamento/faturamento/à cobrar';
    end if;
    if not tem_pgto and not public.is_admin_or_gestor(uid) then
      raise exception 'Apenas Admin ou Gestores podem reabrir';
    end if;
    new.reaberto_por := uid;
    new.reaberto_em  := now();
  end if;
  if tg_op = 'UPDATE' and old.encerrado_financeiro = false and new.encerrado_financeiro = true then
    if not (public.is_admin(uid) or public.has_role(uid,'gestor_financeiro')) then
      raise exception 'Apenas Admin/Gestor Financeiro encerram financeiramente';
    end if;
    new.encerrado_financeiro_por := uid;
    new.encerrado_financeiro_em  := now();
  end if;
  if tg_op = 'UPDATE' and old.status = 'aberta' and new.status = 'fechada' then
    new.fechado_por := uid;
    new.fechado_em  := now();
  end if;
  return new;
end $function$;
