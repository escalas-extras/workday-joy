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
      p_tamanho: data.tamanho ?? undefined,
      p_tipo: data.tipo,
      p_motivo: data.motivo,
      p_quantidade: data.quantidade,
      p_colaborador_id: data.colaborador_id ?? undefined,
      p_entrega_id: undefined,
      p_observacao: data.observacao ?? undefined,
    } as never);
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
      p_empresa_id: data.empresa_id, p_item_id: data.item_id, p_tamanho: data.tamanho ?? undefined,
      p_tipo: "saida", p_motivo: "entrega_colaborador", p_quantidade: data.quantidade,
      p_colaborador_id: data.colaborador_id, p_entrega_id: ent.id,
      p_observacao: data.observacao ?? undefined,
    } as never);
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
        p_empresa_id: ent.empresa_id, p_item_id: ent.item_id, p_tamanho: ent.tamanho ?? undefined,
        p_tipo: "entrada", p_motivo: "devolucao", p_quantidade: data.quantidade,
        p_colaborador_id: undefined, p_entrega_id: ent.id,
        p_observacao: `Devolução (${data.condicao})`,
      } as never);
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

// ===== Importação de estoque via planilha =====
export interface ImportEstoqueRow {
  empresa: string;
  item: string;
  tamanho?: string | null;
  quantidade_atual?: number | null;
  quantidade_minima?: number | null;
}

export const importarEstoqueExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: ImportEstoqueRow[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isGestor } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_operacional" });
    if (!isAdmin && !isGestor) throw new Error("Sem permissão para importar estoque.");

    const [{ data: empresas }, { data: itens }] = await Promise.all([
      supabase.from("empresas").select("id,nome"),
      supabase.from("almox_itens").select("id,nome").eq("ativo", true),
    ]);
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const empMap = new Map((empresas ?? []).map((e) => [norm(e.nome), e.id]));
    const itemMap = new Map((itens ?? []).map((i) => [norm(i.nome), i.id]));

    const errors: { linha: number; motivo: string }[] = [];
    let ok = 0;
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2; // header
      try {
        if (!r.empresa || !r.item) { errors.push({ linha, motivo: "Empresa ou item vazios" }); continue; }
        const empresa_id = empMap.get(norm(r.empresa));
        const item_id = itemMap.get(norm(r.item));
        if (!empresa_id) { errors.push({ linha, motivo: `Empresa "${r.empresa}" não encontrada` }); continue; }
        if (!item_id) { errors.push({ linha, motivo: `Item "${r.item}" não encontrado` }); continue; }
        const tamanho = r.tamanho?.toString().trim() || null;
        const qtdAtual = Number(r.quantidade_atual ?? 0);
        const qtdMin = r.quantidade_minima != null ? Number(r.quantidade_minima) : null;
        if (!Number.isFinite(qtdAtual) || qtdAtual < 0) { errors.push({ linha, motivo: "Quantidade inválida" }); continue; }

        // estoque atual
        const { data: existing } = await supabase.from("almox_estoque")
          .select("id, quantidade_atual, quantidade_minima")
          .eq("empresa_id", empresa_id).eq("item_id", item_id)
          .eq("tamanho", tamanho ?? "").maybeSingle();
        const atualAgora = existing?.quantidade_atual ?? 0;
        const delta = qtdAtual - atualAgora;
        if (delta !== 0) {
          const { error: mErr } = await supabase.rpc("almox_registrar_movimentacao", {
            p_empresa_id: empresa_id, p_item_id: item_id, p_tamanho: tamanho ?? undefined,
            p_tipo: delta > 0 ? "entrada" : "saida",
            p_motivo: delta > 0 ? "ajuste_entrada" : "ajuste_saida",
            p_quantidade: Math.abs(delta),
            p_colaborador_id: undefined, p_entrega_id: undefined,
            p_observacao: "Importação inicial via planilha",
          } as never);
          if (mErr) { errors.push({ linha, motivo: mErr.message }); continue; }
        } else if (!existing) {
          // cria linha zerada para registrar o mínimo
          await supabase.from("almox_estoque").insert({ empresa_id, item_id, tamanho });
        }
        if (qtdMin != null && Number.isFinite(qtdMin) && qtdMin >= 0) {
          await supabase.from("almox_estoque").update({ quantidade_minima: qtdMin })
            .eq("empresa_id", empresa_id).eq("item_id", item_id).eq("tamanho", tamanho ?? "");
        }
        ok++;
      } catch (e) {
        errors.push({ linha, motivo: (e as Error).message });
      }
    }
    return { ok, total: data.rows.length, errors };
  });

// ===== Desligamento integrado com almoxarifado =====
export const verificarPendenciasColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { colaborador_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("almox_entregas")
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, almox_itens(nome), empresas(nome)")
      .eq("colaborador_id", data.colaborador_id)
      .in("status", ["em_uso", "devolvido_parcial"])
      .order("data_entrega", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const desligarColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { colaborador_id: string; justificativa: string; forcar?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.justificativa || data.justificativa.trim().length < 5)
      throw new Error("Informe uma justificativa de desligamento (mínimo 5 caracteres).");
    const { data: pend, error: pErr } = await supabase.from("almox_entregas")
      .select("id, quantidade, quantidade_devolvida, almox_itens(nome)")
      .eq("colaborador_id", data.colaborador_id)
      .in("status", ["em_uso", "devolvido_parcial"]);
    if (pErr) throw pErr;
    const pendentes = pend ?? [];
    if (pendentes.length > 0 && !data.forcar) {
      return { ok: false, pendencias: pendentes };
    }
    const { error: uErr } = await supabase.from("colaboradores")
      .update({ situacao: "inativo" }).eq("id", data.colaborador_id);
    if (uErr) throw uErr;
    // trilha simples na tabela auditoria
    await supabase.from("auditoria").insert({
      acao: "desligamento_colaborador",
      tabela: "colaboradores",
      registro_id: data.colaborador_id,
      usuario_id: userId,
      justificativa: data.justificativa.trim(),
      valor_novo: `pendencias=${pendentes.length}; forcado=${!!data.forcar}`,
    } as never);
    return { ok: true, pendencias: pendentes };
  });
