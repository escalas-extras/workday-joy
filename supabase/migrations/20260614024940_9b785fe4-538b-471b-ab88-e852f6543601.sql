-- Empresa AVULSO (default para colaboradores avulsos)
INSERT INTO public.empresas (nome, situacao)
SELECT 'AVULSO', 'ativo'::entity_status
WHERE NOT EXISTS (SELECT 1 FROM public.empresas WHERE nome = 'AVULSO');

-- Permitir supervisor inserir colaboradores (avulsos)
DROP POLICY IF EXISTS "colaboradores_supervisor_ins" ON public.colaboradores;
CREATE POLICY "colaboradores_supervisor_ins" ON public.colaboradores
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'supervisor'));