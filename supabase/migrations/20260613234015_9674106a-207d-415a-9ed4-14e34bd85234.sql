
ALTER TABLE public.fechamentos_semanais
  DROP CONSTRAINT fechamentos_semanais_fechado_por_fkey,
  ADD CONSTRAINT fechamentos_semanais_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT fechamentos_semanais_reaberto_por_fkey,
  ADD CONSTRAINT fechamentos_semanais_reaberto_por_fkey FOREIGN KEY (reaberto_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT fechamentos_semanais_encerrado_financeiro_por_fkey,
  ADD CONSTRAINT fechamentos_semanais_encerrado_financeiro_por_fkey FOREIGN KEY (encerrado_financeiro_por) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.extras
  DROP CONSTRAINT extras_emitente_id_fkey,
  ADD CONSTRAINT extras_emitente_id_fkey FOREIGN KEY (emitente_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_aprovado_operacional_por_fkey,
  ADD CONSTRAINT extras_aprovado_operacional_por_fkey FOREIGN KEY (aprovado_operacional_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_aprovado_financeiro_por_fkey,
  ADD CONSTRAINT extras_aprovado_financeiro_por_fkey FOREIGN KEY (aprovado_financeiro_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_pago_por_fkey,
  ADD CONSTRAINT extras_pago_por_fkey FOREIGN KEY (pago_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_faturado_por_fkey,
  ADD CONSTRAINT extras_faturado_por_fkey FOREIGN KEY (faturado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_cancelado_por_fkey,
  ADD CONSTRAINT extras_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_created_by_fkey,
  ADD CONSTRAINT extras_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT extras_updated_by_fkey,
  ADD CONSTRAINT extras_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.recibos
  DROP CONSTRAINT recibos_gerado_por_fkey,
  ADD CONSTRAINT recibos_gerado_por_fkey FOREIGN KEY (gerado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT recibos_cancelado_por_fkey,
  ADD CONSTRAINT recibos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT recibos_arquivado_por_fkey,
  ADD CONSTRAINT recibos_arquivado_por_fkey FOREIGN KEY (arquivado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
