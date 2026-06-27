import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PagamentoStatus = "EM_PREPARACAO" | "GERADO" | "FECHADO" | "CANCELADO";

const gerandoEmAndamento = new Set<string>();

async function assertFinanceiro(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isFin } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_financeiro" });
  if (!isAdm && !isFin) throw new Error("Sem permissão");
}

type ExtraElegivel = { id: string; colaborador_id: string; semana_ref: string; valor: number; data?: string };

export type PreviewPagamentoGrupo = {
  colaborador_id: string;
  nome: string;
  qtd: number;
  total: number;
  extras: ExtraElegivel[];
};

async function buscarExtrasElegiveis(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  pagamentoId: string,
): Promise<ExtraElegivel[]> {
  const { data: extras, error } = await supabase
    .from("extras")
    .select("id, colaborador_id, semana_ref, valor, data, pagamento_id")
    .eq("status", "aprovado_financeiro")
    .eq("situacao_financeira", "pago");
  if (error) throw new Error(`Falha ao buscar extras elegíveis: ${error.message}`);
  if (!extras?.length) return [];

  const rows = extras as (ExtraElegivel & { pagamento_id: string | null })[];
  const candidatas = rows.filter((e) => e.pagamento_id == null || e.pagamento_id === pagamentoId);
  if (!candidatas.length) return [];

  const recibadasSet = new Set<string>();
  const lote = 500;
  for (let i = 0; i < candidatas.length; i += lote) {
    const slice = candidatas.slice(i, i + lote).map((e) => e.id);
    const { data: ja, error: e0 } = await supabase
      .from("recibos_itens")
      .select("extra_id, recibos!inner(ativo)")
      .in("extra_id", slice)
      .eq("recibos.ativo", true);
    if (e0) throw new Error(`Falha ao verificar extras já recibadas: ${e0.message}`);
    for (const r of ja ?? []) recibadasSet.add(r.extra_id as string);
  }

  return candidatas.filter((e) => !recibadasSet.has(e.id));
}

function minSemanaRef(extras: ExtraElegivel[]): string {
  return extras.reduce((min, e) => (e.semana_ref < min ? e.semana_ref : min), extras[0].semana_ref);
}

/** Cria pagamento manualmente (EM_PREPARACAO). Não gera recibos. */
export const criarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    data_pagamento: string;
    referencia?: string;
    periodo_de?: string;
    periodo_ate?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);

    const { data: id, error } = await supabase.rpc("criar_pagamento", {
      p_data_pagamento: data.data_pagamento,
      p_referencia: data.referencia,
      p_periodo_de: data.periodo_de,
      p_periodo_ate: data.periodo_ate,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const fecharPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);
    const { error } = await supabase.rpc("fechar_pagamento", { p_id: data.pagamento_id });
    if (error) throw error;
    return { ok: true };
  });

export const reabrirPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string; motivo: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);
    const { error } = await supabase.rpc("reabrir_pagamento", {
      p_id: data.pagamento_id,
      p_motivo: data.motivo,
    });
    if (error) throw error;
    return { ok: true };
  });

async function executarGeracaoRecibos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  pagamentoId: string,
) {
    const { data: pag, error: ePag } = await supabase
      .from("pagamentos")
      .select("id, status, data_pagamento")
      .eq("id", pagamentoId)
      .single();
    if (ePag || !pag) throw new Error("Pagamento não encontrado");

    const status = pag.status as PagamentoStatus;
    if (status === "FECHADO" || status === "CANCELADO") {
      throw new Error(`Pagamento ${status} — não é possível gerar recibos`);
    }

    const elegiveis = await buscarExtrasElegiveis(supabase, pagamentoId);
    if (!elegiveis.length) {
      return {
        criados: 0,
        anexados: 0,
        emAndamento: 0,
        erros: [] as string[],
        mensagem: "Nenhuma extra elegível pendente de recibo neste pagamento",
      };
    }

    const grupos = new Map<string, ExtraElegivel[]>();
    for (const e of elegiveis) {
      const g = grupos.get(e.colaborador_id) ?? [];
      g.push(e);
      grupos.set(e.colaborador_id, g);
    }

    let criados = 0;
    let anexados = 0;
    let emAndamento = 0;
    const erros: string[] = [];

    for (const [colabId, extrasColab] of grupos) {
      const lockKey = `${pagamentoId}|${colabId}`;
      if (gerandoEmAndamento.has(lockKey)) { emAndamento++; continue; }
      gerandoEmAndamento.add(lockKey);
      try {
        const { data: existente, error: eExist } = await supabase
          .from("recibos")
          .select("id")
          .eq("colaborador_id", colabId)
          .eq("pagamento_id", pagamentoId)
          .eq("ativo", true)
          .maybeSingle();
        if (eExist) { erros.push(`Falha ao verificar recibo (${colabId}): ${eExist.message}`); continue; }

        const extraIds = extrasColab.map((e) => e.id);
        let reciboId: string;

        if (existente) {
          const { error: eUp } = await supabase
            .from("recibos_itens")
            .upsert(
              extraIds.map((extra_id) => ({
                recibo_id: existente.id,
                extra_id,
                valor_snapshot: null as unknown as number,
              })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (eUp) { erros.push(`Falha ao anexar itens (${colabId}): ${eUp.message}`); continue; }
          reciboId = existente.id;
          anexados++;
        } else {
          const semanaRef = minSemanaRef(extrasColab);
          const { data: rec, error: e1 } = await supabase.from("recibos").insert({
            colaborador_id: colabId,
            pagamento_id: pagamentoId,
            semana_ref: semanaRef,
            gerado_por: userId,
            data_pagamento: pag.data_pagamento,
            valor_total: 0,
          }).select("id").single();
          if (e1) { erros.push(`Falha ao criar recibo (${colabId}): ${e1.message}`); continue; }

          const { error: e2 } = await supabase
            .from("recibos_itens")
            .upsert(
              extraIds.map((extra_id) => ({
                recibo_id: rec!.id,
                extra_id,
                valor_snapshot: null as unknown as number,
              })),
              { onConflict: "recibo_id,extra_id", ignoreDuplicates: true },
            );
          if (e2) { erros.push(`Falha ao inserir itens (${colabId}): ${e2.message}`); continue; }
          reciboId = rec!.id;
          criados++;
        }

        const { error: eExtra } = await supabase
          .from("extras")
          .update({ pagamento_id: pagamentoId })
          .in("id", extraIds);
        if (eExtra) erros.push(`Falha ao vincular extras ao pagamento (${colabId}): ${eExtra.message}`);

        const { error: eRecalc } = await supabase.rpc("recalc_recibo_valor_total", { p_recibo_id: reciboId });
        if (eRecalc) erros.push(`Falha ao recalcular total (${colabId}): ${eRecalc.message}`);
      } finally {
        gerandoEmAndamento.delete(lockKey);
      }
    }

    if (criados > 0 || anexados > 0) {
      await supabase
        .from("pagamentos")
        .update({ status: "GERADO", gerado_em: new Date().toISOString() })
        .eq("id", pagamentoId)
        .in("status", ["EM_PREPARACAO", "GERADO"]);
    }

    return { criados, anexados, emAndamento, erros };
}

/** Gera ou complementa recibos de um pagamento existente (1 recibo/colaborador). */
export const gerarRecibosPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);
    return executarGeracaoRecibos(supabase, userId, data.pagamento_id);
  });

/** @deprecated Use gerarRecibosPagamento. Mantido para compatibilidade de import. */
export const gerarRecibosSemana = gerarRecibosPagamento;

/** @deprecated Use gerarRecibosPagamento. */
export const gerarRecibosPendentes = gerarRecibosPagamento;

export const auditarInconsistencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);

    const { data, error } = await supabase
      .from("recibos_itens")
      .select("extra_id, recibos!inner(id,numero,semana_ref,colaborador_id,ativo,pagamento_id,colaboradores(nome)), extras!inner(id,data,status,situacao_financeira,valor,semana_ref)")
      .eq("recibos.ativo", true);
    if (error) throw new Error(error.message);

    type Row = {
      extra_id: string;
      recibos: {
        id: string; numero: number; semana_ref: string; colaborador_id: string;
        ativo: boolean; pagamento_id: string;
        colaboradores: { nome: string } | null;
      };
      extras: { id: string; data: string; status: string; situacao_financeira: string | null; valor: number; semana_ref: string };
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

/** Prévia read-only das extras elegíveis para um pagamento. */
export const previewExtrasPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFinanceiro(supabase, userId);

    const elegiveis = await buscarExtrasElegiveis(supabase, data.pagamento_id);
    if (!elegiveis.length) return { grupos: [] as PreviewPagamentoGrupo[] };

    const { data: nomes } = await supabase
      .from("colaboradores")
      .select("id, nome")
      .in("id", [...new Set(elegiveis.map((e) => e.colaborador_id))]);

    const nomeMap = new Map((nomes ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]));

    const grupos = new Map<string, { colaborador_id: string; nome: string; qtd: number; total: number; extras: ExtraElegivel[] }>();
    for (const e of elegiveis) {
      const g = grupos.get(e.colaborador_id) ?? {
        colaborador_id: e.colaborador_id,
        nome: nomeMap.get(e.colaborador_id) ?? "—",
        qtd: 0,
        total: 0,
        extras: [],
      };
      g.qtd++;
      g.total += Number(e.valor);
      g.extras.push(e);
      grupos.set(e.colaborador_id, g);
    }

    return {
      grupos: [...grupos.values()]
        .map((g) => ({
          ...g,
          extras: g.extras.sort((a, b) => a.semana_ref.localeCompare(b.semana_ref) || a.id.localeCompare(b.id)),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })),
    };
  });
