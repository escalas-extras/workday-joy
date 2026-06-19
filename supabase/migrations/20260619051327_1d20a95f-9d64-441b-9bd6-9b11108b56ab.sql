
-- C1: user_roles — restringir SELECT (usuário vê só os próprios; admin vê todos)
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- C2: revogar EXECUTE de anon/PUBLIC em funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.almox_registrar_movimentacao(uuid, text, text, text, integer, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_recidivism_counts(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_fech_gera_snapshot() FROM PUBLIC, anon;
-- garante que usuários autenticados continuam tendo acesso onde aplicável
GRANT EXECUTE ON FUNCTION public.almox_registrar_movimentacao(uuid, text, text, text, integer, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recidivism_counts(uuid, uuid) TO authenticated;
-- tg_fech_gera_snapshot é função-trigger; não precisa ser executável por roles do cliente
