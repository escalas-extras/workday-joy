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

type PdfTableLayout = {
  marginX: number;
  marginRight: number;
  usableW: number;
  tableWidth: number;
  fontSize: number;
  cellPadding: number;
  widths: number[];
};

function buildPdfTableLayout(doc: jsPDF, columns: ColunaRelatorio[]): PdfTableLayout {
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 6;
  const marginRight = 8;
  const safetyGap = 1;
  const usableW = pageW - marginX - marginRight - safetyGap;
  const declared = columns.map((c) => Math.max(c.width ?? 20, 1));
  const declaredTotal = declared.reduce((s, w) => s + w, 0);
  const scale = declaredTotal > usableW ? usableW / declaredTotal : 1;
  const widths = declared.map((w) => Math.floor(w * scale * 1000) / 1000);
  const widthTotal = widths.reduce((s, w) => s + w, 0);

  if (widthTotal > usableW) {
    const diff = widthTotal - usableW;
    widths[widths.length - 1] = Math.max(1, widths[widths.length - 1] - diff - 0.001);
  }

  const tableWidth = widths.reduce((s, w) => s + w, 0);
  const density = Math.min(scale, columns.length > 9 ? 0.82 : columns.length > 8 ? 0.9 : 1);

  return {
    marginX,
    marginRight,
    usableW,
    tableWidth,
    fontSize: Math.max(4.8, Math.min(7, 7 * density)),
    cellPadding: Math.max(0.25, Math.min(0.9, 0.9 * density)),
    widths,
  };
}

function assertPdfTableFits(layout: PdfTableLayout, doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const rightLimit = pageW - layout.marginRight;
  const tableRight = layout.marginX + layout.tableWidth;

  if (layout.tableWidth > layout.usableW + 0.01 || tableRight > rightLimit + 0.01) {
    throw new Error("A tabela do PDF excedeu a largura útil da página e foi bloqueada para evitar corte de informações.");
  }
}

function assertRenderedPdfTableFits(doc: jsPDF, layout: PdfTableLayout) {
  const pageW = doc.internal.pageSize.getWidth();
  const rightLimit = pageW - layout.marginRight;
  const lastAutoTable = (doc as jsPDF & { lastAutoTable?: any }).lastAutoTable;
  const table = lastAutoTable?.table ?? lastAutoTable;
  const renderedColumns = Array.isArray(table?.columns) ? table.columns : [];
  const renderedWidth = renderedColumns.reduce((s: number, c: { width?: number }) => s + (c.width ?? 0), 0);
  const renderedRight = layout.marginX + renderedWidth;

  if (renderedWidth > layout.usableW + 0.5 || renderedRight > rightLimit + 0.5) {
    throw new Error("A tabela renderizada do PDF excedeu a área imprimível e foi bloqueada.");
  }

  const sections = [table?.head, table?.body, table?.foot].flat().filter(Boolean);
  for (const row of sections) {
    const cells = Object.values(row.cells ?? {}) as Array<{ x?: number; width?: number }>;
    for (const cell of cells) {
      if (typeof cell.x === "number" && typeof cell.width === "number" && cell.x + cell.width > rightLimit + 0.5) {
        throw new Error("Uma célula do PDF ficou fora da área imprimível e a geração foi bloqueada.");
      }
    }
  }
}

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
  doc.text("Grupo Juliani · Gestão de Escalas Extras", 42, 16);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageW - 8, 16, { align: "right" });

  // Linha vermelha de destaque
  doc.setFillColor(...JULIANI_RED);
  doc.rect(0, 22, pageW, 1.2, "F");

  doc.setTextColor(0, 0, 0);

  const pageH = doc.internal.pageSize.getHeight();
  const layout = buildPdfTableLayout(doc, columns);
  assertPdfTableFits(layout, doc);

  autoTable(doc, {
    startY: 28,
    margin: { left: layout.marginX, right: layout.marginRight },
    tableWidth: layout.tableWidth,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
    foot: totaisLinha ? [totaisLinha.map(String)] : undefined,
    styles: {
      fontSize: layout.fontSize,
      cellPadding: layout.cellPadding,
      overflow: "linebreak",
      minCellWidth: 0,
      lineWidth: 0.05,
      valign: "top",
    },
    headStyles: { fillColor: JULIANI_NAVY, textColor: 255, fontSize: layout.fontSize, cellPadding: layout.cellPadding },
    footStyles: { fillColor: JULIANI_BG_SOFT, textColor: JULIANI_NAVY, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align ?? "left", cellWidth: layout.widths[i] }]),
    ),
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text("Grupo Juliani · Gestão de Escalas Extras", layout.marginX, pageH - 4);
    },
  });

  assertRenderedPdfTableFits(doc, layout);
  doc.save(filename);
}
