// Conversor de número para extenso em pt-BR (até bilhões), para valores monetários em Reais.
const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CEN[c]);
  if (r < 20) {
    if (r) parts.push(UNI[r]);
  } else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    parts.push(DEZ[d] + (u ? " e " + UNI[u] : ""));
  }
  return parts.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const bi = Math.floor(n / 1_000_000_000);
  const mi = Math.floor((n % 1_000_000_000) / 1_000_000);
  const mil = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (bi) parts.push(ate999(bi) + (bi === 1 ? " bilhão" : " bilhões"));
  if (mi) parts.push(ate999(mi) + (mi === 1 ? " milhão" : " milhões"));
  if (mil) parts.push(mil === 1 ? "mil" : ate999(mil) + " mil");
  if (rest) parts.push(ate999(rest));
  return parts.join(" e ");
}

export function valorPorExtenso(valor: number | string): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!isFinite(n)) return "";
  const inteiros = Math.floor(n);
  const centavos = Math.round((n - inteiros) * 100);
  const reais = inteiroPorExtenso(inteiros) + " " + (inteiros === 1 ? "real" : "reais");
  if (centavos === 0) return reais;
  const centTxt = inteiroPorExtenso(centavos) + " " + (centavos === 1 ? "centavo" : "centavos");
  return reais + " e " + centTxt;
}

export function formatBRL(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
