import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===== Listagens base =====
export const listAlmoxBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cats, itens, empresas] = await Promise.all([
      supabase.from("almox_categorias").select("id,nome,tipo_tamanho,ordem").order("ordem"),
      supabase.from("almox_itens").select("id,nome,categoria_id,ativo").eq("ativo", true).order("nome"),
      supabase.from("empresas").select("id,nome").eq("situacao", "ativo").order("nome"),
    ]);
    return {
      categorias: cats.data ?? [],
      itens: itens.data ?? [],
      empresas: empresas.data ?? [],
    };
  });

// ===== Estoque =====
export const listEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { empresa_id?: string | null; abaixoMinimo?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("almox_estoque")
      .select("id, empresa_id, item_id, tamanho, quantidade_atual, quantidade_minima, ativo, empresas(nome), almox_itens(nome, categoria_id, almox_categorias(nome, tipo_tamanho))");
    if (data.empresa_id) q = q.eq("empresa_id", data.empresa_id);
    const { data: rows, error } = await q.order("updated_at", { ascending: false });
    if (error) throw error;
    let list = (rows ?? []) as unknown as Array<{
      id: string; empresa_id: string; item_id: string; tamanho: string | null;
      quantidade_atual: number; quantidade_minima: number; ativo: boolean;
      empresas: { nome: string } | null;
      almox_itens: { nome: string; categoria_id: string; almox_categorias: { nome: string; tipo_tamanho: string } | null } | null;
    }>;
    if (data.abaixoMinimo) {
      list = list.filter((r) => r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima);
    }
    return list;
  });

export const upsertEstoqueMinimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { empresa_id: string; item_id: string; tamanho: string | null; quantidade_minima: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase.from("almox_estoque").select("id")
      .eq("empresa_id", data.empresa_id).eq("item_id", data.item_id)
      .eq("tamanho", data.tamanho ?? "").maybeSingle();
    if (existing) {
      const { error } = await supabase.from("almox_estoque")
        .update({ quantidade_minima: data.quantidade_minima }).eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id };
    }
    const { data: ins, error } = await supabase.from("almox_estoque")
      .insert({ empresa_id: data.empresa_id, item_id: data.item_id, tamanho: data.tamanho, quantidade_minima: data.quantidade_minima })
      .select("id").single();
    if (error) throw error;
    return { id: ins.id };
  });

// ===== Movimentação genérica (entrada/saída) =====
export const registrarMovimentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    empresa_id: string; item_id: string; tamanho: string | null;
    tipo: "entrada" | "saida"; motivo: string; quantidade: number;
    colaborador_id?: string | null; observacao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("almox_registrar_movimentacao", {
      p_empresa_id: data.empresa_id,
      p_item_id: data.item_id,
      p_tamanho: data.tamanho,
      p_tipo: data.tipo,
      p_motivo: data.motivo,
      p_quantidade: data.quantidade,
      p_colaborador_id: data.colaborador_id ?? null,
      p_entrega_id: null,
      p_observacao: data.observacao ?? null,
    });
    if (error) throw error;
    return { id };
  });

// ===== Listagem de movimentações =====
export const listMovimentacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { empresa_id?: string | null; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("almox_movimentacoes")
      .select("id, created_at, tipo, motivo, quantidade, tamanho, observacao, empresas(nome), almox_itens(nome), colaboradores(nome)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.empresa_id) q = q.eq("empresa_id", data.empresa_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ===== Entrega a colaborador =====
export const entregarItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    colaborador_id: string; empresa_id: string; item_id: string;
    tamanho: string | null; quantidade: number; observacao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // 1) cria entrega
    const { data: ent, error: eErr } = await supabase.from("almox_entregas")
      .insert({
        colaborador_id: data.colaborador_id, empresa_id: data.empresa_id,
        item_id: data.item_id, tamanho: data.tamanho, quantidade: data.quantidade,
        responsavel_id: userId, observacao: data.observacao,
      }).select("id").single();
    if (eErr) throw eErr;
    // 2) movimento de saída
    const { error: mErr } = await supabase.rpc("almox_registrar_movimentacao", {
      p_empresa_id: data.empresa_id, p_item_id: data.item_id, p_tamanho: data.tamanho,
      p_tipo: "saida", p_motivo: "entrega_colaborador", p_quantidade: data.quantidade,
      p_colaborador_id: data.colaborador_id, p_entrega_id: ent.id,
      p_observacao: data.observacao ?? null,
    });
    if (mErr) {
      // rollback entrega
      await supabase.from("almox_entregas").delete().eq("id", ent.id);
      throw mErr;
    }
    return { id: ent.id };
  });

// ===== Devolução =====
export const devolverItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    entrega_id: string; quantidade: number;
    condicao: "novo" | "bom" | "regular" | "danificado" | "inservivel" | "perda_justificada";
    observacao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ent, error: gErr } = await supabase.from("almox_entregas")
      .select("id, empresa_id, item_id, tamanho, quantidade, quantidade_devolvida, status")
      .eq("id", data.entrega_id).single();
    if (gErr) throw gErr;
    const restante = ent.quantidade - ent.quantidade_devolvida;
    if (data.quantidade > restante) throw new Error("Quantidade maior que pendente");
    const retorna = !["danificado", "inservivel", "perda_justificada"].includes(data.condicao);
    // 1) registra devolução
    const { error: dErr } = await supabase.from("almox_devolucoes").insert({
      entrega_id: ent.id, quantidade: data.quantidade, condicao: data.condicao,
      retorna_estoque: retorna, responsavel_id: userId, observacao: data.observacao,
    });
    if (dErr) throw dErr;
    // 2) movimentação de entrada se retornar
    if (retorna) {
      await supabase.rpc("almox_registrar_movimentacao", {
        p_empresa_id: ent.empresa_id, p_item_id: ent.item_id, p_tamanho: ent.tamanho,
        p_tipo: "entrada", p_motivo: "devolucao", p_quantidade: data.quantidade,
        p_colaborador_id: null, p_entrega_id: ent.id,
        p_observacao: `Devolução (${data.condicao})`,
      });
    }
    // 3) atualiza entrega
    const novoQtd = ent.quantidade_devolvida + data.quantidade;
    const novoStatus = novoQtd >= ent.quantidade
      ? (data.condicao === "perda_justificada" ? "perda_justificada" : "devolvido_total")
      : "devolvido_parcial";
    await supabase.from("almox_entregas").update({
      quantidade_devolvida: novoQtd, status: novoStatus,
    }).eq("id", ent.id);
    return { ok: true };
  });

// ===== Pendências e entregas do colaborador =====
export const listEntregasColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { colaborador_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("almox_entregas")
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, observacao, almox_itens(nome), empresas(nome)")
      .eq("colaborador_id", data.colaborador_id)
      .order("data_entrega", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listPendenciasDevolucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.from("almox_entregas")
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, colaboradores(nome, cpf), almox_itens(nome), empresas(nome)")
      .in("status", ["em_uso", "devolvido_parcial"])
      .order("data_entrega", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });
