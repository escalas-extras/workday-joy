import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LinhaLotacao {
  linha: number;
  empresa: string;
  cliente: string;
  colaborador: string;
  matricula: string;
  cpf: string;
  cargo: string;
}

export interface LinhaProcessada extends LinhaLotacao {
  acao: "criar" | "atualizar" | "ignorar" | "erro";
  motivo?: string;
  empresa_nova?: boolean;
  cliente_novo?: boolean;
  funcao_nova?: boolean;
  vinculo_novo?: boolean;
}

export interface PreviewResult {
  linhas: LinhaProcessada[];
  resumo: {
    total: number;
    criar: number;
    atualizar: number;
    erros: number;
    ignorar: number;
    empresas_novas: number;
    clientes_novos: number;
    funcoes_novas: number;
    vinculos_novos: number;
  };
}

const norm = (s?: string) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const limpaCpf = (s?: string) => (s ?? "").toString().replace(/\D/g, "");

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores podem importar lotação");
}

async function processar(linhas: LinhaLotacao[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [emps, funcs, clis, colabs] = await Promise.all([
    supabaseAdmin.from("empresas").select("id,nome"),
    supabaseAdmin.from("funcoes").select("id,nome"),
    supabaseAdmin.from("clientes").select("id,nome_fantasia,cnpj"),
    supabaseAdmin.from("colaboradores").select("id,matricula,nome,empresa_id,funcao_id,cpf"),
  ]);

  const mapEmpresa = new Map<string, { id: string; nome: string }>();
  (emps.data ?? []).forEach((e: any) => mapEmpresa.set(norm(e.nome), e));
  const mapFuncao = new Map<string, { id: string; nome: string }>();
  (funcs.data ?? []).forEach((f: any) => mapFuncao.set(norm(f.nome), f));
  const mapCliente = new Map<string, { id: string; nome_fantasia: string }>();
  (clis.data ?? []).forEach((c: any) => mapCliente.set(norm(c.nome_fantasia), c));
  const mapMatricula = new Map<string, any>();
  (colabs.data ?? []).forEach((c: any) => mapMatricula.set(c.matricula.trim(), c));
  const mapCpf = new Map<string, any>();
  (colabs.data ?? []).forEach((c: any) => { if (c.cpf) mapCpf.set(limpaCpf(c.cpf), c); });

  const { data: vincs } = await supabaseAdmin.from("colaborador_clientes").select("colaborador_id,cliente_id");
  const setVinc = new Set<string>((vincs ?? []).map((v: any) => `${v.colaborador_id}|${v.cliente_id}`));

  const novasEmpresas = new Set<string>();
  const novosClientes = new Set<string>();
  const novasFuncoes = new Set<string>();
  const matriculasPlanilha = new Set<string>();
  const cpfsPlanilha = new Map<string, string>(); // cpf -> matricula
  const resultado: LinhaProcessada[] = [];

  for (const r of linhas) {
    const empresa = (r.empresa ?? "").toString().trim();
    const cliente = (r.cliente ?? "").toString().trim();
    const colaborador = (r.colaborador ?? "").toString().trim();
    const matricula = (r.matricula ?? "").toString().trim();
    const cpf = limpaCpf(r.cpf);
    const cargo = (r.cargo ?? "").toString().trim();

    const base: LinhaProcessada = { ...r, empresa, cliente, colaborador, matricula, cpf, cargo, acao: "erro" };

    const faltam: string[] = [];
    if (!empresa) faltam.push("Empresa");
    if (!cliente) faltam.push("Cliente");
    if (!colaborador) faltam.push("Colaborador");
    if (!matricula) faltam.push("Matrícula");
    if (!cargo) faltam.push("Cargo");
    if (faltam.length) { resultado.push({ ...base, acao: "erro", motivo: `Campos obrigatórios: ${faltam.join(", ")}` }); continue; }

    if (matriculasPlanilha.has(matricula)) {
      resultado.push({ ...base, acao: "erro", motivo: "Matrícula duplicada na planilha" });
      continue;
    }
    matriculasPlanilha.add(matricula);

    if (cpf) {
      const outraMat = cpfsPlanilha.get(cpf);
      if (outraMat && outraMat !== matricula) {
        resultado.push({ ...base, acao: "erro", motivo: `CPF duplicado na planilha (também em ${outraMat})` });
        continue;
      }
      cpfsPlanilha.set(cpf, matricula);
      const existeCpf = mapCpf.get(cpf);
      if (existeCpf && existeCpf.matricula !== matricula) {
        resultado.push({ ...base, acao: "erro", motivo: `CPF já cadastrado para matrícula ${existeCpf.matricula}` });
        continue;
      }
    }

    const keyEmp = norm(empresa);
    const keyCli = norm(cliente);
    const keyFun = norm(cargo);
    const empresa_nova = !mapEmpresa.has(keyEmp);
    const cliente_novo = !mapCliente.has(keyCli);
    const funcao_nova = !mapFuncao.has(keyFun);
    if (empresa_nova) novasEmpresas.add(keyEmp);
    if (cliente_novo) novosClientes.add(keyCli);
    if (funcao_nova) novasFuncoes.add(keyFun);

    const existente = mapMatricula.get(matricula);
    let acao: LinhaProcessada["acao"] = existente ? "atualizar" : "criar";
    let vinculo_novo = true;
    if (existente && !empresa_nova && !cliente_novo && !funcao_nova) {
      const empId = mapEmpresa.get(keyEmp)!.id;
      const funId = mapFuncao.get(keyFun)!.id;
      const cliId = mapCliente.get(keyCli)!.id;
      const mudou =
        existente.nome.trim() !== colaborador ||
        existente.empresa_id !== empId ||
        existente.funcao_id !== funId ||
        (cpf && limpaCpf(existente.cpf ?? "") !== cpf);
      vinculo_novo = !setVinc.has(`${existente.id}|${cliId}`);
      if (!mudou && !vinculo_novo) acao = "ignorar";
    }

    resultado.push({ ...base, acao, empresa_nova, cliente_novo, funcao_nova, vinculo_novo });
  }

  const resumo = {
    total: linhas.length,
    criar: resultado.filter((r) => r.acao === "criar").length,
    atualizar: resultado.filter((r) => r.acao === "atualizar").length,
    erros: resultado.filter((r) => r.acao === "erro").length,
    ignorar: resultado.filter((r) => r.acao === "ignorar").length,
    empresas_novas: novasEmpresas.size,
    clientes_novos: novosClientes.size,
    funcoes_novas: novasFuncoes.size,
    vinculos_novos: resultado.filter((r) => r.vinculo_novo && r.acao !== "erro").length,
  };

  return { linhas: resultado, resumo, maps: { mapEmpresa, mapFuncao, mapCliente, mapMatricula, setVinc } };
}

export const previewImportacaoLotacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { linhas: LinhaLotacao[] }) => d)
  .handler(async ({ data, context }): Promise<PreviewResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { linhas, resumo } = await processar(data.linhas);
    return { linhas, resumo };
  });

export const executarImportacaoLotacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { linhas: LinhaLotacao[]; arquivo_nome?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { linhas, resumo, maps } = await processar(data.linhas);
    const { mapEmpresa, mapFuncao, mapCliente, mapMatricula, setVinc } = maps;

    // 1. Criar empresas/funções/clientes inexistentes
    const novasEmps = [...new Set(linhas.filter((r) => r.empresa_nova && r.acao !== "erro").map((r) => r.empresa.trim()))];
    if (novasEmps.length) {
      const { data: ins } = await supabaseAdmin.from("empresas").insert(novasEmps.map((nome) => ({ nome }))).select("id,nome");
      (ins ?? []).forEach((e: any) => mapEmpresa.set(norm(e.nome), e));
    }
    const novasFuns = [...new Set(linhas.filter((r) => r.funcao_nova && r.acao !== "erro").map((r) => r.cargo.trim()))];
    if (novasFuns.length) {
      const { data: ins } = await supabaseAdmin.from("funcoes").insert(novasFuns.map((nome) => ({ nome }))).select("id,nome");
      (ins ?? []).forEach((f: any) => mapFuncao.set(norm(f.nome), f));
    }
    const novosClis = [...new Set(linhas.filter((r) => r.cliente_novo && r.acao !== "erro").map((r) => r.cliente.trim()))];
    if (novosClis.length) {
      const { data: ins } = await supabaseAdmin
        .from("clientes")
        .insert(novosClis.map((nome) => ({ nome_fantasia: nome, razao_social: nome })))
        .select("id,nome_fantasia");
      (ins ?? []).forEach((c: any) => mapCliente.set(norm(c.nome_fantasia), c));
    }

    let criadas = 0, atualizadas = 0, ignoradas = 0, erros = 0;
    const errosLinhas: { linha: number; matricula: string; motivo: string }[] = [];

    // 2. Colaboradores + vínculos
    for (const r of linhas) {
      if (r.acao === "erro") {
        erros++;
        errosLinhas.push({ linha: r.linha, matricula: r.matricula, motivo: r.motivo ?? "" });
        continue;
      }
      const empId = mapEmpresa.get(norm(r.empresa))!.id;
      const funId = mapFuncao.get(norm(r.cargo))!.id;
      const cliId = mapCliente.get(norm(r.cliente))!.id;
      const existente = mapMatricula.get(r.matricula);

      try {
        if (!existente) {
          const { data: novo, error } = await supabaseAdmin
            .from("colaboradores")
            .insert({ matricula: r.matricula, nome: r.colaborador, empresa_id: empId, funcao_id: funId, cpf: r.cpf || null })
            .select("id")
            .single();
          if (error) throw error;
          mapMatricula.set(r.matricula, { ...novo, matricula: r.matricula });
          criadas++;
        } else {
          const patch: any = {};
          if (existente.nome.trim() !== r.colaborador) patch.nome = r.colaborador;
          if (existente.empresa_id !== empId) patch.empresa_id = empId;
          if (existente.funcao_id !== funId) patch.funcao_id = funId;
          if (r.cpf && limpaCpf(existente.cpf ?? "") !== r.cpf) patch.cpf = r.cpf;
          if (Object.keys(patch).length) {
            const { error } = await supabaseAdmin.from("colaboradores").update(patch).eq("id", existente.id);
            if (error) throw error;
            atualizadas++;
          } else if (r.acao === "ignorar") {
            ignoradas++;
          } else {
            atualizadas++;
          }
        }
        const colId = mapMatricula.get(r.matricula).id;
        if (!setVinc.has(`${colId}|${cliId}`)) {
          await supabaseAdmin.from("colaborador_clientes").insert({ colaborador_id: colId, cliente_id: cliId }).then(() => {});
          setVinc.add(`${colId}|${cliId}`);
        }
      } catch (e: any) {
        erros++;
        errosLinhas.push({ linha: r.linha, matricula: r.matricula, motivo: e?.message ?? String(e) });
      }
    }

    const resumoFinal = {
      ...resumo,
      criadas,
      atualizadas,
      ignoradas,
      erros,
      erros_detalhe: errosLinhas.slice(0, 200),
    };

    // 3. Registrar importação
    const { data: imp } = await supabaseAdmin
      .from("importacoes_lotacao")
      .insert({
        usuario_id: context.userId,
        arquivo_nome: data.arquivo_nome ?? null,
        total_linhas: linhas.length,
        criadas,
        atualizadas,
        ignoradas,
        erros,
        resumo: resumoFinal,
      })
      .select("id")
      .single();

    // 4. Auditoria
    await supabaseAdmin.from("auditoria").insert({
      tabela: "importacoes_lotacao",
      registro_id: imp?.id ?? null,
      usuario_id: context.userId,
      acao: "INSERT",
      valor_novo: JSON.stringify({ arquivo_nome: data.arquivo_nome, total: linhas.length, criadas, atualizadas, erros }),
      justificativa: `Importação de lotação: ${data.arquivo_nome ?? "(sem nome)"}`,
    });

    return resumoFinal;
  });
