/**
 * Valores monetários de extras/recibos: zero é permitido; negativo e inválido não.
 */
export function normalizarValorMonetario(valor: unknown): number {
  const n = typeof valor === "string" ? Number(valor) : Number(valor);
  if (!Number.isFinite(n)) throw new Error("Valor inválido");
  if (n < 0) throw new Error("Valor negativo não permitido");
  return n;
}

/** Como {@link normalizarValorMonetario}, mas null/undefined viram 0 (ex.: snapshot ainda não calculado). */
export function coalesceValorMonetario(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  return normalizarValorMonetario(valor);
}

/** Valida valor informado no lançamento de extra (string do formulário ou número). */
export function validarValorExtraInput(valor: unknown): number {
  if (valor === "" || valor === null || valor === undefined) {
    throw new Error("Informe o valor da extra");
  }
  return normalizarValorMonetario(valor);
}
