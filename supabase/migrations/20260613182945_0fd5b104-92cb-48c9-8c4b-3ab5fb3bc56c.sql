-- Remover obrigatoriedade do vínculo cliente_empresas e tornar empresa_id opcional em extras
ALTER TABLE public.extras ALTER COLUMN empresa_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_extras_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_emp_situacao public.entity_status;
        v_cli_situacao public.entity_status;
        v_fun_situacao public.entity_status;
        v_col_situacao public.entity_status;
begin
  new.semana_ref := public.semana_ref_de(((new.data::text || ' ' || new.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo'));
  select situacao into v_cli_situacao from public.clientes where id = new.cliente_id;
  select situacao into v_fun_situacao from public.funcoes where id = new.funcao_id;
  select situacao into v_col_situacao from public.colaboradores where id = new.colaborador_id;
  if v_cli_situacao <> 'ativo' then raise exception 'Cliente inativo'; end if;
  if v_fun_situacao <> 'ativo' then raise exception 'Função inativa'; end if;
  if v_col_situacao <> 'ativo' then raise exception 'Colaborador inativo'; end if;
  if new.empresa_id is not null then
    select situacao into v_emp_situacao from public.empresas where id = new.empresa_id;
    if v_emp_situacao <> 'ativo' then raise exception 'Empresa inativa'; end if;
  end if;
  return new;
end $function$;