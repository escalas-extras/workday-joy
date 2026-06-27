import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizarValorMonetario } from "@/lib/valor-monetario";

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

async function assertEmissorRecibos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data: isAdm } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isOp } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_operacional" });
  // Papéis separados: gestor_financeiro libera pagamento, não emite recibo (salvo se também for admin/op).
  if (!isAdm && !isOp) throw new Error("Sem permissão para emitir recibos");
}

async function criarPagamentoAutomatico(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const dataPagamento = new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const { data, error } = await supabase
    .from("pagamentos")
    .insert({
      referencia: `Emissão ${ts}`,
      data_pagamento: dataPagamento,
      status: "EM_PREPARACAO",
      criado_por: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar pagamento interno: ${error.message}`);
  if (!data?.id) throw new Error("Pagamento criado sem id retornado");
  const pagamentoId = data.id as string;
  console.info("[recibos-debug] criarPagamentoAutomatico pagamentoId=", pagamentoId);
  return pagamentoId;
}

/** Pagamento aberto mais recente (EM_PREPARACAO tem prioridade sobre GERADO). */
async function obterPagamentoAbertoReutilizavel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data: prep, error: ePrep } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("status", "EM_PREPARACAO")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ePrep) throw new Error(`Falha ao buscar pagamento aberto: ${ePrep.message}`);
  if (prep?.id) return prep.id as string;

  const { data: gerado, error: eGer } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("status", "GERADO")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eGer) throw new Error(`Falha ao buscar pagamento aberto: ${eGer.message}`);
  return gerado?.id ? (gerado.id as string) : null;
}

async function resolverOuCriarPagamentoAberto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const existente = await obterPagamentoAbertoReutilizavel(supabase);
  if (existente) {
    console.info("[recibos-debug] resolverOuCriarPagamentoAberto pagamentoId=", existente);
    return existente;
  }
  const pagamentoId = await criarPagamentoAutomatico(supabase, userId);
  console.info("[recibos-debug] resolverOuCriarPagamentoAberto pagamentoId=", pagamentoId);
  return pagamentoId;
}

/**
 * Libera extras com pagamento_id apontando para pagamento aberto mas sem item em recibo ativo.
 * Evita extras "presas" após falhas parciais ou lotes descartados.
 */
async function sanearExtrasOrfasPagamentoAberto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  pagamentoId: string,
): Promise<number> {
  const { data: pag, error: ePag } = await supabase
    .from("pagamentos")
    .select("status")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (ePag) throw new Error(`Falha ao verificar pagamento: ${ePag.message}`);
  if (!pag || (pag.status !== "EM_PREPARACAO" && pag.status !== "GERADO")) return 0;

  const { data: extras, error: e1 } = await supabase
    .from("extras")
    .select("id")
    .eq("pagamento_id", pagamentoId);
  if (e1) throw new Error(`Falha ao listar extras do pagamento: ${e1.message}`);
  if (!extras?.length) return 0;

  const ids = (extras as { id: string }[]).map((e) => e.id);
  const recibadas = new Set<string>();
  const lote = 500;
  for (let i = 0; i < ids.length; i += lote) {
    const slice = ids.slice(i, i + lote);
    const { data: ja, error: e0 } = await supabase
      .from("recibos_itens")
      .select("extra_id, recibos!inner(ativo)")
      .in("extra_id", slice)
      .eq("recibos.ativo", true);
    if (e0) throw new Error(`Falha ao verificar extras órfãs: ${e0.message}`);
    for (const r of ja ?? []) recibadas.add(r.extra_id as string);
  }

  const orfas = ids.filter((id) => !recibadas.has(id));
  if (!orfas.length) return 0;

  const { error: e2 } = await supabase
    .from("extras")
    .update({ pagamento_id: null })
    .in("id", orfas);
  if (e2) throw new Error(`Falha ao liberar extras órfãs: ${e2.message}`);
  return orfas.length;
}

async function sanearExtrasOrfasPagamentosAbertos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number> {
  const { data: abertos, error } = await supabase
    .from("pagamentos")
    .select("id")
    .in("status", ["EM_PREPARACAO", "GERADO"]);
  if (error) throw new Error(`Falha ao listar pagamentos abertos: ${error.message}`);
  let total = 0;
  for (const p of abertos ?? []) {
    total += await sanearExtrasOrfasPagamentoAberto(supabase, p.id as string);
  }
  return total;
}

async function extrasVinculadasAoRecibo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  reciboId: string,
  extraIds: string[],
): Promise<string[]> {
  if (!extraIds.length) return [];
  const { data, error } = await supabase
    .from("recibos_itens")
    .select("extra_id")
    .eq("recibo_id", reciboId)
    .in("extra_id", extraIds);
  if (error) throw new Error(`Falha ao confirmar itens do recibo: ${error.message}`);
  return (data ?? []).map((r: { extra_id: string }) => r.extra_id);
}

/** Escritas de emissão/arquivamento via service role após assertEmissorRecibos (RLS exige financeiro). */
async function supabaseEmissorDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
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

  return candidatas
    .filter((e) => !recibadasSet.has(e.id))
    .map((e) => ({ ...e, valor: normalizarValorMonetario(e.valor) }));
}

function minSemanaRef(extras: ExtraElegivel[]): string {
  return extras.reduce((min, e) => (e.semana_ref < min ? e.semana_ref : min), extras[0].semana_ref);
}

export type GeracaoRecibosResult = {
  criados: number;
  anexados: number;
  emAndamento: number;
  erros: string[];
  reciboIds: string[];
  reciboIdsCriados: string[];
  reciboIdsComplementados: string[];
  pagamentoId?: string;
  mensagem?: string;
};

function resultadoGeracaoVazio(mensagem?: string): GeracaoRecibosResult {
  return {
    criados: 0,
    anexados: 0,
    emAndamento: 0,
    erros: [],
    reciboIds: [],
    reciboIdsCriados: [],
    reciboIdsComplementados: [],
    ...(mensagem ? { mensagem } : {}),
  };
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
    console.info("[recibos-debug] executarGeracaoRecibos pagamentoId=", pagamentoId);
    if (!pagamentoId) throw new Error("pagamento_id obrigatório para gerar recibos");

    await sanearExtrasOrfasPagamentosAbertos(supabase);

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
      return resultadoGeracaoVazio("Nenhuma extra elegível pendente de recibo neste pagamento");
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
    const reciboIdsCriados: string[] = [];
    const reciboIdsComplementados: string[] = [];

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
        const foiComplemento = !!existente;

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
        } else {
          const semanaRef = minSemanaRef(extrasColab);
          const payload = {
            colaborador_id: colabId,
            pagamento_id: pagamentoId,
            semana_ref: semanaRef,
            gerado_por: userId,
            data_pagamento: pag.data_pagamento,
            valor_total: 0,
          };
          console.info("[recibos-debug] payload.insert=", JSON.stringify(payload));
          const { data: rec, error: e1 } = await supabase.from("recibos").insert(payload).select("id").single();
          console.info("[recibos-debug] rec.data=", JSON.stringify(rec));
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
        }

        const extraIdsVinculados = await extrasVinculadasAoRecibo(supabase, reciboId, extraIds);
        if (!extraIdsVinculados.length) {
          erros.push(`Nenhuma extra vinculada ao recibo (${colabId}) — pagamento_id não atualizado`);
          continue;
        }

        const { error: eExtra } = await supabase
          .from("extras")
          .update({ pagamento_id: pagamentoId })
          .in("id", extraIdsVinculados);
        if (eExtra) {
          erros.push(`Falha ao vincular extras ao pagamento (${colabId}): ${eExtra.message}`);
          continue;
        }

        const { error: eRecalc } = await supabase.rpc("recalc_recibo_valor_total", { p_recibo_id: reciboId });
        if (eRecalc) {
          erros.push(`Falha ao recalcular total (${colabId}): ${eRecalc.message}`);
          continue;
        }

        if (foiComplemento) {
          anexados++;
          reciboIdsComplementados.push(reciboId);
        } else {
          criados++;
          reciboIdsCriados.push(reciboId);
        }
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

    const reciboIdsCriadosUnicos = [...new Set(reciboIdsCriados)];
    const reciboIdsComplementadosUnicos = [...new Set(reciboIdsComplementados)];
    const reciboIds = [...new Set([...reciboIdsCriadosUnicos, ...reciboIdsComplementadosUnicos])];

    return {
      criados,
      anexados,
      emAndamento,
      erros,
      reciboIds,
      reciboIdsCriados: reciboIdsCriadosUnicos,
      reciboIdsComplementados: reciboIdsComplementadosUnicos,
    };
}

/** Gera ou complementa recibos de um pagamento existente (1 recibo/colaborador). */
export const gerarRecibosPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEmissorRecibos(supabase, userId);
    const db = await supabaseEmissorDb();
    return executarGeracaoRecibos(db, userId, data.pagamento_id);
  });

/** Cria pagamento interno e gera recibos das extras pendentes (sem seleção manual). */
export const gerarRecibosPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertEmissorRecibos(supabase, userId);
    const db = await supabaseEmissorDb();
    const pagamentoId = await resolverOuCriarPagamentoAberto(db, userId);
    const result = await executarGeracaoRecibos(db, userId, pagamentoId);
    return { ...result, pagamentoId };
  });

/** @deprecated Use gerarRecibosPendentes. Mantido para compatibilidade de import. */
export const gerarRecibosSemana = gerarRecibosPendentes;

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
    await assertEmissorRecibos(supabase, userId);
    if (!data.ids?.length) return { arquivados: 0 };
    const db = await supabaseEmissorDb();
    const { error, count } = await db
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

/** Prévia read-only das extras elegíveis pendentes de recibo (novo pagamento). */
export const previewExtrasPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertEmissorRecibos(supabase, userId);

    const db = await supabaseEmissorDb();
    await sanearExtrasOrfasPagamentosAbertos(db);
    const pagamentoAberto = await obterPagamentoAbertoReutilizavel(db);
    const pagamentoId = pagamentoAberto ?? crypto.randomUUID();
    const elegiveis = await buscarExtrasElegiveis(supabase, pagamentoId);
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
      g.total += e.valor;
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

/** Prévia read-only das extras elegíveis para um pagamento. */
export const previewExtrasPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pagamento_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEmissorRecibos(supabase, userId);

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
      g.total += e.valor;
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
