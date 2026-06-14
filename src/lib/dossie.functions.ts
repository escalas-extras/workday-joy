import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_IMAGES = 20;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB por imagem (segurança PDF)

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
      supabase.from("disciplinary_case_evidences").select("file_path, file_name, descricao, mime_type, size_bytes, created_at, uploaded_by").eq("case_id", data.case_id).eq("active", true).order("created_at", { ascending: true }),
      supabase.from("disciplinary_case_witnesses").select("nome, cpf").eq("case_id", data.case_id).eq("active", true),
      supabase.from("disciplinary_case_approvals").select("step, approved_by, decision, created_at, observacao").eq("case_id", data.case_id).eq("active", true),
      supabase.from("audit_trail").select("created_at, action, user_email, ip_address").eq("entity_id", data.case_id).order("created_at", { ascending: false }).limit(200),
    ]);
    const emp = (c as { colaboradores: { nome: string; cpf: string | null } | null }).colaboradores;
    const cmp = (c as { empresas: { nome: string } | null }).empresas;

    // Carregar imagens (até MAX_IMAGES) como dataURL para embutir no PDF
    const evList = evidences.data ?? [];
    const isImage = (m: string | null) => !!m && /^image\/(jpeg|jpg|png|webp)$/i.test(m);
    const imageEvs = evList.filter((e) => isImage(e.mime_type) && (e.size_bytes ?? 0) <= MAX_BYTES).slice(0, MAX_IMAGES);
    const dataUrlMap = new Map<string, string>();
    await Promise.all(imageEvs.map(async (e) => {
      try {
        const { data: signed } = await supabase.storage.from("disciplinary-evidences").createSignedUrl(e.file_path, 300);
        if (!signed?.signedUrl) return;
        const resp = await fetch(signed.signedUrl);
        if (!resp.ok) return;
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) return;
        const b64 = Buffer.from(buf).toString("base64");
        dataUrlMap.set(e.file_path, `data:${e.mime_type};base64,${b64}`);
      } catch { /* ignore individual failures */ }
    }));

    return {
      caseId: c.id as string,
      caseStatus: c.status as string,
      openedAt: c.opened_at as string,
      description: c.description as string,
      employeeName: emp?.nome ?? "—",
      employeeCpf: emp?.cpf ?? null,
      companyName: cmp?.nome ?? null,
      warnings: warnings.data ?? [],
      evidences: evList.map((e) => ({
        file_path: e.file_path,
        file_name: e.file_name, description: e.descricao,
        mime_type: e.mime_type, uploaded_at: e.created_at, uploaded_by: e.uploaded_by,
        data_url: dataUrlMap.get(e.file_path) ?? null,
      })),
      witnesses: (witnesses.data ?? []).map((w) => ({ witness_name: w.nome, witness_cpf: w.cpf })),
      approvals: (approvals.data ?? []).map((a) => ({ approver_role: a.step, approver_name: a.approved_by, decision: a.decision, decided_at: a.created_at, notes: a.observacao })),
      auditTrail: audit.data ?? [],
      imagesEmbedded: imageEvs.length,
      imagesTotal: evList.filter((e) => isImage(e.mime_type)).length,
    };
  });
