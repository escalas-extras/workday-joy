CREATE OR REPLACE FUNCTION public.tg_extras_coberto_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF new.situacao_servico IN ('cobertura_ferias','cobertura_atestado','cobertura_folga','reciclagem','falta') THEN
    IF new.colaborador_coberto_id IS NULL THEN
      RAISE EXCEPTION 'colaborador_coberto_id é obrigatório para Cobertura/Reciclagem/Falta';
    END IF;
    IF new.colaborador_coberto_id = new.colaborador_id THEN
      RAISE EXCEPTION 'Colaborador coberto não pode ser o mesmo que executa o extra';
    END IF;
  ELSE
    new.colaborador_coberto_id := NULL;
  END IF;
  RETURN new;
END $function$;