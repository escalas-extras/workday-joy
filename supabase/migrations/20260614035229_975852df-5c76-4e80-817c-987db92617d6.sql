
-- Validação: aborta se não houver admin ativo
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.user_roles WHERE role = 'admin';
  IF n < 1 THEN RAISE EXCEPTION 'Abortado: nenhum administrador ativo'; END IF;
END $$;

-- TRUNCATE ignora triggers row-level (tg_extras_no_delete, tg_recibos_itens_freeze)
TRUNCATE TABLE
  public.recibos_itens,
  public.recibos,
  public.extras,
  public.fechamentos_semanais,
  public.importacoes_lotacao,
  public.auditoria
RESTART IDENTITY CASCADE;

-- Reinicia numerador de recibos
ALTER SEQUENCE public.recibos_numero_seq RESTART WITH 1;
