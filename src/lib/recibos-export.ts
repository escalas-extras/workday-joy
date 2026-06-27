import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReciboView } from "@/components/recibos/ReciboA4";
import { valorPorExtenso, formatBRL } from "@/lib/extenso";

const NAVY: [number, number, number] = [6, 11, 90];
const RED: [number, number, number] = [214, 30, 30];
const NAVY_SOFT: [number, number, number] = [232, 235, 245];

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/**
 * Desenha recibos em jsPDF. Altura dinâmica conforme quantidade de itens.
 */
export async function gerarPdfRecibos(recibos: ReciboView[], filename = "recibos.pdf") {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const margin = 10;
  const gap = 4;
  let y = margin;

  recibos.forEach((r, i) => {
    const itemRows = Math.max(r.itens.length, 1);
    const blockH = Math.min(120, 38 + itemRows * 4);
    if (i > 0 && y + blockH > 280) {
      doc.addPage();
      y = margin;
    }
    drawRecibo(doc, r, margin, y, pageW - 2 * margin, blockH);
    y += blockH + gap;
  });

  doc.save(filename);
}

function drawRecibo(doc: jsPDF, r: ReciboView, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 2, 2);

  const colW = w / 2;
  doc.line(x + colW, y, x + colW, y + h);

  let cy = y + 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text("RECIBO", x + 3, cy);
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`Nº ${String(r.numero).padStart(6, "0")}`, x + colW - 3, cy, { align: "right" });

  cy += 3;
  doc.setFillColor(...NAVY_SOFT);
  doc.setDrawColor(...NAVY);
  doc.roundedRect(x + 3, cy, colW - 6, 6, 0.5, 0.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...NAVY);
  doc.text("VALOR:", x + 4.5, cy + 4.2);
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(formatBRL(r.valor_total), x + 16, cy + 4.5);

  cy += 9;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6);
  const extenso = `(${valorPorExtenso(r.valor_total)})`;
  const lines = doc.splitTextToSize(extenso, colW - 6);
  doc.text(lines, x + 3, cy);
  cy += lines.length * 2.2 + 1;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Colaborador: ${r.colaborador}`, x + 3, cy);
  cy += 3;
  const pagLabel = r.pagamento_referencia ? `${r.pagamento_referencia} — ` : "";
  doc.text(`Pagamento: ${pagLabel}${fmtDate(r.data_pagamento)}`, x + 3, cy);

  doc.setFontSize(6.5);
  doc.text(`Londrina/PR, ${fmtDate(r.data_pagamento)}`, x + 3, y + h - 6);
  doc.line(x + colW - 35, y + h - 4, x + colW - 3, y + h - 4);
  doc.setFontSize(6);
  doc.text("Assinatura", x + colW - 19, y + h - 1.5, { align: "center" });

  const tx = x + colW + 3;
  const tw = colW - 6;
  autoTable(doc, {
    startY: y + 3,
    margin: { left: tx, right: x + w - tx - tw + (210 - (x + w)) },
    tableWidth: tw,
    head: [["DATA", "SEM.", "CLIENTE", "LANÇADO POR", "VALOR"]],
    body: r.itens.map((it) => [
      fmtDate(it.data),
      fmtDate(it.semana_ref ?? ""),
      it.cliente,
      it.lancado_por ?? "",
      formatBRL(it.valor),
    ]),
    foot: [["", "", "", "TOTAL", formatBRL(r.valor_total)]],
    styles: { fontSize: 5.5, cellPadding: 0.5, textColor: 0, overflow: "linebreak" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: NAVY_SOFT, textColor: NAVY, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 12 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 16 },
      4: { halign: "right", cellWidth: 14 },
    },
    theme: "grid",
  });

  if (!r.ativo) {
    doc.saveGraphicsState();
    // @ts-expect-error - GState exists at runtime
    doc.setGState(new doc.GState({ opacity: 0.15 }));
    doc.setTextColor(...RED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("CANCELADO", x + w / 2, y + h / 2, { align: "center", angle: -15 });
    doc.restoreGraphicsState();
  }
}
