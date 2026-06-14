import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CATEGORY_LABEL, decodeMeta, isImageMime } from "@/lib/evidence-meta";

export interface DossieData {
  caseId: string;
  caseStatus: string;
  openedAt: string;
  description: string;
  employeeName: string;
  employeeCpf?: string | null;
  companyName?: string | null;
  warnings: Array<{ action_type: string; warning_date: string; conduct_description: string }>;
  evidences: Array<{ file_name?: string | null; description?: string | null; mime_type?: string | null; uploaded_at?: string | null; uploaded_by?: string | null; data_url?: string | null }>;
  witnesses: Array<{ witness_name: string; witness_cpf?: string | null }>;
  approvals: Array<{ approver_role: string; approver_name?: string | null; decision: string; decided_at?: string | null; notes?: string | null }>;
  auditTrail: Array<{ created_at: string; action: string; user_email?: string | null; ip_address?: string | null }>;
  imagesEmbedded?: number;
  imagesTotal?: number;
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
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;

  // ANEXO I — EVIDÊNCIAS VISUAIS
  doc.addPage(); y = 50;
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("ANEXO I — EVIDÊNCIAS VISUAIS", W / 2, y, { align: "center" });
  y += 18;
  doc.setFontSize(9); doc.setFont("helvetica", "italic");
  if ((d.imagesEmbedded ?? 0) < (d.imagesTotal ?? 0)) {
    doc.text(`Exibindo ${d.imagesEmbedded} de ${d.imagesTotal} imagens (limite por dossiê).`, W / 2, y, { align: "center" });
    y += 12;
  }
  doc.text("Vídeos e áudios não são embutidos. Mídias originais permanecem custodiadas no sistema.", W / 2, y, { align: "center" });
  y += 18;
  doc.setFont("helvetica", "normal");

  const imgs = d.evidences.filter((e) => isImageMime(e.mime_type));
  const avs = d.evidences.filter((e) => !isImageMime(e.mime_type));

  // Render cada imagem em tamanho de leitura, com metadados, quebrando página quando preciso.
  const IMG_MAX_W = W - 80;       // largura útil
  const IMG_MAX_H = 380;          // altura máx de uma imagem
  const META_LINE_H = 11;
  const META_BLOCK_H = META_LINE_H * 5 + 8; // ~63pt

  if (imgs.length === 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Nenhuma imagem registrada.", 40, y); y += 16;
  } else {
    imgs.forEach((e, idx) => {
      const m = decodeMeta(e.description ?? null);
      const ext = (e.mime_type ?? "").toLowerCase().includes("png") ? "PNG"
        : (e.mime_type ?? "").toLowerCase().includes("webp") ? "WEBP" : "JPEG";

      // garantir espaço para imagem + metadados
      if (y + IMG_MAX_H + META_BLOCK_H + 40 > 800) { doc.addPage(); y = 50; }

      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text(`Imagem ${idx + 1} — ${e.file_name ?? "—"}`, 40, y);
      y += 14;

      if (e.data_url) {
        try {
          // jsPDF calcula proporção via imageProperties
          const props = doc.getImageProperties(e.data_url);
          const ratio = props.width / props.height;
          let w = IMG_MAX_W;
          let h = w / ratio;
          if (h > IMG_MAX_H) { h = IMG_MAX_H; w = h * ratio; }
          const x = (W - w) / 2;
          // moldura
          doc.setDrawColor(180); doc.rect(x - 1, y - 1, w + 2, h + 2);
          doc.addImage(e.data_url, ext === "WEBP" ? "PNG" : ext, x, y, w, h, undefined, "FAST");
          y += h + 8;
        } catch {
          doc.setFont("helvetica", "italic"); doc.setFontSize(9);
          doc.text("[imagem indisponível para inclusão neste PDF]", 40, y); y += 12;
        }
      } else {
        doc.setFont("helvetica", "italic"); doc.setFontSize(9);
        doc.text("[imagem não embutida — consulte o sistema]", 40, y); y += 12;
      }

      // Metadados
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const cat = m ? CATEGORY_LABEL[m.cat] : "—";
      const desc = m?.desc ?? "—";
      const local = m?.local ?? "—";
      const dataOc = m?.dataOc ? m.dataOc.split("-").reverse().join("/") : (e.uploaded_at ? new Date(e.uploaded_at).toLocaleDateString("pt-BR") : "—");
      const obs = m?.obs ?? "—";
      const lines = [
        `Categoria: ${cat}`,
        `Descrição: ${desc}`,
        `Local: ${local}`,
        `Data da ocorrência: ${dataOc}`,
        `Observações: ${obs}`,
      ];
      lines.forEach((ln) => {
        const wrapped = doc.splitTextToSize(ln, W - 80);
        if (y + wrapped.length * META_LINE_H > 800) { doc.addPage(); y = 50; }
        doc.text(wrapped, 40, y);
        y += wrapped.length * META_LINE_H;
      });
      y += 14;
    });
  }

  // Tabela de vídeos / áudios / documentos
  if (avs.length > 0) {
    if (y > 700) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`Vídeos / Áudios / Documentos (${avs.length})`, 40, y); y += 6;
    autoTable(doc, {
      startY: y + 4,
      head: [["Nome", "Tipo", "Descrição", "Data", "Responsável"]],
      body: avs.map((e) => {
        const m = decodeMeta(e.description ?? null);
        return [
          e.file_name ?? "—",
          m ? CATEGORY_LABEL[m.cat] : (e.mime_type ?? "—"),
          m?.desc ?? "—",
          e.uploaded_at ? new Date(e.uploaded_at).toLocaleString("pt-BR") : "—",
          e.uploaded_by ?? "—",
        ];
      }),
      styles: { fontSize: 7 }, headStyles: { fillColor: [6, 11, 90] },
    });
  }

  doc.save(`dossie_disciplinar_${d.caseId.slice(0, 8)}.pdf`);
}
