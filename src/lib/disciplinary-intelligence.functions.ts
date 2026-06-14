import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntelFilters = {
  date_from?: string | null;
  date_to?: string | null;
  empresa_id?: string | null;
  cliente_id?: string | null;
  supervisor_id?: string | null;
  colaborador_id?: string | null;
  reason_id?: string | null;
  action_type?: string | null;
  status?: string | null;
};

const ACT_ORDER: Record<string, number> = {
  orientacao_verbal: 1,
  advertencia_escrita: 2,
  suspensao: 3,
  justa_causa: 4,
};

function suggestNextAction(history: { action_type: string; reason_id?: string | null }[], currentReason?: string | null) {
  const sameReason = currentReason ? history.filter((h) => h.reason_id === currentReason).length : 0;
  const total = history.length;
  const hasSuspension = history.some((h) => h.action_type === "suspensao");
  if (sameReason >= 3 || (hasSuspension && total >= 4)) return { suggested: "processo_disciplinar", label: "Processo Disciplinar", rationale: "Reincidência grave detectada" };
  if (total === 0) return { suggested: "orientacao_verbal", label: "Orientação Verbal", rationale: "Primeira ocorrência" };
  if (total === 1) return { suggested: "advertencia_escrita", label: "Advertência", rationale: "Segunda ocorrência" };
  if (total === 2) return { suggested: "advertencia_escrita", label: "Advertência Formal", rationale: "Terceira ocorrência" };
  if (total >= 3) return { suggested: "suspensao", label: "Suspensão", rationale: "Quarta ocorrência ou mais" };
  return { suggested: "advertencia_escrita", label: "Advertência", rationale: "Padrão" };
}

function classifyRecidivism(d30: number, d90: number, d180: number, d365: number, sameReason: number) {
  // Crítica: 3+ em 180 ou mesmo motivo recorrente
  if (d180 >= 3 || sameReason >= 2 || d30 >= 2) return { level: "critica", label: "Crítica", color: "destructive" };
  if (d90 >= 2 || d180 >= 2) return { level: "alta", label: "Alta", color: "destructive" };
  if (d365 >= 2) return { level: "media", label: "Média", color: "default" };
  if (d365 >= 1) return { level: "baixa", label: "Baixa", color: "secondary" };
  return { level: "nenhuma", label: "Sem reincidência", color: "outline" };
}

export const getDisciplinaryIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: IntelFilters) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Base: medidas (warnings)
    let qw = supabase.from("v_disciplinary_dashboard").select("*").eq("active", true);
    if (data.date_from) qw = qw.gte("warning_date", data.date_from);
    if (data.date_to) qw = qw.lte("warning_date", data.date_to);
    if (data.empresa_id) qw = qw.eq("empresa_id", data.empresa_id);
    if (data.colaborador_id) qw = qw.eq("colaborador_id", data.colaborador_id);
    if (data.action_type) qw = qw.eq("action_type", data.action_type);
    if (data.reason_id) qw = qw.eq("warning_reason_id", data.reason_id);
    if (data.supervisor_id) qw = qw.eq("created_by", data.supervisor_id);
    const { data: rows0 } = await qw.order("warning_date", { ascending: false }).limit(5000);
    let rows = (rows0 ?? []) as Array<Record<string, unknown>>;

    // Filtro cliente/posto: pegar colaboradores vinculados ao cliente
    let clienteEmployees: Set<string> | null = null;
    if (data.cliente_id) {
      const { data: cc } = await supabase.from("colaborador_clientes").select("colaborador_id").eq("cliente_id", data.cliente_id);
      clienteEmployees = new Set((cc ?? []).map((c) => c.colaborador_id as string));
      rows = rows.filter((r) => clienteEmployees!.has(r.colaborador_id as string));
    }

    // Processos
    let qc = supabase.from("disciplinary_cases").select("id, status, employee_id, company_id, opened_at, occurrence_date, description, updated_at").eq("active", true);
    if (data.empresa_id) qc = qc.eq("company_id", data.empresa_id);
    if (data.status) qc = qc.eq("status", data.status);
    if (data.colaborador_id) qc = qc.eq("employee_id", data.colaborador_id);
    if (data.date_from) qc = qc.gte("opened_at", data.date_from);
    if (data.date_to) qc = qc.lte("opened_at", data.date_to);
    const { data: cases0 } = await qc.order("opened_at", { ascending: false }).limit(2000);
    let cases = cases0 ?? [];
    if (clienteEmployees) cases = cases.filter((c) => clienteEmployees!.has(c.employee_id as string));

    // Lookups
    const supervisorIds = Array.from(new Set(rows.map((r) => r.created_by as string).filter(Boolean)));
    const supervisorMap = new Map<string, string>();
    if (supervisorIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", supervisorIds);
      (profs ?? []).forEach((p) => supervisorMap.set(p.id as string, p.nome as string));
    }

    // Totals
    const totals = { orientacao_verbal: 0, advertencia_escrita: 0, suspensao: 0, justa_causa: 0, total: rows.length, processos: cases.length };
    const byMonth = new Map<string, number>();
    const byReason = new Map<string, number>();
    const byCompany = new Map<string, number>();
    const bySupervisor = new Map<string, number>();
    const byCliente = new Map<string, number>();
    const empCount = new Map<string, { nome: string; cpf: string; n: number; last: string }>();
    for (const r of rows) {
      const t = r.action_type as keyof typeof totals;
      if (t in totals) (totals as Record<string, number>)[t]++;
      const m = ((r.mes_ref as string) ?? "").slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
      const rn = (r.reason_nome as string) ?? "Sem motivo";
      byReason.set(rn, (byReason.get(rn) ?? 0) + 1);
      const cn = (r.empresa_nome as string) ?? "—";
      byCompany.set(cn, (byCompany.get(cn) ?? 0) + 1);
      const sv = supervisorMap.get(r.created_by as string) ?? "—";
      bySupervisor.set(sv, (bySupervisor.get(sv) ?? 0) + 1);
      const eid = r.colaborador_id as string;
      const ex = empCount.get(eid);
      if (ex) { ex.n++; if ((r.warning_date as string) > ex.last) ex.last = r.warning_date as string; }
      else empCount.set(eid, { nome: (r.colaborador_nome as string) ?? "—", cpf: (r.cpf as string) ?? "—", n: 1, last: r.warning_date as string });
    }

    // Cliente top: precisa mapear colaboradores -> clientes
    if (rows.length) {
      const empIds = Array.from(new Set(rows.map((r) => r.colaborador_id as string)));
      const { data: cc } = await supabase.from("colaborador_clientes").select("colaborador_id, clientes:cliente_id(id, nome_fantasia)").in("colaborador_id", empIds);
      const empCli = new Map<string, string[]>();
      (cc ?? []).forEach((row) => {
        const cli = row.clientes as { nome_fantasia?: string } | null;
        if (!cli?.nome_fantasia) return;
        const list = empCli.get(row.colaborador_id as string) ?? [];
        list.push(cli.nome_fantasia);
        empCli.set(row.colaborador_id as string, list);
      });
      for (const r of rows) {
        const cls = empCli.get(r.colaborador_id as string) ?? [];
        cls.forEach((cn) => byCliente.set(cn, (byCliente.get(cn) ?? 0) + 1));
      }
    }

    // Rankings
    const ranking = Array.from(empCount.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 50);

    // Timeline agrupada por ano/mês
    const timelineMap = new Map<string, Map<string, Array<Record<string, unknown>>>>();
    for (const r of rows) {
      const dt = (r.warning_date as string) ?? "";
      const year = dt.slice(0, 4);
      const month = dt.slice(0, 7);
      if (!timelineMap.has(year)) timelineMap.set(year, new Map());
      const ym = timelineMap.get(year)!;
      if (!ym.has(month)) ym.set(month, []);
      ym.get(month)!.push({
        id: r.id, action_type: r.action_type, warning_date: r.warning_date,
        reason: r.reason_nome, empresa: r.empresa_nome, colaborador: r.colaborador_nome,
        supervisor: supervisorMap.get(r.created_by as string) ?? "—",
      });
    }
    const timeline = Array.from(timelineMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, months]) => ({
        year,
        total: Array.from(months.values()).reduce((s, a) => s + a.length, 0),
        months: Array.from(months.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([m, items]) => ({ month: m, items })),
      }));

    // Alertas automáticos
    const alerts: Array<{ type: string; severity: "info" | "warning" | "critical"; message: string; entity_id?: string }> = [];
    const today = new Date();
    const days = (d: string | null) => d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : 0;

    for (const [eid, v] of empCount.entries()) {
      const eRows = rows.filter((r) => r.colaborador_id === eid);
      const adv180 = eRows.filter((r) => r.action_type === "advertencia_escrita" && days(r.warning_date as string) <= 180).length;
      const susp365 = eRows.filter((r) => r.action_type === "suspensao" && days(r.warning_date as string) <= 365).length;
      if (adv180 >= 3) alerts.push({ type: "advertencias_180", severity: "critical", message: `${v.nome}: ${adv180} advertências em 180 dias`, entity_id: eid });
      if (susp365 >= 2) alerts.push({ type: "suspensoes_365", severity: "critical", message: `${v.nome}: ${susp365} suspensões em 365 dias`, entity_id: eid });
    }
    for (const c of cases) {
      if (c.status === "arquivado" || c.status === "convertido_justa_causa" || c.status === "aprovado") continue;
      const d = days(c.updated_at as string);
      if (d >= 30) alerts.push({ type: "processo_30", severity: "critical", message: `Processo #${(c.id as string).slice(0, 8)} parado há ${d} dias`, entity_id: c.id as string });
      else if (d >= 15) alerts.push({ type: "processo_15", severity: "warning", message: `Processo #${(c.id as string).slice(0, 8)} parado há ${d} dias`, entity_id: c.id as string });
    }
    // Checklist pendente
    if (cases.length) {
      const caseIds = cases.map((c) => c.id as string);
      const { data: cks } = await supabase.from("equipment_return_checklist").select("case_id, completed").in("case_id", caseIds);
      const ckMap = new Map((cks ?? []).map((c) => [c.case_id as string, c.completed as boolean]));
      for (const c of cases) {
        if (c.status === "convertido_justa_causa" || c.status === "aprovado") {
          const done = ckMap.get(c.id as string);
          if (done === undefined) alerts.push({ type: "checklist_ausente", severity: "warning", message: `Processo #${(c.id as string).slice(0, 8)}: checklist de equipamentos não iniciado`, entity_id: c.id as string });
          else if (!done) alerts.push({ type: "checklist_incompleto", severity: "warning", message: `Processo #${(c.id as string).slice(0, 8)}: checklist de equipamentos incompleto`, entity_id: c.id as string });
        }
      }
    }

    return {
      totals,
      tops: {
        motivos: Array.from(byReason.entries()).map(([k, v]) => ({ label: k, qtd: v })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
        reincidentes: ranking.slice(0, 10),
        clientes: Array.from(byCliente.entries()).map(([k, v]) => ({ label: k, qtd: v })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
        supervisores: Array.from(bySupervisor.entries()).map(([k, v]) => ({ label: k, qtd: v })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
        empresas: Array.from(byCompany.entries()).map(([k, v]) => ({ label: k, qtd: v })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
      },
      byMonth: Array.from(byMonth.entries()).sort().map(([mes, qtd]) => ({ mes, qtd })),
      ranking,
      timeline,
      alerts,
      rows,
      cases,
    };
  });

export const getEmployeeIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employee_id: string; reason_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: warnings } = await supabase
      .from("disciplinary_warnings")
      .select("id, action_type, warning_date, warning_reason_id, conduct_description, active")
      .eq("colaborador_id", data.employee_id)
      .eq("active", true)
      .order("warning_date", { ascending: false });
    const { data: cases } = await supabase
      .from("disciplinary_cases")
      .select("id, status, opened_at, occurrence_date")
      .eq("employee_id", data.employee_id)
      .eq("active", true);

    const list = warnings ?? [];
    const today = new Date();
    const days = (d: string | null) => d ? Math.floor((today.getTime() - new Date(d).getTime()) / 86400000) : 0;
    const counts = { adv: 0, susp: 0, jc: 0, ori: 0 };
    for (const w of list) {
      if (w.action_type === "advertencia_escrita") counts.adv++;
      else if (w.action_type === "suspensao") counts.susp++;
      else if (w.action_type === "justa_causa") counts.jc++;
      else if (w.action_type === "orientacao_verbal") counts.ori++;
    }
    const last = list[0] ?? null;
    const d30 = list.filter((w) => days(w.warning_date) <= 30).length;
    const d90 = list.filter((w) => days(w.warning_date) <= 90).length;
    const d180 = list.filter((w) => days(w.warning_date) <= 180).length;
    const d365 = list.filter((w) => days(w.warning_date) <= 365).length;
    const sameReason = data.reason_id ? list.filter((w) => w.warning_reason_id === data.reason_id).length : 0;
    const recidivism = classifyRecidivism(d30, d90, d180, d365, sameReason);
    const suggestion = suggestNextAction(list.map((w) => ({ action_type: w.action_type as string, reason_id: w.warning_reason_id as string | null })), data.reason_id);

    return {
      counts: { ...counts, total: list.length, processos: (cases ?? []).length },
      lastOccurrence: last ? { date: last.warning_date as string, type: last.action_type as string, daysAgo: days(last.warning_date as string) } : null,
      daysSinceLast: last ? days(last.warning_date as string) : null,
      recidivism,
      suggestion,
      windows: { d30, d90, d180, d365, sameReason },
    };
  });
