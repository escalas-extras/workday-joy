import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReciboView } from "@/components/recibos/ReciboA4";
import { valorPorExtenso, formatBRL } from "@/lib/extenso";
import julianiLogo from "@/assets/juliani-logo.png.asset.json";

// Cores Grupo Juliani
const NAVY: [number, number, number] = [6, 11, 90];
const RED: [number, number, number] = [214, 30, 30];
const NAVY_SOFT: [number, number, number] = [232, 235, 245];

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

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function semanaDescricao(semana_ref: string): string {
  if (!semana_ref) return "";
  const [y, m, d] = semana_ref.split("-").map(Number);
  const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  return `EXTRAS SEMANA ${String(d).padStart(2, "0")}/${meses[m - 1]}/${y}`;
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
  const logo = await loadLogoDataUrl();

  recibos.forEach((r, i) => {
    const indexNaPagina = i % 5;
    if (i > 0 && indexNaPagina === 0) doc.addPage();
    const y = margin + indexNaPagina * (blockH + gap);
    drawRecibo(doc, r, margin, y, pageW - 2 * margin, blockH, logo);
  });

  doc.save(filename);
}

function drawRecibo(doc: jsPDF, r: ReciboView, x: number, y: number, w: number, h: number, logo: string | null) {
  // Moldura azul Juliani arredondada
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 2, 2);

  const colW = w / 2;
  doc.setDrawColor(...NAVY);
  doc.line(x + colW, y, x + colW, y + h);

  // ============ ESQUERDA ============
  let cy = y + 4.5;
  if (logo) {
    try { doc.addImage(logo, "PNG", x + 2, y + 1.8, 13, 6); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text("RECIBO", x + 17, cy);
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
  doc.text(`Ref.: ${semanaDescricao(r.semana_ref)}`, x + 3, cy);
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
    head: [["DATA", "CLIENTE", "VALOR"]],
    body: r.itens.slice(0, 4).map((it) => [fmtDate(it.data), it.cliente, formatBRL(it.valor)]),
    foot: [["", "TOTAL", formatBRL(r.valor_total)]],
    styles: { fontSize: 6, cellPadding: 0.6, textColor: 0 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [239, 246, 255], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 15 }, 2: { halign: "right", cellWidth: 18 } },
    theme: "grid",
  });

  // Marca d'água CANCELADO
  if (!r.ativo) {
    doc.saveGraphicsState();
    // @ts-expect-error - GState exists at runtime
    doc.setGState(new doc.GState({ opacity: 0.15 }));
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("CANCELADO", x + w / 2, y + h / 2, { align: "center", angle: -15 });
    doc.restoreGraphicsState();
  }
}
