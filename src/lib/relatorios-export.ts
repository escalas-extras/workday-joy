import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import julianiLogo from "@/assets/juliani-logo.png.asset.json";

export interface ColunaRelatorio {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
}

// Cores Grupo Juliani
const JULIANI_NAVY: [number, number, number] = [6, 11, 90];
const JULIANI_RED: [number, number, number] = [214, 30, 30];
const JULIANI_BG_SOFT: [number, number, number] = [232, 235, 245];

export function exportarExcel(filename: string, sheetName: string, columns: ColunaRelatorio[], rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? ""])))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(julianiLogo.url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportarPdf(
  filename: string,
  titulo: string,
  columns: ColunaRelatorio[],
  rows: Record<string, unknown>[],
  totaisLinha?: (string | number)[]
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Faixa de cabeçalho azul-escuro Juliani
  doc.setFillColor(...JULIANI_NAVY);
  doc.rect(0, 0, pageW, 22, "F");

  // Logo (se disponível)
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", 8, 4, 30, 14); } catch { /* ignore */ }
  }

  // Título e empresa
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 42, 11);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Grupo Juliani · Gestão de Horas Extras", 42, 16);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageW - 8, 16, { align: "right" });

  // Linha vermelha de destaque
  doc.setFillColor(...JULIANI_RED);
  doc.rect(0, 22, pageW, 1.2, "F");

  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
    foot: totaisLinha ? [totaisLinha.map(String)] : undefined,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: JULIANI_NAVY, textColor: 255 },
    footStyles: { fillColor: JULIANI_BG_SOFT, textColor: JULIANI_NAVY, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align ?? "left", cellWidth: c.width }])
    ),
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text("Grupo Juliani · Gestão de Horas Extras", 8, h - 4);
    },
  });
  doc.save(filename);
}
