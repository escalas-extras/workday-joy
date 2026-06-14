SET LOCAL session_replication_role = 'replica';
DELETE FROM public.fechamentos_semanais WHERE id = 'a067ce4c-2d7c-4c06-b414-69412a60c0a8';
UPDATE public.extras SET semana_ref = public.semana_ref_de(semana_ref) WHERE semana_ref IS NOT NULL AND semana_ref <> public.semana_ref_de(semana_ref);
UPDATE public.recibos SET semana_ref = public.semana_ref_de(semana_ref) WHERE semana_ref <> public.semana_ref_de(semana_ref);
UPDATE public.fechamentos_semanais SET semana_ref = public.semana_ref_de(semana_ref) WHERE semana_ref <> public.semana_ref_de(semana_ref);
SET LOCAL session_replication_role = 'origin';