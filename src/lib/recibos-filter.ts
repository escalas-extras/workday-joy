/**
 * Helpers puros para a lógica "Somente extras ainda não recibadas".
 *
 * Regra: uma extra é considerada "já recibada" quando existe pelo menos um
 * registro em `recibos_itens` cujo `recibos.ativo = true`. Recibos inativos
 * (cancelados) NÃO contam — a extra volta a ficar elegível.
 */

export type ReciboItemRow = {
  extra_id: string;
  // shape devolvido pelo PostgREST com `recibos!inner(ativo)`
  recibos?: { ativo: boolean } | { ativo: boolean }[] | null;
};

/**
 * Constrói o Set<extra_id> de extras já vinculadas a um recibo ATIVO.
 * Ignora linhas cujo recibo associado não esteja ativo (defensivo: a query
 * já filtra `recibos.ativo = true`, mas a função é resiliente a payloads
 * malformados).
 */
export function extrairRecibadasSet(rows: ReciboItemRow[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const r of rows ?? []) {
    if (!r?.extra_id) continue;
    const rec = r.recibos;
    const ativo = Array.isArray(rec) ? rec.some((x) => x?.ativo === true) : rec?.ativo === true;
    if (ativo) out.add(r.extra_id);
  }
  return out;
}

/**
 * Aplica o filtro "Somente extras ainda não recibadas". Quando `somenteNaoRecibadas`
 * é false, devolve a lista intacta. Quando true, remove qualquer extra cujo id
 * esteja em `recibadasSet`.
 */
export function filtrarNaoRecibadas<T extends { id: string }>(
  extras: T[],
  recibadasSet: Set<string>,
  somenteNaoRecibadas: boolean,
): T[] {
  if (!somenteNaoRecibadas) return extras;
  return extras.filter((e) => !recibadasSet.has(e.id));
}
