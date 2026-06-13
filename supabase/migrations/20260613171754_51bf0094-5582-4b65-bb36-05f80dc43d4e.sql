-- =====================================================================
-- MVP Gestão de Horas Extras — Baseline Definitiva
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists unaccent;

-- ENUMS
create type public.app_role as enum ('admin','gestor_operacional','gestor_financeiro','supervisor');
create type public.entity_status as enum ('ativo','inativo');
create type public.extra_status as enum ('pendente','aprovado_operacional','rejeitado','aprovado_financeiro');
create type public.situacao_financeira as enum ('pendente_pagamento','pago','faturado','cancelado');
create type public.forma_pagamento as enum ('pix','dinheiro','transferencia','conta_corrente');
create type public.situacao_servico as enum ('contrato','cobertura_ferias','cobertura_atestado','evento','apoio_operacional','outro');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- empresas
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  situacao public.entity_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.empresas to authenticated;
grant all on public.empresas to service_role;
alter table public.empresas enable row level security;

-- funcoes
create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  situacao public.entity_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.funcoes to authenticated;
grant all on public.funcoes to service_role;
alter table public.funcoes enable row level security;

-- clientes
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_fantasia text not null,
  razao_social text not null,
  cnpj text not null unique,
  situacao public.entity_status not null default 'ativo',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clientes to authenticated;
grant all on public.clientes to service_role;
alter table public.clientes enable row level security;

-- cliente_empresas
create table public.cliente_empresas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  situacao public.entity_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cliente_id, empresa_id)
);
create index idx_cliente_empresas_cliente on public.cliente_empresas(cliente_id);
create index idx_cliente_empresas_empresa on public.cliente_empresas(empresa_id);
grant select, insert, update, delete on public.cliente_empresas to authenticated;
grant all on public.cliente_empresas to service_role;
alter table public.cliente_empresas enable row level security;

-- colaboradores
create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique,
  nome text not null,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  funcao_id uuid not null references public.funcoes(id) on delete restrict,
  situacao public.entity_status not null default 'ativo',
  codigo_ponto text,
  ultima_sincronizacao_ponto timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_colaboradores_empresa on public.colaboradores(empresa_id);
create index idx_colaboradores_funcao on public.colaboradores(funcao_id);
grant select, insert, update, delete on public.colaboradores to authenticated;
grant all on public.colaboradores to service_role;
alter table public.colaboradores enable row level security;

-- motivos_rejeicao
create table public.motivos_rejeicao (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.motivos_rejeicao to authenticated;
grant all on public.motivos_rejeicao to service_role;
alter table public.motivos_rejeicao enable row level security;

-- fechamentos_semanais
create table public.fechamentos_semanais (
  id uuid primary key default gen_random_uuid(),
  semana_ref date not null unique,
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  fechado_por uuid references auth.users(id),
  fechado_em timestamptz,
  reaberto_por uuid references auth.users(id),
  reaberto_em timestamptz,
  motivo_reabertura text,
  encerrado_financeiro boolean not null default false,
  encerrado_financeiro_por uuid references auth.users(id),
  encerrado_financeiro_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.fechamentos_semanais to authenticated;
grant all on public.fechamentos_semanais to service_role;
alter table public.fechamentos_semanais enable row level security;

-- extras
create table public.extras (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  funcao_id uuid not null references public.funcoes(id) on delete restrict,
  hora_inicio time not null,
  hora_termino time not null,
  valor numeric(12,2) not null check (valor >= 0),
  valor_faturamento numeric(12,2) check (valor_faturamento is null or valor_faturamento >= 0),
  motivo text,
  situacao_servico public.situacao_servico not null,
  observacoes text,
  emitente_id uuid not null references auth.users(id),
  status public.extra_status not null default 'pendente',
  semana_ref date not null,
  fechado_em timestamptz,
  situacao_financeira public.situacao_financeira,
  motivo_rejeicao_id uuid references public.motivos_rejeicao(id),
  motivo_rejeicao_descricao text,
  aprovado_operacional_por uuid references auth.users(id),
  aprovado_operacional_em timestamptz,
  aprovado_financeiro_por uuid references auth.users(id),
  aprovado_financeiro_em timestamptz,
  forma_pagamento public.forma_pagamento,
  data_pagamento date,
  comprovante_url text,
  pago_por uuid references auth.users(id),
  pago_em timestamptz,
  faturado_por uuid references auth.users(id),
  faturado_em timestamptz,
  lote_pagamento_id uuid,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id),
  justificativa_cancelamento text,
  justificativa_alteracao text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_horarios_diferentes check (hora_inicio <> hora_termino)
);
create index idx_extras_status on public.extras(status);
create index idx_extras_sit_fin on public.extras(situacao_financeira);
create index idx_extras_semana on public.extras(semana_ref);
create index idx_extras_colab on public.extras(colaborador_id);
create index idx_extras_cliente on public.extras(cliente_id);
create index idx_extras_empresa on public.extras(empresa_id);
create index idx_extras_data on public.extras(data);
create index idx_extras_lote on public.extras(lote_pagamento_id);
grant select, insert, update on public.extras to authenticated;
grant all on public.extras to service_role;
alter table public.extras enable row level security;

-- recibos
create sequence public.recibos_numero_seq;
create table public.recibos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.recibos_numero_seq'),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  semana_ref date not null,
  gerado_por uuid not null references auth.users(id),
  gerado_em timestamptz not null default now(),
  data_pagamento date not null,
  valor_total numeric(12,2) not null check (valor_total >= 0),
  assinatura_url text,
  ativo boolean not null default true,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_recibos_colab_semana_ativo on public.recibos(colaborador_id, semana_ref) where ativo;
create index idx_recibos_colab on public.recibos(colaborador_id);
create index idx_recibos_semana on public.recibos(semana_ref);
create index idx_recibos_pagamento on public.recibos(data_pagamento);
grant select, insert, update on public.recibos to authenticated;
grant all on public.recibos to service_role;
alter table public.recibos enable row level security;

-- recibos_itens
create table public.recibos_itens (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.recibos(id) on delete cascade,
  extra_id uuid not null references public.extras(id) on delete restrict,
  valor_snapshot numeric(12,2) not null check (valor_snapshot >= 0),
  unique(recibo_id, extra_id)
);
create index idx_recibos_itens_recibo on public.recibos_itens(recibo_id);
grant select, insert on public.recibos_itens to authenticated;
grant all on public.recibos_itens to service_role;
alter table public.recibos_itens enable row level security;

-- auditoria
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  usuario_id uuid,
  acao text not null,
  campo text,
  valor_anterior text,
  valor_novo text,
  justificativa text,
  criado_em timestamptz not null default now()
);
create index idx_audit_registro on public.auditoria(registro_id);
create index idx_audit_usuario on public.auditoria(usuario_id);
create index idx_audit_criado on public.auditoria(criado_em);
grant select on public.auditoria to authenticated;
grant all on public.auditoria to service_role;
alter table public.auditoria enable row level security;

-- FUNÇÕES
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin');
$$;

create or replace function public.is_admin_or_gestor(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin')
      or public.has_role(_user_id,'gestor_operacional')
      or public.has_role(_user_id,'gestor_financeiro');
$$;

create or replace function public.semana_ref_de(ts timestamptz)
returns date language plpgsql immutable as $$
declare
  d date := (ts at time zone 'America/Sao_Paulo')::date;
  t time := (ts at time zone 'America/Sao_Paulo')::time;
  dow int := extract(isodow from d)::int;
  diff int;
begin
  if dow = 4 then
    if t >= time '19:00' then return d; else return d - 7; end if;
  end if;
  diff := (dow - 4 + 7) % 7;
  return d - diff;
end $$;

create or replace function public.normalize_text(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(lower(unaccent(coalesce(t,''))), '\s+', ' ', 'g'));
$$;

create or replace function public.proximo_numero_recibo()
returns bigint language sql volatile as $$
  select nextval('public.recibos_numero_seq');
$$;

-- TRIGGERS
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_touch_profiles before update on public.profiles for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_empresas before update on public.empresas for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_funcoes before update on public.funcoes for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_clientes before update on public.clientes for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_cliente_empresas before update on public.cliente_empresas for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_colaboradores before update on public.colaboradores for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_extras before update on public.extras for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_recibos before update on public.recibos for each row execute function public.tg_touch_updated_at();
create trigger trg_touch_fech before update on public.fechamentos_semanais for each row execute function public.tg_touch_updated_at();

create or replace function public.tg_extras_validate()
returns trigger language plpgsql as $$
declare v_emp_situacao public.entity_status;
        v_cli_situacao public.entity_status;
        v_fun_situacao public.entity_status;
        v_col_situacao public.entity_status;
        v_link_ok boolean;
begin
  new.semana_ref := public.semana_ref_de(((new.data::text || ' ' || new.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo'));
  select situacao into v_emp_situacao from public.empresas where id = new.empresa_id;
  select situacao into v_cli_situacao from public.clientes where id = new.cliente_id;
  select situacao into v_fun_situacao from public.funcoes where id = new.funcao_id;
  select situacao into v_col_situacao from public.colaboradores where id = new.colaborador_id;
  if v_emp_situacao <> 'ativo' then raise exception 'Empresa inativa'; end if;
  if v_cli_situacao <> 'ativo' then raise exception 'Cliente inativo'; end if;
  if v_fun_situacao <> 'ativo' then raise exception 'Função inativa'; end if;
  if v_col_situacao <> 'ativo' then raise exception 'Colaborador inativo'; end if;
  select true into v_link_ok from public.cliente_empresas
   where cliente_id = new.cliente_id and empresa_id = new.empresa_id and situacao = 'ativo' limit 1;
  if v_link_ok is null then
    raise exception 'Vínculo cliente/empresa inexistente ou inativo em cliente_empresas';
  end if;
  return new;
end $$;

create trigger trg_extras_validate
before insert or update of data, hora_inicio, hora_termino, colaborador_id, cliente_id, empresa_id, funcao_id
on public.extras for each row execute function public.tg_extras_validate();

create or replace function public.tg_extras_conflito()
returns trigger language plpgsql as $$
declare r_inicio timestamptz; r_fim timestamptz; conflito boolean;
begin
  if new.status = 'rejeitado' or new.situacao_financeira = 'cancelado' then return new; end if;
  r_inicio := (new.data::text || ' ' || new.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo';
  if new.hora_termino <= new.hora_inicio then
    r_fim := ((new.data + 1)::text || ' ' || new.hora_termino::text)::timestamp at time zone 'America/Sao_Paulo';
  else
    r_fim := (new.data::text || ' ' || new.hora_termino::text)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  select true into conflito
  from public.extras e
  where e.colaborador_id = new.colaborador_id
    and e.id <> new.id
    and e.status <> 'rejeitado'
    and (e.situacao_financeira is null or e.situacao_financeira <> 'cancelado')
    and tstzrange(
      ((e.data::text || ' ' || e.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo'),
      case when e.hora_termino <= e.hora_inicio
           then (((e.data + 1)::text || ' ' || e.hora_termino::text)::timestamp at time zone 'America/Sao_Paulo')
           else ((e.data::text || ' ' || e.hora_termino::text)::timestamp at time zone 'America/Sao_Paulo') end,
      '[)') && tstzrange(r_inicio, r_fim, '[)')
  limit 1;
  if conflito then raise exception 'Conflito de horário para este colaborador'; end if;
  return new;
end $$;

create trigger trg_extras_conflito
before insert or update of data, hora_inicio, hora_termino, colaborador_id, status, situacao_financeira
on public.extras for each row execute function public.tg_extras_conflito();

create or replace function public.tg_extras_transicoes()
returns trigger language plpgsql as $$
declare uid uuid := auth.uid();
begin
  if new.status = 'rejeitado' then
    if new.motivo_rejeicao_id is null then
      raise exception 'motivo_rejeicao_id é obrigatório para rejeição';
    end if;
    if exists (select 1 from public.motivos_rejeicao m where m.id = new.motivo_rejeicao_id and lower(m.descricao) = 'outros')
       and (new.motivo_rejeicao_descricao is null or length(trim(new.motivo_rejeicao_descricao)) = 0) then
      raise exception 'motivo_rejeicao_descricao é obrigatório quando motivo = Outros';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status = 'aprovado_operacional' then
        new.aprovado_operacional_por := coalesce(new.aprovado_operacional_por, uid);
        new.aprovado_operacional_em  := coalesce(new.aprovado_operacional_em, now());
      elsif new.status = 'aprovado_financeiro' then
        new.aprovado_financeiro_por := coalesce(new.aprovado_financeiro_por, uid);
        new.aprovado_financeiro_em  := coalesce(new.aprovado_financeiro_em, now());
        if new.situacao_financeira is null then new.situacao_financeira := 'pendente_pagamento'; end if;
      end if;
    end if;
    if old.situacao_financeira is distinct from new.situacao_financeira then
      if new.situacao_financeira = 'pago' then
        new.pago_por := coalesce(new.pago_por, uid);
        new.pago_em  := coalesce(new.pago_em, now());
        if new.data_pagamento is null or new.forma_pagamento is null then
          raise exception 'data_pagamento e forma_pagamento são obrigatórios ao marcar como pago';
        end if;
      elsif new.situacao_financeira = 'faturado' then
        new.faturado_por := coalesce(new.faturado_por, uid);
        new.faturado_em  := coalesce(new.faturado_em, now());
      elsif new.situacao_financeira = 'cancelado' then
        if new.justificativa_cancelamento is null or length(trim(new.justificativa_cancelamento)) = 0 then
          raise exception 'justificativa_cancelamento é obrigatória';
        end if;
        new.cancelado_por := coalesce(new.cancelado_por, uid);
        new.cancelado_em  := coalesce(new.cancelado_em, now());
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_extras_transicoes
before insert or update on public.extras
for each row execute function public.tg_extras_transicoes();

create or replace function public.tg_extras_fechamento()
returns trigger language plpgsql as $$
declare f record; uid uuid := auth.uid();
begin
  select * into f from public.fechamentos_semanais where semana_ref = coalesce(new.semana_ref, old.semana_ref);
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
    if (new.justificativa_alteracao is null or length(trim(new.justificativa_alteracao)) = 0) then
      raise exception 'justificativa_alteracao é obrigatória em semana fechada';
    end if;
  end if;
  return new;
end $$;

create trigger trg_extras_fechamento
before update on public.extras
for each row execute function public.tg_extras_fechamento();

create or replace function public.tg_extras_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'DELETE não permitido em extras; utilize situacao_financeira = cancelado com justificativa';
end $$;
create trigger trg_extras_no_delete before delete on public.extras
for each row execute function public.tg_extras_no_delete();

create or replace function public.tg_fech_reabertura()
returns trigger language plpgsql as $$
declare uid uuid := auth.uid(); tem_pgto boolean;
begin
  if tg_op = 'UPDATE' and old.status = 'fechada' and new.status = 'aberta' then
    if new.motivo_reabertura is null or length(trim(new.motivo_reabertura)) = 0 then
      raise exception 'motivo_reabertura é obrigatório';
    end if;
    select exists(
      select 1 from public.extras
       where semana_ref = new.semana_ref
         and (situacao_financeira in ('pago','faturado'))
    ) into tem_pgto;
    if tem_pgto and not public.is_admin(uid) then
      raise exception 'Somente Admin pode reabrir semana com pagamento/faturamento';
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
end $$;
create trigger trg_fech_reabertura before update on public.fechamentos_semanais
for each row execute function public.tg_fech_reabertura();

create or replace function public.tg_recibos_validate()
returns trigger language plpgsql as $$
begin
  if new.ativo and exists (
    select 1 from public.recibos r
     where r.colaborador_id = new.colaborador_id
       and r.semana_ref = new.semana_ref
       and r.ativo
       and r.id <> new.id
  ) then
    raise exception 'Já existe recibo ativo para este colaborador na semana';
  end if;
  return new;
end $$;
create trigger trg_recibos_validate before insert or update on public.recibos
for each row execute function public.tg_recibos_validate();

create or replace function public.tg_recibos_itens_validate()
returns trigger language plpgsql as $$
declare e record;
begin
  select status, situacao_financeira, valor into e from public.extras where id = new.extra_id;
  if e.status <> 'aprovado_financeiro' or e.situacao_financeira <> 'pago' then
    raise exception 'Extra % não elegível para recibo (status=%, sit_fin=%)', new.extra_id, e.status, e.situacao_financeira;
  end if;
  if new.valor_snapshot is null then new.valor_snapshot := e.valor; end if;
  return new;
end $$;
create trigger trg_recibos_itens_validate before insert on public.recibos_itens
for each row execute function public.tg_recibos_itens_validate();

create or replace function public.tg_recibos_freeze()
returns trigger language plpgsql as $$
begin
  if old.valor_total is distinct from new.valor_total then
    raise exception 'valor_total do recibo é congelado';
  end if;
  return new;
end $$;
create trigger trg_recibos_freeze before update on public.recibos
for each row execute function public.tg_recibos_freeze();

create or replace function public.tg_recibos_itens_freeze()
returns trigger language plpgsql as $$
begin
  raise exception 'recibos_itens é imutável após criação';
end $$;
create trigger trg_recibos_itens_freeze before update or delete on public.recibos_itens
for each row execute function public.tg_recibos_itens_freeze();

create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_old jsonb; v_new jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria(tabela, registro_id, usuario_id, acao, valor_novo)
      values (tg_table_name, new.id, uid, 'INSERT', to_jsonb(new)::text);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if v_old->>k is distinct from v_new->>k then
        insert into public.auditoria(tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa)
        values (tg_table_name, new.id, uid, 'UPDATE', k, v_old->>k, v_new->>k,
                coalesce(new.justificativa_alteracao, new.justificativa_cancelamento, null));
      end if;
    end loop;
    return new;
  end if;
  return null;
end $$;

create or replace function public.tg_audit_fech()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_old jsonb; v_new jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria(tabela, registro_id, usuario_id, acao, valor_novo)
      values (tg_table_name, new.id, uid, 'INSERT', to_jsonb(new)::text);
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if v_old->>k is distinct from v_new->>k then
        insert into public.auditoria(tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa)
        values (tg_table_name, new.id, uid, 'UPDATE', k, v_old->>k, v_new->>k, new.motivo_reabertura);
      end if;
    end loop;
    return new;
  end if;
  return null;
end $$;

create trigger trg_audit_extras after insert or update on public.extras
for each row execute function public.tg_audit();
create trigger trg_audit_recibos after insert or update on public.recibos
for each row execute function public.tg_audit();
create trigger trg_audit_fech after insert or update on public.fechamentos_semanais
for each row execute function public.tg_audit_fech();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email);
  return new;
end $$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- POLICIES
create policy "profiles_select_self_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profiles_insert_admin" on public.profiles for insert to authenticated
  with check (public.is_admin(auth.uid()) or id = auth.uid());

create policy "user_roles_select" on public.user_roles for select to authenticated using (true);
create policy "user_roles_admin_write" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

do $$
declare t text;
begin
  for t in select unnest(array['empresas','funcoes','clientes','cliente_empresas','colaboradores','motivos_rejeicao'])
  loop
    execute format('create policy "%s_select" on public.%s for select to authenticated using (true);', t, t);
    execute format('create policy "%s_admin_ins" on public.%s for insert to authenticated with check (public.is_admin(auth.uid()));', t, t);
    execute format('create policy "%s_admin_upd" on public.%s for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));', t, t);
    execute format('create policy "%s_admin_del" on public.%s for delete to authenticated using (public.is_admin(auth.uid()));', t, t);
  end loop;
end $$;

create policy "extras_select" on public.extras for select to authenticated using (true);
create policy "extras_insert" on public.extras for insert to authenticated
  with check (
    emitente_id = auth.uid()
    and status = 'pendente'
    and (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'supervisor'))
  );
create policy "extras_update" on public.extras for update to authenticated
  using (
    public.is_admin(auth.uid())
    or public.has_role(auth.uid(),'gestor_operacional')
    or public.has_role(auth.uid(),'gestor_financeiro')
    or (public.has_role(auth.uid(),'supervisor') and emitente_id = auth.uid() and status = 'pendente')
  )
  with check (
    public.is_admin(auth.uid())
    or public.has_role(auth.uid(),'gestor_operacional')
    or public.has_role(auth.uid(),'gestor_financeiro')
    or (public.has_role(auth.uid(),'supervisor') and emitente_id = auth.uid() and status = 'pendente')
  );
create policy "extras_no_delete" on public.extras for delete to authenticated using (false);

create policy "fech_select" on public.fechamentos_semanais for select to authenticated using (true);
create policy "fech_ins" on public.fechamentos_semanais for insert to authenticated
  with check (public.is_admin(auth.uid()) or public.is_admin_or_gestor(auth.uid()));
create policy "fech_upd" on public.fechamentos_semanais for update to authenticated
  using (public.is_admin_or_gestor(auth.uid()))
  with check (public.is_admin_or_gestor(auth.uid()));

create policy "recibos_select" on public.recibos for select to authenticated using (true);
create policy "recibos_ins" on public.recibos for insert to authenticated
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'));
create policy "recibos_upd" on public.recibos for update to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'));

create policy "recibos_itens_select" on public.recibos_itens for select to authenticated using (true);
create policy "recibos_itens_ins" on public.recibos_itens for insert to authenticated
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'));

create policy "audit_select_admin" on public.auditoria for select to authenticated
  using (public.is_admin(auth.uid()));

-- SEEDS
insert into public.motivos_rejeicao(descricao) values
  ('Horário divergente'),
  ('Cliente incorreto'),
  ('Valor incorreto'),
  ('Extra não autorizada'),
  ('Colaborador incorreto'),
  ('Duplicidade'),
  ('Outros')
on conflict (descricao) do nothing;