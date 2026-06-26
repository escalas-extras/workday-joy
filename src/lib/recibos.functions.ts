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

// Gera recibos de extras elegíveis dentro de um período (data da extra).
// Agrupa por (colaborador_id, semana_ref) mantendo a semana original de cada extra.
// Aceita { de, ate } (novo) ou { semana_ref } (retrocompat — equivale a de=ate=semana).
export const gerarRecibosSemana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de?: string; ate?: string; semana_ref?: string; data_pagamento: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica papel
    const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
    if (!isAdm && !isFin) throw new Error("Sem permissão");

    // Resolve período. Se vier semana_ref (retrocompat), trata como semana inteira (sex→qui).
    let de = data.de ?? "";
    let ate = data.ate ?? "";
    if (!de && !ate && data.semana_ref) {
      const sem = normalizaSemanaRef(data.semana_ref);
      de = sem;
      const [yy, mm, dd] = sem.split("-").map(Number);
      const fim = new Date(Date.UTC(yy, mm - 1, dd + 6));
      ate = fim.toISOString().slice(0, 10);
    }
    if (!de || !ate) throw new Error("Informe o período (de/ate)");

    // Busca extras elegíveis no período de LANÇAMENTO no sistema (created_at)
    const { data: extras, error } = await supabase
      .from("extras")
      .select("id, colaborador_id, semana_ref, valor")
      .gte("created_at", `${de}T00:00:00`)
      .lte("created_at", `${ate}T23:59:59.999`)
      .eq("status", "aprovado_financeiro")
      .eq("situacao_financeira", "pago");
    if (error) throw error;
    if (!extras?.length) return { criados: 0, mensagem: `Nenhum extra lançado entre ${de} e ${ate}` };

    // Anti-join: extras já vinculadas a algum recibo ATIVO ficam de fora
    const extraIds = extras.map((e) => e.id);
    const { data: jaRecibadas, error: e0 } = await supabase
      .from("recibos_itens")
      .select("extra_id, recibos!inner(ativo)")
      .in("extra_id", extraIds)
      .eq("recibos.ativo", true);
    if (e0) throw e0;
    const recibadasSet = new Set((jaRecibadas ?? []).map((r) => r.extra_id));
    const elegiveis = extras.filter((e) => !recibadasSet.has(e.id));
    if (!elegiveis.length) return { criados: 0, mensagem: "Todas as extras do período já foram recibadas" };

    // Agrupa por (colaborador_id, semana_ref) — preserva semana original
    const grupos = new Map<string, { colab: string; semana: string; ids: string[]; total: number }>();
    for (const e of elegiveis) {
      const key = `${e.colaborador_id}|${e.semana_ref}`;
      const g = grupos.get(key) ?? { colab: e.colaborador_id, semana: e.semana_ref, ids: [], total: 0 };
      g.ids.push(e.id);
      g.total += Number(e.valor);
      grupos.set(key, g);
    }

    let criados = 0;
    const erros: string[] = [];
    for (const grupo of grupos.values()) {
      // Recibo ativo já existente para (colab, semana) — pula (mesma constraint do banco)
      const { data: existente } = await supabase
        .from("recibos").select("id")
        .eq("colaborador_id", grupo.colab).eq("semana_ref", grupo.semana).eq("ativo", true).maybeSingle();
      if (existente) { erros.push(`Recibo ativo já existe para colaborador na semana ${grupo.semana}`); continue; }

      const { data: rec, error: e1 } = await supabase.from("recibos").insert({
        colaborador_id: grupo.colab, semana_ref: grupo.semana, gerado_por: userId,
        data_pagamento: data.data_pagamento, valor_total: grupo.total,
      }).select("id").single();
      if (e1) { erros.push(e1.message); continue; }
      const { error: e2 } = await supabase.from("recibos_itens").insert(grupo.ids.map((extra_id) => ({ recibo_id: rec!.id, extra_id, valor_snapshot: null as any })));
      if (e2) { erros.push(e2.message); continue; }
      criados++;
    }
    return { criados, erros };
  });


export const excluirRecibo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reciboId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("excluir_recibo", { p_id: data.reciboId });
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

