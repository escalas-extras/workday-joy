import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface DossieData {
  caseId: string;
  caseStatus: string;
  openedAt: string;
  description: string;
  employeeName: string;
  employeeCpf?: string | null;
  companyName?: string | null;
  warnings: Array<{ action_type: string; warning_date: string; conduct_description: string }>;
  evidences: Array<{ file_name?: string | null; description?: string | null; uploaded_at?: string | null }>;
  witnesses: Array<{ witness_name: string; witness_cpf?: string | null }>;
  approvals: Array<{ approver_role: string; approver_name?: string | null; decision: string; decided_at?: string | null; notes?: string | null }>;
  auditTrail: Array<{ created_at: string; action: string; user_email?: string | null; ip_address?: string | null }>;
}

const ACT: Record<string, string> = {
  orientacao_verbal: "Orientação Verbal",
  advertencia_escrita: "Advertência Escrita",
  suspensao: "Suspensão",
  justa_causa: "Justa Causa",
};

export function gerarDossiePdf(d: DossieData) {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const W = doc.internal.pageSize.getWidth();
  let y = 50;

  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text("DOSSIÊ DISCIPLINAR", W / 2, y, { align: "center" });
  y += 20;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Processo: ${d.caseId}`, W / 2, y, { align: "center" });
  y += 14;
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, W / 2, y, { align: "center" });
  y += 24;

  const section = (title: string) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text(title, 40, y); y += 6;
    doc.setLineWidth(0.5); doc.line(40, y, W - 40, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  };

  section("1. Dados do Processo");
  doc.text(`Colaborador: ${d.employeeName}${d.employeeCpf ? `  CPF: ${d.employeeCpf}` : ""}`, 40, y); y += 14;
  doc.text(`Empresa: ${d.companyName ?? "—"}`, 40, y); y += 14;
  doc.text(`Status: ${d.caseStatus}   Abertura: ${new Date(d.openedAt).toLocaleString("pt-BR")}`, 40, y); y += 14;
  const desc = doc.splitTextToSize(`Descrição: ${d.description}`, W - 80);
  doc.text(desc, 40, y); y += desc.length * 12 + 10;

  section("2. Histórico Disciplinar");
  autoTable(doc, {
    startY: y,
    head: [["Data", "Tipo", "Conduta"]],
    body: d.warnings.map((w) => [w.warning_date, ACT[w.action_type] ?? w.action_type, w.conduct_description.slice(0, 80)]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [6, 11, 90] },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;

  section("3. Evidências");
  if (d.evidences.length === 0) { doc.text("Nenhuma evidência registrada.", 40, y); y += 14; }
  else {
    autoTable(doc, {
      startY: y,
      head: [["Arquivo", "Descrição", "Data"]],
      body: d.evidences.map((e) => [e.file_name ?? "—", e.description ?? "—", e.uploaded_at ? new Date(e.uploaded_at).toLocaleString("pt-BR") : "—"]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [6, 11, 90] },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
  }

  section("4. Testemunhas");
  if (d.witnesses.length === 0) { doc.text("Nenhuma testemunha registrada.", 40, y); y += 14; }
  else {
    autoTable(doc, {
      startY: y,
      head: [["Nome", "CPF"]],
      body: d.witnesses.map((w) => [w.witness_name, w.witness_cpf ?? "—"]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [6, 11, 90] },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
  }

  section("5. Aprovações");
  if (d.approvals.length === 0) { doc.text("Nenhuma aprovação registrada.", 40, y); y += 14; }
  else {
    autoTable(doc, {
      startY: y,
      head: [["Função", "Aprovador", "Decisão", "Data", "Observações"]],
      body: d.approvals.map((a) => [a.approver_role, a.approver_name ?? "—", a.decision, a.decided_at ? new Date(a.decided_at).toLocaleString("pt-BR") : "—", (a.notes ?? "").slice(0, 60)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [6, 11, 90] },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
  }

  section("6. Trilha de Auditoria");
  autoTable(doc, {
    startY: y,
    head: [["Data/Hora", "Ação", "Usuário", "IP"]],
    body: d.auditTrail.slice(0, 100).map((a) => [
      new Date(a.created_at).toLocaleString("pt-BR"), a.action, a.user_email ?? "—", a.ip_address ?? "—",
    ]),
    styles: { fontSize: 7 }, headStyles: { fillColor: [6, 11, 90] },
  });

  doc.save(`dossie_disciplinar_${d.caseId.slice(0, 8)}.pdf`);
}
