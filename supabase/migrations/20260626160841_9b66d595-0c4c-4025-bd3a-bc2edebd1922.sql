-- Exclui recibos ativos cujos itens incluem extras duplicadas (mesmo colaborador+data)
WITH dups AS (
  SELECT e.colaborador_id, e.data
  FROM public.extras e
  WHERE e.status = 'aprovado_financeiro' AND e.situacao_financeira = 'pago'
  GROUP BY e.colaborador_id, e.data
  HAVING COUNT(*) > 1
),
alvos AS (
  SELECT DISTINCT r.id
  FROM dups d
  JOIN public.extras e ON e.colaborador_id = d.colaborador_id AND e.data = d.data
  JOIN public.recibos_itens ri ON ri.extra_id = e.id
  JOIN public.recibos r ON r.id = ri.recibo_id
  WHERE r.ativo = true
)
DELETE FROM public.recibos_itens WHERE recibo_id IN (SELECT id FROM alvos);

WITH dups AS (
  SELECT e.colaborador_id, e.data
  FROM public.extras e
  WHERE e.status = 'aprovado_financeiro' AND e.situacao_financeira = 'pago'
  GROUP BY e.colaborador_id, e.data
  HAVING COUNT(*) > 1
),
alvos AS (
  SELECT DISTINCT r.id
  FROM dups d
  JOIN public.extras e ON e.colaborador_id = d.colaborador_id AND e.data = d.data
  JOIN public.recibos_itens ri ON ri.extra_id = e.id
  JOIN public.recibos r ON r.id = ri.recibo_id
  WHERE r.ativo = true
)
DELETE FROM public.recibos WHERE id IN (SELECT id FROM alvos);