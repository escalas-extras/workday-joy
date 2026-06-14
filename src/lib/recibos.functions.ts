import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Normaliza qualquer data para a sexta-feira de referência da semana (igual ao backend semana_ref_de)
function normalizaSemanaRef(input: string): string {
  const [y, m, d] = input.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay(); // ISO: seg=1..dom=7
  const diff = (dow - 5 + 7) % 7; // sexta=5
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

export const gerarRecibosSemana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { semana_ref: string; data_pagamento: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica papel
    const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
    if (!isAdm && !isFin) throw new Error("Sem permissão");

    const semanaRef = normalizaSemanaRef(data.semana_ref);

    // Busca extras elegíveis: aprovado_financeiro + pago, sem recibo ativo
    const { data: extras, error } = await supabase
      .from("extras")
      .select("id, colaborador_id, valor")
      .eq("semana_ref", semanaRef)
      .eq("status", "aprovado_financeiro")
      .eq("situacao_financeira", "pago");
    if (error) throw error;
    if (!extras?.length) return { criados: 0, mensagem: `Nenhum extra elegível para semana ${semanaRef}` };

    // Agrupa por colaborador
    const grupos = new Map<string, { ids: string[]; total: number }>();
    for (const e of extras) {
      const g = grupos.get(e.colaborador_id) ?? { ids: [], total: 0 };
      g.ids.push(e.id);
      g.total += Number(e.valor);
      grupos.set(e.colaborador_id, g);
    }

    let criados = 0;
    const erros: string[] = [];
    for (const [colab, grupo] of grupos) {
      // Verifica se já tem recibo ativo
      const { data: existente } = await supabase.from("recibos").select("id").eq("colaborador_id", colab).eq("semana_ref", semanaRef).eq("ativo", true).maybeSingle();
      if (existente) continue;
      const { data: rec, error: e1 } = await supabase.from("recibos").insert({
        colaborador_id: colab, semana_ref: semanaRef, gerado_por: userId, data_pagamento: data.data_pagamento, valor_total: grupo.total,
      }).select("id").single();
      if (e1) { erros.push(e1.message); continue; }
      // valor_snapshot will be filled by trigger if 0/null? trigger sets to e.valor when null; we pass 0 but trigger checks `is null`. Use null:
      const { error: e2 } = await supabase.from("recibos_itens").insert(grupo.ids.map((extra_id) => ({ recibo_id: rec!.id, extra_id, valor_snapshot: null as any })));
      if (e2) { erros.push(e2.message); continue; }
      criados++;
    }
    return { criados, erros };
  });

export const cancelarRecibo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reciboId: string; motivo: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("recibos").update({
      ativo: false, cancelado_em: new Date().toISOString(), cancelado_por: userId, motivo_cancelamento: data.motivo,
    }).eq("id", data.reciboId);
    if (error) throw error;
    return { ok: true };
  });

export const arquivarRecibos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.ids?.length) return { arquivados: 0 };
    const { error, count } = await supabase
      .from("recibos")
      .update({ arquivado_em: new Date().toISOString(), arquivado_por: userId }, { count: "exact" })
      .in("id", data.ids)
      .is("arquivado_em", null);
    if (error) throw error;
    return { arquivados: count ?? 0 };
  });

export const desarquivarRecibo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reciboId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("recibos")
      .update({ arquivado_em: null, arquivado_por: null })
      .eq("id", data.reciboId);
    if (error) throw error;
    return { ok: true };
  });

