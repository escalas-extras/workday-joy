import { jsPDF } from "jspdf";
import julianiLogo from "@/assets/juliani-logo-v2.png.asset.json";

export type DisciplinaryActionType = "orientacao_verbal" | "advertencia_escrita" | "suspensao";

export interface AdvertenciaData {
  actionType?: DisciplinaryActionType;
  city: string;
  date: string; // dd/mm/yyyy
  employeeName: string;
  employeeCpf: string;
  conductDescription: string;
  cltArticle: string;
  cltSubsections: string[];
  empresaRazaoSocial: string;
  empresaCnpj: string;
  observacoes?: string;
  // Suspensão
  suspensionDays?: number | null;
  suspensionStart?: string | null; // dd/mm/yyyy
  suspensionEnd?: string | null;   // dd/mm/yyyy
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const r = await fetch(julianiLogo.url);
    const b = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

function alineasLabel(subs: string[]) {
  if (!subs.length) return "";
  const upper = subs.map((s) => `"${s.toUpperCase()}"`);
  if (upper.length === 1) return `alínea ${upper[0]}`;
  if (upper.length === 2) return `alíneas ${upper[0]} e ${upper[1]}`;
  return `alíneas ${upper.slice(0, -1).join(", ")} e ${upper.at(-1)}`;
}

const ART_482_FULL = [
  ["a", "ato de improbidade;"],
  ["b", "incontinência de conduta ou mau procedimento;"],
  ["c", "negociação habitual por conta própria ou alheia sem permissão do empregador, e quando constituir ato de concorrência à empresa para a qual trabalha o empregado, ou for prejudicial ao serviço;"],
  ["d", "condenação criminal do empregado, passada em julgado, caso não tenha havido suspensão da execução da pena;"],
  ["e", "desídia no desempenho das respectivas funções;"],
  ["f", "embriaguez habitual ou em serviço;"],
  ["g", "violação de segredo da empresa;"],
  ["h", "ato de indisciplina ou de insubordinação;"],
  ["i", "abandono de emprego;"],
  ["j", "ato lesivo da honra ou da boa fama praticado no serviço contra qualquer pessoa, ou ofensas físicas, nas mesmas condições, salvo em caso de legítima defesa, própria ou de outrem;"],
  ["k", "ato lesivo da honra ou da boa fama ou ofensas físicas praticadas contra o empregador e superiores hierárquicos, salvo em caso de legítima defesa, própria ou de outrem;"],
  ["l", "prática constante de jogos de azar."],
  ["m", "perda da habilitação ou dos requisitos estabelecidos em lei para o exercício da profissão, em decorrência de conduta dolosa do empregado. (Incluído pela Lei nº 13.467, de 2017)"],
] as const;

export async function gerarAdvertenciaPdf(data: AdvertenciaData, filename = "advertencia.pdf", opts?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;

  // Logo
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 12, 32, 16); } catch { /* ignore */ }
  }

  let y = 36;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${data.city.toUpperCase()}, ${data.date}`, margin, y);

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.text(`Prezado Sr. ${data.employeeName.toUpperCase()}`, margin, y);
  y += 6;
  doc.text(`Portador da CPF: ${data.employeeCpf || "—"}`, margin, y);

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("AVISO DE ADVERTENCIA AO EMPREGADO", pageW / 2, y, { align: "center" });

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const intro = "    Servimo-nos da presente para informar que Vossa Senhoria está sendo formalmente advertido em decorrência da seguinte conduta:";
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * 5.2 + 2;

  // Conduta (em itálico)
  doc.setFont("helvetica", "italic");
  const conductLines = doc.splitTextToSize(`    ${data.conductDescription}`, contentW);
  doc.text(conductLines, margin, y, { align: "justify", maxWidth: contentW });
  y += conductLines.length * 5.2 + 2;

  // Enquadramento
  const al = alineasLabel(data.cltSubsections);
  const enquadramento = `    Tal conduta caracteriza falta de zelo no desempenho das funções e descumprimento de normas internas, podendo ser enquadrada como desídia e ato de indisciplina, conforme ${al} previsto${data.cltSubsections.length > 1 ? "s" : ""} no artigo 482, da Consolidação das Leis do Trabalho.`;
  const enqLines = doc.splitTextToSize(enquadramento, contentW);
  doc.text(enqLines, margin, y, { align: "justify", maxWidth: contentW });
  y += enqLines.length * 5.2 + 3;

  doc.setFont("helvetica", "normal");
  const exposto = "    Diante do exposto, fica Vossa Senhoria advertido quanto à necessidade de observar rigorosamente as normas internas da empresa, bem como cumprir fielmente as orientações superiores.";
  const expLines = doc.splitTextToSize(exposto, contentW);
  doc.text(expLines, margin, y, { align: "justify", maxWidth: contentW });
  y += expLines.length * 5.2 + 2;

  const reincidencia = "    Ressaltamos que a reincidência em condutas dessa natureza poderá ensejar a aplicação de medidas disciplinares mais severas, inclusive a rescisão do contrato de trabalho por justa causa, conforme previsto no art. 482 da CLT.";
  const reinLines = doc.splitTextToSize(reincidencia, contentW);
  doc.text(reinLines, margin, y, { align: "justify", maxWidth: contentW });
  y += reinLines.length * 5.2 + 4;

  if (data.observacoes && data.observacoes.trim()) {
    doc.setFont("helvetica", "italic");
    const obs = doc.splitTextToSize(`Observações: ${data.observacoes}`, contentW);
    doc.text(obs, margin, y);
    y += obs.length * 5.2 + 4;
    doc.setFont("helvetica", "normal");
  }

  // Empresa
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.empresaRazaoSocial.toUpperCase(), pageW / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(data.empresaCnpj, pageW / 2, y, { align: "center" });

  // Assinaturas
  y += 18;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 4;
  doc.setFontSize(10);
  doc.text("Ciente do empregado", margin, y);

  // Página 2: rodapé com Art. 482 completo
  // Se não couber, nova página
  const footerNeeded = 90;
  if (y + footerNeeded > 287) {
    doc.addPage();
    y = 20;
  } else {
    y += 14;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Art. 482 - Constituem justa causa para rescisão do contrato de trabalho pelo empregador:", margin, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  for (const [letra, texto] of ART_482_FULL) {
    const line = doc.splitTextToSize(`${letra}) ${texto}`, contentW);
    if (y + line.length * 3.4 > 290) { doc.addPage(); y = 20; }
    doc.text(line, margin, y);
    y += line.length * 3.4 + 0.6;
  }
  const paragrafo = "Parágrafo único - Constitui igualmente justa causa para dispensa de empregado a prática, devidamente comprovada em inquérito administrativo, de atos atentatórios à segurança nacional. (Incluído pelo Decreto-lei nº 3, de 27.1.1966)";
  const paragrafoLines = doc.splitTextToSize(paragrafo, contentW);
  if (y + paragrafoLines.length * 3.4 > 290) { doc.addPage(); y = 20; }
  doc.text(paragrafoLines, margin, y);

  if (opts?.autoPrint) {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
    return;
  }
  doc.save(filename);
}
