create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  k text;
  v_justificativa text;
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria(tabela, registro_id, usuario_id, acao, valor_novo)
      values (tg_table_name, new.id, uid, 'INSERT', to_jsonb(new)::text);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_justificativa := coalesce(
      v_new ->> 'justificativa_alteracao',
      v_new ->> 'justificativa_cancelamento',
      v_new ->> 'motivo_cancelamento'
    );

    for k in select jsonb_object_keys(v_new) loop
      if v_old->>k is distinct from v_new->>k then
        insert into public.auditoria(tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa)
        values (tg_table_name, new.id, uid, 'UPDATE', k, v_old->>k, v_new->>k, v_justificativa);
      end if;
    end loop;
    return new;
  end if;
  return null;
end $$;