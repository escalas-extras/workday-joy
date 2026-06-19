
DROP POLICY IF EXISTS "audit insert" ON public.audit_trail;
CREATE POLICY "audit_trail_insert_self" ON public.audit_trail
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "print_log insert" ON public.disciplinary_print_log;
CREATE POLICY "print_log_insert_self" ON public.disciplinary_print_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
