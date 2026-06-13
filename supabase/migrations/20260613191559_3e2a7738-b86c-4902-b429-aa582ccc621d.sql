
CREATE TYPE public.classificacao_comercial AS ENUM ('contrato','a_cobrar');

ALTER TABLE public.extras ADD COLUMN classificacao_comercial public.classificacao_comercial;

UPDATE public.extras
   SET classificacao_comercial = CASE
     WHEN situacao_financeira::text = 'a_cobrar' THEN 'a_cobrar'::public.classificacao_comercial
     ELSE 'contrato'::public.classificacao_comercial
   END;

UPDATE public.extras
   SET situacao_financeira = 'pendente_pagamento'
 WHERE situacao_financeira::text = 'a_cobrar';

ALTER TABLE public.extras
  ALTER COLUMN classificacao_comercial SET DEFAULT 'contrato',
  ALTER COLUMN classificacao_comercial SET NOT NULL;

-- Drop trigger que depende da coluna para permitir alteração de tipo
DROP TRIGGER trg_extras_conflito ON public.extras;

ALTER TYPE public.situacao_financeira RENAME TO situacao_financeira_old;
CREATE TYPE public.situacao_financeira AS ENUM ('pendente_pagamento','pago','faturado','cancelado');

ALTER TABLE public.extras
  ALTER COLUMN situacao_financeira DROP DEFAULT,
  ALTER COLUMN situacao_financeira TYPE public.situacao_financeira
    USING (situacao_financeira::text::public.situacao_financeira);

DROP TYPE public.situacao_financeira_old;

-- Recriar trigger
CREATE TRIGGER trg_extras_conflito
  BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_termino, colaborador_id, status, situacao_financeira
  ON public.extras FOR EACH ROW EXECUTE FUNCTION tg_extras_conflito();

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
         and situacao_financeira in ('pago','faturado')
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
end $function$;
