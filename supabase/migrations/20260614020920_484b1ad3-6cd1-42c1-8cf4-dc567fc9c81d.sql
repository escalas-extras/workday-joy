CREATE OR REPLACE FUNCTION public.semana_ref_de(d date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Normaliza qualquer data para a sexta-feira (início da semana de recibos).
  -- A semana vai de sexta a quinta da semana seguinte (7 dias).
  -- ISO dow: seg=1..dom=7; sexta=5
  SELECT (d - ((EXTRACT(ISODOW FROM d)::int - 5 + 7) % 7))::date;
$$;