import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const asJson = (v: unknown): Json | null =>
  v == null ? null : (JSON.parse(JSON.stringify(v)) as Json);

type AuditAction =
  | "create" | "update" | "delete" | "deactivate" | "view" | "print"
  | "download" | "reprint" | "approve" | "reject" | "generate_pdf" | "upload";

type PrintEntity = "warning" | "case" | "justa_causa" | "dossie" | "suspensao" | "orientacao" | "advertencia" | "relatorio";
type PrintAction = "view" | "download" | "print" | "reprint";

function captureMeta() {
  let ip = "";
  let ua = "";
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? "";
    if (!ip) ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? "";
    ua = getRequestHeader("user-agent") ?? "";
  } catch { /* no request scope */ }
  return { ip, ua };
}

/** Registra auditoria avançada com IP e User-Agent. */
export const recordAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    action: AuditAction;
    entity_type: string;
    entity_id?: string | null;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string | null;
    company_id?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { ip, ua } = captureMeta();
    const { error } = await supabase.from("audit_trail").insert({
      user_id: userId,
      user_email: (claims as { email?: string } | undefined)?.email ?? null,
      ip_address: ip || null,
      user_agent: ua || null,
      action: data.action,
      entity_type: data.entity_type,
      entity_id: data.entity_id ?? null,
      old_value: asJson(data.old_value),
      new_value: asJson(data.new_value),
      reason: data.reason ?? null,
      company_id: data.company_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Registra ação de impressão/download/visualização de documento disciplinar. */
export const logPrintAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entity_type: PrintEntity; entity_id: string; action: PrintAction }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { ip, ua } = captureMeta();
    const email = (claims as { email?: string } | undefined)?.email ?? null;
    await supabase.from("disciplinary_print_log").insert({
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      action: data.action,
      user_id: userId,
      user_email: email,
      ip_address: ip || null,
      user_agent: ua || null,
    });
    await supabase.from("audit_trail").insert({
      user_id: userId, user_email: email, ip_address: ip || null, user_agent: ua || null,
      action: data.action === "print" || data.action === "reprint" ? "print" : data.action,
      entity_type: data.entity_type, entity_id: data.entity_id,
    });
    return { ok: true };
  });

/** Inativa registro disciplinar (não permite exclusão física). */
export const deactivateDisciplinaryEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    table: "disciplinary_cases" | "disciplinary_case_evidences" | "disciplinary_case_witnesses" | "disciplinary_case_approvals" | "disciplinary_warnings";
    id: string;
    reason: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    if (!data.reason || data.reason.trim().length < 5) {
      throw new Error("Motivo de inativação obrigatório (mín. 5 caracteres).");
    }
    const { data: old } = await supabase.from(data.table).select("*").eq("id", data.id).maybeSingle();
    const { error } = await supabase
      .from(data.table)
      .update({
        active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: userId,
        deactivation_reason: data.reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { ip, ua } = captureMeta();
    await supabase.from("audit_trail").insert({
      user_id: userId,
      user_email: (claims as { email?: string } | undefined)?.email ?? null,
      ip_address: ip || null, user_agent: ua || null,
      action: "deactivate", entity_type: data.table, entity_id: data.id,
      old_value: asJson(old), reason: data.reason,
    });
    return { ok: true };
  });

/** Painel disciplinar consolidado do colaborador. */
export const getEmployeeDisciplinaryPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employee_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: stats } = await supabase
      .from("v_disciplinary_stats_by_employee")
      .select("*")
      .eq("colaborador_id", data.employee_id)
      .maybeSingle();
    const { data: timeline } = await supabase
      .from("disciplinary_warnings")
      .select("id, action_type, warning_date, conduct_description, warning_reason_id, active")
      .eq("colaborador_id", data.employee_id)
      .order("warning_date", { ascending: false })
      .limit(50);
    const { data: cases } = await supabase
      .from("disciplinary_cases")
      .select("id, status, occurrence_date, description, opened_at, active")
      .eq("employee_id", data.employee_id)
      .order("opened_at", { ascending: false })
      .limit(20);
    return { stats, timeline: timeline ?? [], cases: cases ?? [] };
  });

/** Alerta de reincidência: contagens 30/90/180/365 dias. */
export const getRecidivismAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { employee_id: string; reason_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("get_recidivism_counts", {
      _employee_id: data.employee_id,
      _reason_id: data.reason_id ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (result as Record<string, number>) ?? {};
  });

/** Dashboard de relatórios com filtros. */
export const getDashboardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    date_from?: string | null;
    date_to?: string | null;
    empresa_id?: string | null;
    colaborador_id?: string | null;
    action_type?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("v_disciplinary_dashboard").select("*").eq("active", true);
    if (data.date_from) q = q.gte("warning_date", data.date_from);
    if (data.date_to) q = q.lte("warning_date", data.date_to);
    if (data.empresa_id) q = q.eq("empresa_id", data.empresa_id);
    if (data.colaborador_id) q = q.eq("colaborador_id", data.colaborador_id);
    if (data.action_type) q = q.eq("action_type", data.action_type);
    const { data: rows, error } = await q.order("warning_date", { ascending: false }).limit(5000);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const totals = {
      orientacao_verbal: 0, advertencia_escrita: 0, suspensao: 0, justa_causa: 0,
      total: list.length, reincidentes: 0, processos: 0,
    };
    const byMonth = new Map<string, number>();
    const byReason = new Map<string, number>();
    const byCompany = new Map<string, number>();
    const employeeCounts = new Map<string, number>();
    for (const r of list) {
      const t = r.action_type as keyof typeof totals;
      if (t in totals) (totals as Record<string, number>)[t]++;
      const m = (r.mes_ref as string)?.slice(0, 7) ?? "?";
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
      const rn = (r.reason_nome as string) ?? "Sem motivo";
      byReason.set(rn, (byReason.get(rn) ?? 0) + 1);
      const cn = (r.empresa_nome as string) ?? "—";
      byCompany.set(cn, (byCompany.get(cn) ?? 0) + 1);
      const ec = (r.colaborador_id as string) ?? "";
      if (ec) employeeCounts.set(ec, (employeeCounts.get(ec) ?? 0) + 1);
    }
    totals.reincidentes = Array.from(employeeCounts.values()).filter((n) => n > 1).length;
    let qProc = supabase.from("disciplinary_cases").select("id", { count: "exact", head: true }).eq("active", true).neq("status", "arquivado");
    if (data.empresa_id) qProc = qProc.eq("company_id", data.empresa_id);
    const { count: processCount } = await qProc;
    totals.processos = processCount ?? 0;
    return {
      totals,
      byMonth: Array.from(byMonth.entries()).sort().map(([mes, qtd]) => ({ mes, qtd })),
      byReason: Array.from(byReason.entries()).map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
      byCompany: Array.from(byCompany.entries()).map(([empresa, qtd]) => ({ empresa, qtd })).sort((a, b) => b.qtd - a.qtd),
      rows: list,
    };
  });

/** Pesquisa global: CPF, nome, processo, testemunha, empresa, cliente, supervisor, texto. */
export const disciplinaryGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { term: string }) => d)
  .handler(async ({ data, context }) => {
    const term = data.term.trim();
    if (term.length < 2) return { colaboradores: [], processos: [], testemunhas: [], empresas: [], clientes: [], supervisores: [], medidas: [] };
    const { supabase } = context;
    const like = `%${term}%`;
    const isUuid = /^[0-9a-f-]{36}$/i.test(term);
    const [cols, procs, wits, emps, clis, sups, meds] = await Promise.all([
      supabase.from("colaboradores").select("id, nome, cpf, matricula").or(`nome.ilike.${like},cpf.ilike.${like},matricula.ilike.${like}`).limit(15),
      supabase.from("disciplinary_cases").select("id, status, description, opened_at, employee_id").eq("active", true).or(`description.ilike.${like}${isUuid ? `,id.eq.${term}` : ""}`).limit(15),
      supabase.from("disciplinary_case_witnesses").select("id, nome, cpf, case_id").eq("active", true).or(`nome.ilike.${like},cpf.ilike.${like}`).limit(15),
      supabase.from("empresas").select("id, nome, razao_social, cnpj").or(`nome.ilike.${like},razao_social.ilike.${like},cnpj.ilike.${like}`).limit(10),
      supabase.from("clientes").select("id, nome_fantasia, razao_social").or(`nome_fantasia.ilike.${like},razao_social.ilike.${like}`).limit(10),
      supabase.from("profiles").select("id, nome, email").or(`nome.ilike.${like},email.ilike.${like}`).limit(10),
      supabase.from("disciplinary_warnings").select("id, action_type, warning_date, employee_name, conduct_description").eq("active", true).or(`conduct_description.ilike.${like},employee_name.ilike.${like}`).limit(15),
    ]);
    return {
      colaboradores: cols.data ?? [],
      processos: procs.data ?? [],
      testemunhas: wits.data ?? [],
      empresas: emps.data ?? [],
      clientes: clis.data ?? [],
      supervisores: sups.data ?? [],
      medidas: meds.data ?? [],
    };
  });

/** Carrega/grava checklist de devolução de equipamentos. */
export const getEquipmentChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { case_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("equipment_return_checklist").select("*").eq("case_id", data.case_id).maybeSingle();
    return row;
  });

export const saveEquipmentChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    case_id: string;
    items: Array<{ item: string; returned: boolean; observation?: string }>;
    return_date?: string | null;
    observations?: string | null;
    completed: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("equipment_return_checklist").select("id").eq("case_id", data.case_id).maybeSingle();
    const payload = {
      case_id: data.case_id,
      items: data.items,
      responsible_user_id: userId,
      return_date: data.return_date ?? null,
      observations: data.observations ?? null,
      completed: data.completed,
    };
    let id = existing?.id;
    if (existing) {
      const { error } = await supabase.from("equipment_return_checklist").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from("equipment_return_checklist").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    const { ip, ua } = captureMeta();
    await supabase.from("audit_trail").insert({
      user_id: userId, ip_address: ip || null, user_agent: ua || null,
      action: existing ? "update" : "create",
      entity_type: "equipment_return_checklist", entity_id: id ?? null,
      new_value: asJson(payload),
    });
    return { ok: true, id };
  });
