
CREATE POLICY "disc evid read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'disciplinary-evidences' AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(),'gestor_operacional')
      OR public.has_role(auth.uid(),'gestor_financeiro')
      OR public.has_role(auth.uid(),'supervisor')
    )
  );

CREATE POLICY "disc evid write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'disciplinary-evidences' AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(),'gestor_operacional')
      OR public.has_role(auth.uid(),'supervisor')
    )
  );

CREATE POLICY "disc evid delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'disciplinary-evidences' AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(),'gestor_operacional')
      OR public.has_role(auth.uid(),'supervisor')
    )
  );
