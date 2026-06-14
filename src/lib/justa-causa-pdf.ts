import { jsPDF } from "jspdf";
import julianiLogo from "@/assets/juliani-logo-v2.png.asset.json";

export const ART_482 = [
  ["a", "ato de improbidade"],
  ["b", "incontinência de conduta ou mau procedimento"],
  ["c", "negociação habitual por conta própria ou alheia sem permissão do empregador"],
  ["d", "condenação criminal do empregado, passada em julgado"],
  ["e", "desídia no desempenho das respectivas funções"],
  ["f", "embriaguez habitual ou em serviço"],
  ["g", "violação de segredo da empresa"],
  ["h", "ato de indisciplina ou de insubordinação"],
  ["i", "abandono de emprego"],
  ["j", "ato lesivo da honra ou da boa fama praticado no serviço contra qualquer pessoa, ou ofensas físicas, nas mesmas condições, salvo em caso de legítima defesa, própria ou de outrem"],
  ["k", "ato lesivo da honra ou da boa fama ou ofensas físicas praticadas contra o empregador e superiores hierárquicos, salvo em caso de legítima defesa, própria ou de outrem"],
  ["l", "prática constante de jogos de azar"],
  ["m", "perda da habilitação ou dos requisitos estabelecidos em lei para o exercício da profissão, em decorrência de conduta dolosa do empregado"],
] as const;

export interface JustaCausaData {
  city: string;
  date: string; // dd/mm/yyyy
  employeeName: string;
  employeeCpf: string;
  description: string;
  cltSubsections: string[]; // letras: a,h,j...
  empresaRazaoSocial: string;
  empresaCnpj: string;
  evidenceTypes?: string[]; // p.ex. ["Vídeo", "Foto"]
  witness1?: { nome: string; cpf?: string };
  witness2?: { nome: string; cpf?: string };
  customBody?: string; // se o usuário editou o texto
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
  const upper = subs.map((s) => `"${s.toLowerCase()}"`);
  if (upper.length === 1) return `alínea ${upper[0]}`;
  if (upper.length === 2) return `alíneas ${upper[0]} e ${upper[1]}`;
  return `alíneas ${upper.slice(0, -1).join(", ")} e ${upper.at(-1)}`;
}

export function buildBaseBody(d: JustaCausaData) {
  const al = alineasLabel(d.cltSubsections);
  return (
    `Comunicamos que o contrato de trabalho mantido entre esta empresa e Vossa Senhoria está sendo rescindido por JUSTA CAUSA, nos termos do artigo 482 da Consolidação das Leis do Trabalho, em razão da seguinte falta grave:\n\n` +
    `${d.description}\n\n` +
    `A conduta acima enquadra-se nas seguintes hipóteses legais:\n${al ? al.toUpperCase() : "—"}.\n\n` +
    (d.evidenceTypes && d.evidenceTypes.length
      ? `Para apuração dos fatos foram considerados os seguintes elementos: ${d.evidenceTypes.join(", ")}.\n\n`
      : "") +
    `Após análise dos fatos, documentos, evidências e demais elementos apurados, restou caracterizada falta grave incompatível com a manutenção do vínculo empregatício, ocasionando a quebra da fidúcia necessária à continuidade da relação de emprego.\n\n` +
    `Dessa forma, fica rescindido o contrato de trabalho por JUSTA CAUSA, produzindo seus efeitos legais a partir desta data.`
  );
}

export async function gerarJustaCausaPdf(d: JustaCausaData, filename = "justa-causa.pdf", opts?: { autoPrint?: boolean }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const margin = 18;
  const contentW = pageW - margin * 2;

  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 12, 32, 16); } catch { /* ignore */ }
  }

  let y = 38;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${d.city.toUpperCase()}, ${d.date}`, margin, y);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("COMUNICADO DE RESCISÃO CONTRATUAL POR JUSTA CAUSA", pageW / 2, y, { align: "center" });

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Prezado(a) Sr(a). ${d.employeeName.toUpperCase()}`, margin, y);
  y += 6;
  doc.text(`CPF: ${d.employeeCpf || "—"}`, margin, y);

  y += 8;
  const body = d.customBody?.trim() ? d.customBody : buildBaseBody(d);
  const paragraphs = body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(`    ${p}`, contentW);
    if (y + lines.length * 5.2 > 270) { doc.addPage(); y = 20; }
    doc.text(lines, margin, y, { align: "justify", maxWidth: contentW });
    y += lines.length * 5.2 + 3;
  }

  // Empresa
  y += 4;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.text(d.empresaRazaoSocial.toUpperCase(), pageW / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${d.empresaCnpj || "—"}`, pageW / 2, y, { align: "center" });

  // Assinaturas (5 blocos em 2 linhas)
  y += 18;
  if (y > 260) { doc.addPage(); y = 30; }
  doc.setLineWidth(0.3);
  const drawSig = (x: number, w: number, label: string, sub?: string) => {
    doc.line(x, y, x + w, y);
    doc.setFontSize(9);
    doc.text(label, x + w / 2, y + 4, { align: "center" });
    if (sub) doc.text(sub, x + w / 2, y + 8, { align: "center" });
  };

  // Linha 1: Empresa | RH | Empregado
  const col3 = (contentW - 10) / 3;
  drawSig(margin, col3, "Representante Legal");
  drawSig(margin + col3 + 5, col3, "RH");
  drawSig(margin + (col3 + 5) * 2, col3, "Empregado", d.employeeName.toUpperCase());

  y += 22;
  if (y > 280) { doc.addPage(); y = 30; }
  // Linha 2: Test 1 | Test 2
  const col2 = (contentW - 10) / 2;
  drawSig(margin, col2,
    d.witness1?.nome ? `Testemunha 1 — ${d.witness1.nome}` : "Testemunha 1",
    d.witness1?.cpf ? `CPF: ${d.witness1.cpf}` : "CPF: ____________________"
  );
  drawSig(margin + col2 + 10, col2,
    d.witness2?.nome ? `Testemunha 2 — ${d.witness2.nome}` : "Testemunha 2",
    d.witness2?.cpf ? `CPF: ${d.witness2.cpf}` : "CPF: ____________________"
  );

  // Rodapé: alíneas citadas
  if (d.cltSubsections.length) {
    if (y + 30 > 285) { doc.addPage(); y = 20; } else { y += 22; }
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Art. 482 da CLT — alíneas citadas:", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    for (const letra of d.cltSubsections) {
      const found = ART_482.find((a) => a[0] === letra.toLowerCase());
      if (!found) continue;
      const line = doc.splitTextToSize(`${found[0]}) ${found[1]}.`, contentW);
      if (y + line.length * 3.4 > 290) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += line.length * 3.4 + 0.6;
    }
  }

  if (opts?.autoPrint) {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
    return;
  }
  doc.save(filename);
}
