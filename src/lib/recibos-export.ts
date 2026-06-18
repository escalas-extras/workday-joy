import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReciboView } from "@/components/recibos/ReciboA4";
import { valorPorExtenso, formatBRL } from "@/lib/extenso";

// Cores Grupo Juliani
const NAVY: [number, number, number] = [6, 11, 90];
const RED: [number, number, number] = [214, 30, 30];
const NAVY_SOFT: [number, number, number] = [232, 235, 245];

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ORDINAIS = ["1ª", "2ª", "3ª", "4ª", "5ª"];

function addDays(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function semanaDoMes(semana_ref: string): { label: string; periodo: string } {
  if (!semana_ref) return { label: "", periodo: "" };
  // semana_ref é a sexta-feira de início; quarta de referência = sexta + 5 dias
  const quartaReferencia = addDays(semana_ref, 5);
  const [y, m, d] = quartaReferencia.split("-").map(Number);
  const wed = new Date(Date.UTC(y, m - 1, d));
  const wDay = wed.getUTCDate();
  const wMonth = wed.getUTCMonth();
  const wYear = wed.getUTCFullYear();
  const ord = ORDINAIS[Math.min(Math.ceil(wDay / 7), 5) - 1] ?? `${Math.ceil(wDay / 7)}ª`;
  const label = `${ord} Semana de ${MESES[wMonth]}/${wYear}`;
  // Período: sexta a quinta da semana seguinte (7 dias)
  const fim = addDays(semana_ref, 6);
  return { label, periodo: `${fmtDate(semana_ref)} a ${fmtDate(fim)}` };
}

/**
 * Desenha os recibos diretamente em jsPDF (5 por página A4 retrato).
 */
export async function gerarPdfRecibos(recibos: ReciboView[], filename = "recibos.pdf") {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const margin = 10;
  const blockH = 51;
  const gap = 3;

  recibos.forEach((r, i) => {
    const indexNaPagina = i % 5;
    if (i > 0 && indexNaPagina === 0) doc.addPage();
    const y = margin + indexNaPagina * (blockH + gap);
    drawRecibo(doc, r, margin, y, pageW - 2 * margin, blockH);
  });

  doc.save(filename);
}

function drawRecibo(doc: jsPDF, r: ReciboView, x: number, y: number, w: number, h: number) {
  // Moldura azul Juliani arredondada
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 2, 2);

  const colW = w / 2;
  doc.setDrawColor(...NAVY);
  doc.line(x + colW, y, x + colW, y + h);

  // ============ ESQUERDA ============
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
  // Caixa azul do valor (compacta)
  doc.setFillColor(...NAVY_SOFT);
  doc.setDrawColor(...NAVY);
  doc.roundedRect(x + 3, cy, colW - 6, 6, 0.5, 0.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...NAVY);
  doc.text("VALOR:", x + 4.5, cy + 4.2);
  doc.setFont("helvetica", "bold");
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
  const s = semanaDoMes(r.semana_ref);
  doc.text(`Semana Ref.: ${s.label}`, x + 3, cy);
  cy += 3;
  doc.text(`Período: ${s.periodo}`, x + 3, cy);
  cy += 3;
  doc.text(`Colaborador: ${r.colaborador}`, x + 3, cy);
  cy += 3;
  doc.text(`Pagamento: ${fmtDate(r.data_pagamento)}`, x + 3, cy);

  // Rodapé esquerdo
  doc.setFontSize(6.5);
  doc.text(`Londrina/PR, ${fmtDate(r.data_pagamento)}`, x + 3, y + h - 6);
  doc.line(x + colW - 35, y + h - 4, x + colW - 3, y + h - 4);
  doc.setFontSize(6);
  doc.text("Assinatura", x + colW - 19, y + h - 1.5, { align: "center" });

  // ============ DIREITA: tabela de itens ============
  const tx = x + colW + 3;
  const tw = colW - 6;
  autoTable(doc, {
    startY: y + 3,
    margin: { left: tx, right: x + w - tx - tw + (210 - (x + w)) },
    tableWidth: tw,
    head: [["DATA", "CLIENTE", "LANÇADO POR", "VALOR"]],
    body: r.itens.slice(0, 4).map((it) => [fmtDate(it.data), it.cliente, it.lancado_por ?? "", formatBRL(it.valor)]),
    foot: [["", "", "TOTAL", formatBRL(r.valor_total)]],
    styles: { fontSize: 6, cellPadding: 0.6, textColor: 0, overflow: "linebreak" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: NAVY_SOFT, textColor: NAVY, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 13 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18 },
      3: { halign: "right", cellWidth: 16 },
    },
    theme: "grid",
  });

  // Marca d'água CANCELADO
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
