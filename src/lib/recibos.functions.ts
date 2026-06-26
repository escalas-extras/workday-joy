import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lock em memória do worker para evitar geração paralela do mesmo (colab|semana)
const gerandoEmAndamento = new Set<string>();

// Normaliza qualquer data para a sexta-feira de referência da semana (igual ao backend semana_ref_de)
function normalizaSemanaRef(input: string): string {
  const [y, m, d] = input.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay(); // ISO: seg=1..dom=7
  const diff = (dow - 5 + 7) % 7; // sexta=5
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

// Recalcula valor_total de um recibo somando o `valor` real das extras associadas.
async function recomputeValorTotal(
  supabase: { from: (t: string) => any },
  reciboId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("recibos_itens")
    .select("extras!inner(valor)")
    .eq("recibo_id", reciboId);
  if (error) throw error;
  type Row = { extras: { valor: number | string } | { valor: number | string }[] };
  const total = ((data ?? []) as Row[]).reduce((s, r) => {
    const ex = Array.isArray(r.extras) ? r.extras[0] : r.extras;
    return s + Number(ex?.valor ?? 0);
  }, 0);
  await supabase.from("recibos").update({ valor_total: total }).eq("id", reciboId);
  return total;
}

// Gera recibos de extras elegíveis dentro de um período (DATA DO SERVIÇO — extras.data).
// Agrupa por (colaborador_id, semana_ref) mantendo a semana original de cada extra.
// Idempotente: se já existe recibo ativo para (colab, semana_ref), anexa apenas os
// itens faltantes (ON CONFLICT DO NOTHING via upsert ignoreDuplicates) e recalcula
// o valor_total a partir da soma real dos itens. NUNCA exclui recibo existente.
// Aceita { de, ate } (data do serviço) ou { semana_ref } (retrocompat — semana inteira sex→qui).
export const gerarRecibosSemana = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de?: string; ate?: string; semana_ref?: string; data_pagamento: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
    if (!isAdm && !isFin) throw new Error("Sem permissão para gerar recibos");

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
    if (!de || !ate) throw new Error("Informe o período (de/ate) — data do serviço");

    // Filtra pela DATA DO SERVIÇO (extras.data — coluna date, sem fuso horário).
    const { data: extras, error } = await supabase
      .from("extras")
      .select("id, colaborador_id, semana_ref, valor, data")
      .gte("data", de)
      .lte("data", ate)
      .eq("status", "aprovado_financeiro")
      .eq("situacao_financeira", "pago");
    if (error) throw new Error(`Falha ao buscar extras elegíveis: ${error.message}`);
    if (!extras?.length) return { criados: 0, anexados: 0, emAndamento: 0, erros: [] as string[], mensagem: `Nenhuma extra aprovada/paga com data entre ${de} e ${ate}` };

    // Anti-join: extras já vinculadas a algum recibo ATIVO ficam de fora
    const extraIds = extras.map((e) => e.id);
    const recibadasSet = new Set<string>();
    const lote = 500;
    for (let i = 0; i < extraIds.length; i += lote) {
      const slice = extraIds.slice(i, i + lote);
      const { data: ja, error: e0 } = await supabase
        .from("recibos_itens")
        .select("extra_id, recibos!inner(ativo)")
        .in("extra_id", slice)
        .eq("recibos.ativo", true);
      if (e0) throw new Error(`Falha ao verificar extras já recibadas: ${e0.message}`);
      for (const r of ja ?? []) recibadasSet.add(r.extra_id);
    }
    const elegiveis = extras.filter((e) => !recibadasSet.has(e.id));
    if (!elegiveis.length) return { criados: 0, anexados: 0, emAndamento: 0, erros: [] as string[], mensagem: "Todas as extras do período já estão em recibos ativos" };

    // Agrupa por (colaborador_id, semana_ref) — preserva semana original (data trabalhada)
    const grupos = new Map<string, { colab: string; semana: string; ids: string[]; total: number }>();
    for (const e of elegiveis) {
      const key = `${e.colaborador_id}|${e.semana_ref}`;
      const g = grupos.get(key) ?? { colab: e.colaborador_id, semana: e.semana_ref, ids: [], total: 0 };
      g.ids.push(e.id);
      g.total += Number(e.valor);
      grupos.set(key, g);
    }

    let criados = 0;
    let anexados = 0;
    let emAndamento = 0;
    const erros: string[] = [];
    for (const grupo of grupos.values()) {
      const lockKey = `${grupo.colab}|${grupo.semana}`;
      if (gerandoEmAndamento.has(lockKey)) { emAndamento++; continue; }
      gerandoEmAndamento.add(lockKey);
      try {
        // Procura recibo ATIVO existente para (colab, semana). NUNCA exclui.
        const { data: existente, error: eExist } = await supabase
          .from("recibos").select("id")
          .eq("colaborador_id", grupo.colab).eq("semana_ref", grupo.semana).eq("ativo", true).maybeSingle();
        if (eExist) { erros.push(`Falha ao verificar recibo existente (${grupo.semana}): ${eExist.message}`); continue; }

        let reciboId: string;
        if (existente) {
          // Anexa apenas itens faltantes (ON CONFLICT DO NOTHING via upsert)
          const { error: eUp } = await supabase
            .from("recibos_itens")
            .upsert(
              grupo.ids.map((extra_id) => ({ recibo_id: existente.id, extra_id, valor_snapshot: null as unknown as number })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (eUp) { erros.push(`Falha ao anexar itens ao recibo (${grupo.semana}): ${eUp.message}`); continue; }
          reciboId = existente.id;
          anexados++;
        } else {
          const { data: rec, error: e1 } = await supabase.from("recibos").insert({
            colaborador_id: grupo.colab, semana_ref: grupo.semana, gerado_por: userId,
            data_pagamento: data.data_pagamento, valor_total: grupo.total,
          }).select("id").single();
          if (e1) { erros.push(`Falha ao criar recibo (${grupo.semana}): ${e1.message}`); continue; }
          const { error: e2 } = await supabase
            .from("recibos_itens")
            .upsert(
              grupo.ids.map((extra_id) => ({ recibo_id: rec!.id, extra_id, valor_snapshot: null as unknown as number })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (e2) { erros.push(`Falha ao inserir itens do recibo (${grupo.semana}): ${e2.message}`); continue; }
          reciboId = rec!.id;
          criados++;
        }
        // Recalcula valor_total pela soma real dos itens
        try { await recomputeValorTotal(supabase, reciboId); }
        catch (e) { erros.push(`Falha ao recalcular total (${grupo.semana}): ${(e as Error).message}`); }
      } finally {
        gerandoEmAndamento.delete(lockKey);
      }
    }
    return { criados, anexados, emAndamento, erros };
  });

// Gera recibos para TODAS as extras elegíveis (aprovado_financeiro + pago) que
// ainda não estejam vinculadas a um recibo ATIVO, independentemente da data
// de lançamento. Agrupa por (colaborador_id, semana_ref). Idempotente.
export const gerarRecibosPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { data_pagamento: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
    if (!isAdm && !isFin) throw new Error("Sem permissão para gerar recibos");

    const { data: extras, error } = await supabase
      .from("extras")
      .select("id, colaborador_id, semana_ref, valor")
      .eq("status", "aprovado_financeiro")
      .eq("situacao_financeira", "pago");
    if (error) throw new Error(`Falha ao buscar extras: ${error.message}`);
    if (!extras?.length) return { criados: 0, anexados: 0, emAndamento: 0, erros: [] as string[], mensagem: "Nenhuma extra elegível" };

    const extraIds = extras.map((e) => e.id);
    const recibadasSet = new Set<string>();
    const lote = 500;
    for (let i = 0; i < extraIds.length; i += lote) {
      const slice = extraIds.slice(i, i + lote);
      const { data: ja, error: e0 } = await supabase
        .from("recibos_itens")
        .select("extra_id, recibos!inner(ativo)")
        .in("extra_id", slice)
        .eq("recibos.ativo", true);
      if (e0) throw new Error(`Falha ao verificar extras já recibadas: ${e0.message}`);
      for (const r of ja ?? []) recibadasSet.add(r.extra_id);
    }
    const elegiveis = extras.filter((e) => !recibadasSet.has(e.id));
    if (!elegiveis.length) return { criados: 0, anexados: 0, emAndamento: 0, erros: [] as string[], mensagem: "Nenhuma extra pendente de recibo" };

    const grupos = new Map<string, { colab: string; semana: string; ids: string[]; total: number }>();
    for (const e of elegiveis) {
      const key = `${e.colaborador_id}|${e.semana_ref}`;
      const g = grupos.get(key) ?? { colab: e.colaborador_id, semana: e.semana_ref, ids: [], total: 0 };
      g.ids.push(e.id);
      g.total += Number(e.valor);
      grupos.set(key, g);
    }

    let criados = 0;
    let anexados = 0;
    let emAndamento = 0;
    const erros: string[] = [];
    for (const grupo of grupos.values()) {
      const lockKey = `${grupo.colab}|${grupo.semana}`;
      if (gerandoEmAndamento.has(lockKey)) { emAndamento++; continue; }
      gerandoEmAndamento.add(lockKey);
      try {
        const { data: existente, error: eExist } = await supabase
          .from("recibos").select("id")
          .eq("colaborador_id", grupo.colab).eq("semana_ref", grupo.semana).eq("ativo", true).maybeSingle();
        if (eExist) { erros.push(`Falha ao verificar recibo existente (${grupo.semana}): ${eExist.message}`); continue; }

        let reciboId: string;
        if (existente) {
          const { error: e2 } = await supabase
            .from("recibos_itens")
            .upsert(
              grupo.ids.map((extra_id) => ({ recibo_id: existente.id, extra_id, valor_snapshot: null as unknown as number })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (e2) { erros.push(`Falha ao anexar itens (${grupo.semana}): ${e2.message}`); continue; }
          reciboId = existente.id;
          anexados++;
        } else {
          const { data: rec, error: e1 } = await supabase.from("recibos").insert({
            colaborador_id: grupo.colab, semana_ref: grupo.semana, gerado_por: userId,
            data_pagamento: data.data_pagamento, valor_total: grupo.total,
          }).select("id").single();
          if (e1) { erros.push(`Falha ao criar recibo (${grupo.semana}): ${e1.message}`); continue; }
          const { error: e2 } = await supabase
            .from("recibos_itens")
            .upsert(
              grupo.ids.map((extra_id) => ({ recibo_id: rec!.id, extra_id, valor_snapshot: null as unknown as number })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (e2) { erros.push(`Falha ao inserir itens (${grupo.semana}): ${e2.message}`); continue; }
          reciboId = rec!.id;
          criados++;
        }
        try { await recomputeValorTotal(supabase, reciboId); }
        catch (e) { erros.push(`Falha ao recalcular total (${grupo.semana}): ${(e as Error).message}`); }
      } finally {
        gerandoEmAndamento.delete(lockKey);
      }
    }
    return { criados, anexados, emAndamento, erros };
  });

// Relatório read-only de inconsistências: extras vinculadas a recibos ATIVOS
// mas cujo status/situacao_financeira deixou de ser "aprovado_financeiro/pago".
// NÃO altera dado nenhum. Útil para auditoria humana.
export const auditarInconsistencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
    if (!isAdm && !isFin) throw new Error("Sem permissão");

    const { data, error } = await supabase
      .from("recibos_itens")
      .select("extra_id, recibos!inner(id,numero,semana_ref,colaborador_id,ativo,colaboradores(nome)), extras!inner(id,data,status,situacao_financeira,valor)")
      .eq("recibos.ativo", true);
    if (error) throw new Error(error.message);

    type Row = {
      extra_id: string;
      recibos: { id: string; numero: number; semana_ref: string; colaborador_id: string; ativo: boolean; colaboradores: { nome: string } | null };
      extras: { id: string; data: string; status: string; situacao_financeira: string | null; valor: number };
    };
    const inconsistencias = ((data ?? []) as unknown as Row[])
      .filter((r) => r.extras.status !== "aprovado_financeiro" || r.extras.situacao_financeira !== "pago")
      .map((r) => ({
        recibo_id: r.recibos.id,
        recibo_numero: r.recibos.numero,
        colaborador: r.recibos.colaboradores?.nome ?? "—",
        semana_ref: r.recibos.semana_ref,
        extra_id: r.extra_id,
        extra_data: r.extras.data,
        extra_status: r.extras.status,
        extra_situacao: r.extras.situacao_financeira ?? "—",
        valor: Number(r.extras.valor),
      }));
    return { total: inconsistencias.length, inconsistencias };
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
