-- Fix search_path em todas as funções não-SECURITY DEFINER
alter function public.tg_touch_updated_at() set search_path = public;
alter function public.tg_extras_validate() set search_path = public;
alter function public.tg_extras_conflito() set search_path = public;
alter function public.tg_extras_transicoes() set search_path = public;
alter function public.tg_extras_fechamento() set search_path = public;
alter function public.tg_extras_no_delete() set search_path = public;
alter function public.tg_fech_reabertura() set search_path = public;
alter function public.tg_recibos_validate() set search_path = public;
alter function public.tg_recibos_itens_validate() set search_path = public;
alter function public.tg_recibos_freeze() set search_path = public;
alter function public.tg_recibos_itens_freeze() set search_path = public;
alter function public.normalize_text(text) set search_path = public;
alter function public.semana_ref_de(timestamptz) set search_path = public;
alter function public.proximo_numero_recibo() set search_path = public;