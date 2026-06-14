import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDossieData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { case_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: c } = await supabase
      .from("disciplinary_cases")
      .select("*, colaboradores(nome, cpf), empresas(nome)")
      .eq("id", data.case_id).maybeSingle();
    if (!c) throw new Error("Processo não encontrado");
    const employeeId = c.employee_id as string;
    const [warnings, evidences, witnesses, approvals, audit] = await Promise.all([
      supabase.from("disciplinary_warnings").select("action_type, warning_date, conduct_description").eq("colaborador_id", employeeId).eq("active", true).order("warning_date", { ascending: false }),
      supabase.from("disciplinary_case_evidences").select("file_name, descricao, mime_type, created_at, uploaded_by").eq("case_id", data.case_id).eq("active", true),
      supabase.from("disciplinary_case_witnesses").select("nome, cpf").eq("case_id", data.case_id).eq("active", true),
      supabase.from("disciplinary_case_approvals").select("step, approved_by, decision, created_at, observacao").eq("case_id", data.case_id).eq("active", true),
      supabase.from("audit_trail").select("created_at, action, user_email, ip_address").eq("entity_id", data.case_id).order("created_at", { ascending: false }).limit(200),
    ]);
    const emp = (c as { colaboradores: { nome: string; cpf: string | null } | null }).colaboradores;
    const cmp = (c as { empresas: { nome: string } | null }).empresas;
    return {
      caseId: c.id as string,
      caseStatus: c.status as string,
      openedAt: c.opened_at as string,
      description: c.description as string,
      employeeName: emp?.nome ?? "—",
      employeeCpf: emp?.cpf ?? null,
      companyName: cmp?.nome ?? null,
      warnings: warnings.data ?? [],
      evidences: (evidences.data ?? []).map((e) => ({
        file_name: e.file_name, description: e.descricao,
        mime_type: e.mime_type, uploaded_at: e.created_at, uploaded_by: e.uploaded_by,
      })),
      witnesses: (witnesses.data ?? []).map((w) => ({ witness_name: w.nome, witness_cpf: w.cpf })),
      approvals: (approvals.data ?? []).map((a) => ({ approver_role: a.step, approver_name: a.approved_by, decision: a.decision, decided_at: a.created_at, notes: a.observacao })),
      auditTrail: audit.data ?? [],
    };
  });
