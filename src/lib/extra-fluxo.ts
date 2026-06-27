/** Etapas do fluxo operacional da extra (somente leitura / UI). */
export const EXTRA_FLUXO_ETAPAS = [
  { key: "lancada", label: "Lançada", short: "L" },
  { key: "aprov_operacional", label: "Aprov. Operacional", short: "Op" },
  { key: "aprov_financeira", label: "Aprov. Financeira", short: "Fin" },
  { key: "paga", label: "Paga", short: "Pg" },
  { key: "recibo", label: "Recibo emitido", short: "Rc" },
  { key: "arquivada", label: "Arquivada", short: "Ar" },
] as const;

export type ExtraFluxoEtapaKey = (typeof EXTRA_FLUXO_ETAPAS)[number]["key"];
export type ExtraFluxoEtapaEstado = "done" | "pending" | "inactive";

export type ExtraFluxoReciboInfo = {
  reciboEmitido: boolean;
  arquivada: boolean;
};

export type ExtraFluxoInput = {
  status: string;
  situacao_financeira: string | null;
  recibo: ExtraFluxoReciboInfo;
};

export type ExtraFluxoDerivado = {
  etapas: Record<ExtraFluxoEtapaKey, ExtraFluxoEtapaEstado>;
  etapaAtual: ExtraFluxoEtapaKey;
};

const STATUS_APROV_OPERACIONAL = new Set(["aprovado_operacional", "aprovado_financeiro"]);

/** Deriva o estado visual de cada etapa a partir dos dados já existentes. */
export function derivarExtraFluxo(input: ExtraFluxoInput): ExtraFluxoDerivado {
  const aprovOperacional = STATUS_APROV_OPERACIONAL.has(input.status);
  const aprovFinanceira = input.status === "aprovado_financeiro";
  const paga = input.situacao_financeira === "pago";
  const { reciboEmitido, arquivada } = input.recibo;

  const etapas: Record<ExtraFluxoEtapaKey, ExtraFluxoEtapaEstado> = {
    lancada: "done",
    aprov_operacional: aprovOperacional ? "done" : "pending",
    aprov_financeira: aprovFinanceira ? "done" : "pending",
    paga: paga ? "done" : "pending",
    recibo: reciboEmitido ? "done" : "inactive",
    arquivada: arquivada ? "done" : reciboEmitido ? "pending" : "inactive",
  };

  let etapaAtual: ExtraFluxoEtapaKey = "lancada";
  if (arquivada) etapaAtual = "arquivada";
  else if (reciboEmitido) etapaAtual = "recibo";
  else if (paga) etapaAtual = "paga";
  else if (aprovFinanceira) etapaAtual = "aprov_financeira";
  else if (aprovOperacional) etapaAtual = "aprov_operacional";

  return { etapas, etapaAtual };
}

export const EXTRA_FLUXO_LEGENDA_SEMANA =
  "Semana operacional: sexta a quinta. O pagamento pode incluir extras antigas lançadas depois.";
