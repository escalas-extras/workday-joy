import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface ColunaRelatorio {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
}

export function exportarExcel(filename: string, sheetName: string, columns: ColunaRelatorio[], rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? ""])))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function exportarPdf(
  filename: string,
  titulo: string,
  columns: ColunaRelatorio[],
  rows: Record<string, unknown>[],
  totaisLinha?: (string | number)[]
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 19);

  autoTable(doc, {
    startY: 24,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
    foot: totaisLinha ? [totaisLinha.map(String)] : undefined,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    footStyles: { fillColor: [239, 246, 255], textColor: 0, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align ?? "left", cellWidth: c.width }])
    ),
  });
  doc.save(filename);
}
