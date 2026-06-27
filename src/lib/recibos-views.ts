import { supabase } from "@/integrations/supabase/client";
import type { ReciboView } from "@/components/recibos/ReciboA4";

export async function loadReciboViews(ids: string[]): Promise<ReciboView[]> {
  if (!ids.length) return [];
  const { data: recs } = await supabase
    .from("recibos")
    .select("id, numero, semana_ref, data_pagamento, valor_total, ativo, colaboradores(nome), pagamentos(referencia, data_pagamento)")
    .in("id", ids);
  const { data: its } = await supabase
    .from("recibos_itens")
    .select("recibo_id, valor_snapshot, extras(data, semana_ref, emitente_id, clientes(nome_fantasia), empresas(nome))")
    .in("recibo_id", ids);
  type Item = { recibo_id: string; valor_snapshot: number; extras?: { data?: string; semana_ref?: string; emitente_id?: string | null; clientes?: { nome_fantasia?: string }; empresas?: { nome?: string } } };
  const items = (its ?? []) as Item[];
  const emitenteIds = Array.from(new Set(items.map((i) => i.extras?.emitente_id).filter(Boolean) as string[]));
  const nomeById: Record<string, string> = {};
  if (emitenteIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", emitenteIds);
    for (const p of (profs ?? []) as { id: string; nome: string }[]) nomeById[p.id] = p.nome;
  }
  const byRec: Record<string, { data: string; semana_ref?: string; cliente: string; empresa?: string; valor: number; lancado_por?: string }[]> = {};
  const emitByRec: Record<string, Set<string>> = {};
  for (const it of items) {
    const nome = it.extras?.emitente_id ? nomeById[it.extras.emitente_id] : null;
    (byRec[it.recibo_id] ||= []).push({
      data: it.extras?.data ?? "",
      semana_ref: it.extras?.semana_ref ?? "",
      cliente: it.extras?.clientes?.nome_fantasia ?? "",
      empresa: it.extras?.empresas?.nome ?? "",
      valor: Number(it.valor_snapshot),
      lancado_por: nome ?? "",
    });
    if (nome) (emitByRec[it.recibo_id] ||= new Set()).add(nome);
  }
  type Rec = {
    id: string; numero: number; semana_ref: string; data_pagamento: string;
    valor_total: number; ativo: boolean;
    colaboradores?: { nome?: string };
    pagamentos?: { referencia?: string | null; data_pagamento?: string } | null;
  };
  return ((recs ?? []) as Rec[])
    .map((r) => ({
      id: r.id,
      numero: r.numero,
      colaborador: r.colaboradores?.nome ?? "",
      semana_ref: r.semana_ref,
      data_pagamento: r.data_pagamento,
      pagamento_referencia: r.pagamentos?.referencia ?? undefined,
      valor_total: Number(r.valor_total),
      ativo: r.ativo,
      itens: (byRec[r.id] ?? []).sort((a, b) => a.data.localeCompare(b.data) || (a.semana_ref ?? "").localeCompare(b.semana_ref ?? "")),
      lancado_por: Array.from(emitByRec[r.id] ?? []).join(", "),
    }))
    .sort((a, b) =>
      a.colaborador.localeCompare(b.colaborador, "pt-BR", { sensitivity: "base" })
      || a.id.localeCompare(b.id),
    );
}
