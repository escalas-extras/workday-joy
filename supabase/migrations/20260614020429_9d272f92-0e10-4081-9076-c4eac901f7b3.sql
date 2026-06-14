create or replace function public.semana_ref_de(ts timestamptz)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d date := (ts at time zone 'America/Sao_Paulo')::date;
  dow int := extract(isodow from d)::int;
  diff int;
begin
  -- Semana de referência inicia sempre na quinta-feira.
  diff := (dow - 4 + 7) % 7;
  return d - diff;
end
$$;