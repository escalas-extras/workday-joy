import type { ReciboItemRow } from "@/lib/recibos-filter";
import type { ExtraFluxoReciboInfo } from "@/lib/extra-fluxo";

type ReciboFluxoRow = ReciboItemRow & {
  recibos?: { ativo: boolean; arquivado_em: string | null } | { ativo: boolean; arquivado_em: string | null }[] | null;
};

/** Mapa extra_id → estado de recibo (ativo + arquivado), a partir de linhas de recibos_itens. */
export function mapReciboFluxoPorExtra(rows: ReciboFluxoRow[] | null | undefined): Record<string, ExtraFluxoReciboInfo> {
  const out: Record<string, ExtraFluxoReciboInfo> = {};
  for (const row of rows ?? []) {
    if (!row?.extra_id) continue;
    const rec = row.recibos;
    const recibo = Array.isArray(rec) ? rec.find((x) => x?.ativo === true) : rec?.ativo === true ? rec : null;
    if (!recibo?.ativo) continue;
    const arquivada = !!recibo.arquivado_em;
    const prev = out[row.extra_id];
    out[row.extra_id] = {
      reciboEmitido: true,
      arquivada: prev?.arquivada || arquivada,
    };
  }
  return out;
}
