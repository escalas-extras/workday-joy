import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===== Listagens base =====
export const listAlmoxBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [cats, itens] = await Promise.all([
      supabase.from("almox_categorias").select("id,nome,tipo_tamanho,ordem").order("ordem"),
      supabase.from("almox_itens").select("id,nome,categoria_id,ativo").eq("ativo", true).order("nome"),
    ]);
    return {
      categorias: cats.data ?? [],
      itens: itens.data ?? [],
    };
  });

// ===== Estoque =====
export const listEstoque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { abaixoMinimo?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("almox_estoque")
      .select("id, item_id, tamanho, quantidade_atual, quantidade_minima, ativo, almox_itens(nome, categoria_id, almox_categorias(nome, tipo_tamanho))")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    let list = (rows ?? []) as unknown as Array<{
      id: string; item_id: string; tamanho: string;
      quantidade_atual: number; quantidade_minima: number; ativo: boolean;
      almox_itens: { nome: string; categoria_id: string; almox_categorias: { nome: string; tipo_tamanho: string } | null } | null;
    }>;
    if (data.abaixoMinimo) {
      list = list.filter((r) => r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima);
    }
    return list;
  });

export const upsertEstoqueMinimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { item_id: string; tamanho: string | null; quantidade_minima: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const tam = data.tamanho ?? "";
    const { data: existing } = await supabase.from("almox_estoque").select("id")
      .eq("item_id", data.item_id).eq("tamanho", tam).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("almox_estoque")
        .update({ quantidade_minima: data.quantidade_minima }).eq("id", existing.id);
      if (error) throw error;
      return { id: existing.id };
    }
    const { data: ins, error } = await supabase.from("almox_estoque")
      .insert({ item_id: data.item_id, tamanho: tam, quantidade_minima: data.quantidade_minima })
      .select("id").single();
    if (error) throw error;
    return { id: ins.id };
  });

// ===== Movimentação (entrada/saída) =====
export const registrarMovimentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    item_id: string; tamanho: string | null;
    tipo: "entrada" | "saida"; motivo: string; quantidade: number;
    colaborador_id?: string | null; observacao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("almox_registrar_movimentacao", {
      p_item_id: data.item_id,
      p_tamanho: data.tamanho ?? "",
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
  .inputValidator((d: { limit?: number; desde?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("almox_movimentacoes")
      .select("id, created_at, tipo, motivo, quantidade, tamanho, observacao, almox_itens(nome), colaboradores(nome)")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 500);
    if (data.desde) q = q.gte("created_at", data.desde);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ===== Entrega a colaborador =====
export const entregarItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    colaborador_id: string; item_id: string;
    tamanho: string | null; quantidade: number; observacao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tam = data.tamanho ?? "";
    const { data: ent, error: eErr } = await supabase.from("almox_entregas")
      .insert({
        colaborador_id: data.colaborador_id,
        item_id: data.item_id, tamanho: tam, quantidade: data.quantidade,
        responsavel_id: userId, observacao: data.observacao,
      } as never).select("id").single();
    if (eErr) throw eErr;
    const { error: mErr } = await supabase.rpc("almox_registrar_movimentacao", {
      p_item_id: data.item_id, p_tamanho: tam,
      p_tipo: "saida", p_motivo: "entrega_colaborador", p_quantidade: data.quantidade,
      p_colaborador_id: data.colaborador_id, p_entrega_id: (ent as { id: string }).id,
      p_observacao: data.observacao ?? undefined,
    } as never);
    if (mErr) {
      await supabase.from("almox_entregas").delete().eq("id", (ent as { id: string }).id);
      throw mErr;
    }
    return { id: (ent as { id: string }).id };
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
      .select("id, item_id, tamanho, quantidade, quantidade_devolvida, status")
      .eq("id", data.entrega_id).single();
    if (gErr) throw gErr;
    const e = ent as unknown as { id: string; item_id: string; tamanho: string; quantidade: number; quantidade_devolvida: number };
    const restante = e.quantidade - e.quantidade_devolvida;
    if (data.quantidade > restante) throw new Error("Quantidade maior que pendente");
    const retorna = !["danificado", "inservivel", "perda_justificada"].includes(data.condicao);
    const { error: dErr } = await supabase.from("almox_devolucoes").insert({
      entrega_id: e.id, quantidade: data.quantidade, condicao: data.condicao,
      retorna_estoque: retorna, responsavel_id: userId, observacao: data.observacao,
    });
    if (dErr) throw dErr;
    if (retorna) {
      await supabase.rpc("almox_registrar_movimentacao", {
        p_item_id: e.item_id, p_tamanho: e.tamanho ?? "",
        p_tipo: "entrada", p_motivo: "devolucao", p_quantidade: data.quantidade,
        p_colaborador_id: undefined, p_entrega_id: e.id,
        p_observacao: `Devolução (${data.condicao})`,
      } as never);
    }
    const novoQtd = e.quantidade_devolvida + data.quantidade;
    const novoStatus = novoQtd >= e.quantidade
      ? (data.condicao === "perda_justificada" ? "perda_justificada" : "devolvido_total")
      : "devolvido_parcial";
    await supabase.from("almox_entregas").update({
      quantidade_devolvida: novoQtd, status: novoStatus,
    }).eq("id", e.id);
    return { ok: true };
  });

// ===== Pendências =====
export const listEntregasColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { colaborador_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("almox_entregas")
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, observacao, almox_itens(nome)")
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
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, colaboradores(nome, cpf), almox_itens(nome)")
      .in("status", ["em_uso", "devolvido_parcial"])
      .order("data_entrega", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

// ===== Importação de ingresso de estoque via planilha =====
export interface ImportEstoqueRow {
  item: string;
  tamanho?: string | null;
  quantidade: number;
  quantidade_minima?: number | null;
}

export const importarEstoqueExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: ImportEstoqueRow[]; modo: "ingresso" | "ajuste" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isGestor } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor_operacional" });
    if (!isAdmin && !isGestor) throw new Error("Sem permissão para importar estoque.");

    const { data: itens } = await supabase.from("almox_itens").select("id,nome").eq("ativo", true);
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const itemMap = new Map((itens ?? []).map((i) => [norm(i.nome), i.id]));

    const errors: { linha: number; motivo: string }[] = [];
    let ok = 0;
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const linha = i + 2;
      try {
        if (!r.item) { errors.push({ linha, motivo: "Item vazio" }); continue; }
        const item_id = itemMap.get(norm(r.item));
        if (!item_id) { errors.push({ linha, motivo: `Item "${r.item}" não encontrado` }); continue; }
        const tamanho = (r.tamanho?.toString().trim() || "");
        const qtd = Number(r.quantidade ?? 0);
        const qtdMin = r.quantidade_minima != null && r.quantidade_minima !== "" as unknown as number ? Number(r.quantidade_minima) : null;
        if (!Number.isFinite(qtd) || qtd < 0) { errors.push({ linha, motivo: "Quantidade inválida" }); continue; }

        if (data.modo === "ingresso") {
          if (qtd > 0) {
            const { error: mErr } = await supabase.rpc("almox_registrar_movimentacao", {
              p_item_id: item_id, p_tamanho: tamanho,
              p_tipo: "entrada", p_motivo: "importacao_planilha",
              p_quantidade: qtd, p_colaborador_id: undefined, p_entrega_id: undefined,
              p_observacao: "Ingresso importado de planilha externa",
            } as never);
            if (mErr) { errors.push({ linha, motivo: mErr.message }); continue; }
          } else {
            // garante linha mesmo com qtd 0
            await supabase.from("almox_estoque")
              .upsert({ item_id, tamanho }, { onConflict: "item_id,tamanho" });
          }
        } else {
          // ajuste: leva o atual para o valor da planilha
          const { data: existing } = await supabase.from("almox_estoque")
            .select("id, quantidade_atual").eq("item_id", item_id).eq("tamanho", tamanho).maybeSingle();
          const atual = existing?.quantidade_atual ?? 0;
          const delta = qtd - atual;
          if (delta !== 0) {
            const { error: mErr } = await supabase.rpc("almox_registrar_movimentacao", {
              p_item_id: item_id, p_tamanho: tamanho,
              p_tipo: delta > 0 ? "entrada" : "saida",
              p_motivo: delta > 0 ? "ajuste_entrada" : "ajuste_saida",
              p_quantidade: Math.abs(delta),
              p_colaborador_id: undefined, p_entrega_id: undefined,
              p_observacao: "Ajuste de saldo via planilha",
            } as never);
            if (mErr) { errors.push({ linha, motivo: mErr.message }); continue; }
          } else if (!existing) {
            await supabase.from("almox_estoque").insert({ item_id, tamanho });
          }
        }

        if (qtdMin != null && Number.isFinite(qtdMin) && qtdMin >= 0) {
          await supabase.from("almox_estoque").update({ quantidade_minima: qtdMin })
            .eq("item_id", item_id).eq("tamanho", tamanho);
        }
        ok++;
      } catch (e) {
        errors.push({ linha, motivo: (e as Error).message });
      }
    }
    return { ok, total: data.rows.length, errors };
  });

// ===== Desligamento integrado =====
export const verificarPendenciasColaborador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { colaborador_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("almox_entregas")
      .select("id, data_entrega, tamanho, quantidade, quantidade_devolvida, status, almox_itens(nome)")
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
