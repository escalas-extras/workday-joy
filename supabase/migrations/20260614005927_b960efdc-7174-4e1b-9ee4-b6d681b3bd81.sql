create or replace function public.tg_extras_fechamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f record;
  uid uuid := auth.uid();
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_just text := v_new ->> 'justificativa_alteracao';
  v_sem date := (v_new ->> 'semana_ref')::date;
  v_old_sem date := (v_old ->> 'semana_ref')::date;
  changed_keys int := 0;
  k text;
begin
  if v_sem is null then v_sem := v_old_sem; end if;
  if v_sem is null then return new; end if;

  select * into f from public.fechamentos_semanais where semana_ref = v_sem;
  if f is null then return new; end if;

  if f.encerrado_financeiro then
    if not public.is_admin(uid) then
      raise exception 'Semana encerrada financeiramente; somente Admin via reabertura';
    end if;
  end if;

  if f.status = 'fechada' then
    if public.has_role(uid,'supervisor') and not public.is_admin_or_gestor(uid) then
      raise exception 'Supervisor não pode alterar semana fechada';
    end if;

    -- conta apenas mudanças relevantes (ignora campos administrativos automáticos)
    for k in select jsonb_object_keys(v_new) loop
      if (v_old ->> k) is distinct from (v_new ->> k)
         and k not in (
           'updated_at','pago_em','pago_por','faturado_em','faturado_por',
           'cancelado_em','cancelado_por','aprovado_operacional_em','aprovado_operacional_por',
           'aprovado_financeiro_em','aprovado_financeiro_por',
           'situacao_financeira','forma_pagamento','data_pagamento','comprovante_url',
           'justificativa_cancelamento','justificativa_alteracao'
         ) then
        changed_keys := changed_keys + 1;
      end if;
    end loop;

    if changed_keys > 0 and (v_just is null or length(trim(v_just)) = 0) then
      raise exception 'justificativa_alteracao é obrigatória em semana fechada';
    end if;
  end if;
  return new;
end $$;