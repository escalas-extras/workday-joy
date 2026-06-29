import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";
import { exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { SITUACAO_SERVICO_OPTS, CLASSIFICACAO_COMERCIAL_OPTS } from "@/components/extras-helpers";

type Row = Record<string, any>;

const baseColumns: ColunaRelatorio[] = [
  { key: "data", label: "Data", width: 22 },
  { key: "matricula", label: "Matr.", width: 18 },
  { key: "colaborador", label: "Colaborador", width: 55 },
  { key: "cliente", label: "Cliente", width: 45 },
  { key: "empresa", label: "Empresa", width: 35 },
  { key: "horario", label: "Horário", width: 28 },
  { key: "valor", label: "Valor (R$)", width: 22, align: "right" },
  { key: "situacao_servico", label: "Sit. Serviço", width: 32 },
  { key: "status", label: "Status", width: 32 },
  { key: "lancado_por", label: "Lançado por", width: 32 },
];

const financeiroColumns: ColunaRelatorio[] = [
  ...baseColumns,
  { key: "classificacao", label: "Classificação", width: 28 },
  { key: "situacao_financeira", label: "Sit. Financeira", width: 28 },
];

function mapRow(e: Row) {
  return {
    data: e.data,
    matricula: e.colaboradores?.matricula ?? "",
    colaborador: e.colaboradores?.nome ?? "",
    cliente: e.clientes?.nome_fantasia ?? "",
    empresa: e.empresas?.nome ?? e.empresas?.razao_social ?? "",
    horario: `${e.hora_inicio ?? ""} → ${e.hora_termino ?? ""}`,
    valor: Number(e.valor ?? 0).toFixed(2),
    situacao_servico: SITUACAO_SERVICO_OPTS.find((o) => o.v === e.situacao_servico)?.l ?? e.situacao_servico ?? "",
    status: e.status ?? "",
    lancado_por: e.emitente_nome ?? "",
    classificacao: CLASSIFICACAO_COMERCIAL_OPTS.find((o) => o.v === e.classificacao_comercial)?.l ?? e.classificacao_comercial ?? "",
    situacao_financeira: e.situacao_financeira ?? "",
  };
}

function totaisRow(rows: Row[], colsCount: number): (string | number)[] {
  const total = rows.reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const out: (string | number)[] = new Array(colsCount).fill("");
  out[0] = `Total (${rows.length})`;
  out[6] = total.toFixed(2);
  return out;
}

export function ExtrasExportActions({
  rows,
  titulo,
  filename,
  variant = "operacional",
}: {
  rows: Row[];
  titulo: string;
  filename: string;
  variant?: "operacional" | "financeiro";
}) {
  const cols = variant === "financeiro" ? financeiroColumns : baseColumns;
  const mapped = rows.map(mapRow);

  const onPdf = async () => {
    await exportarPdf(`${filename}.pdf`, titulo, cols, mapped, totaisRow(rows, cols.length));
  };

  const onPrint = () => {
    const total = rows.reduce((s, r) => s + Number(r.valor ?? 0), 0);
    const w = window.open("", "_blank", "width=1024,height=768");
    if (!w) return;
    const headHtml = cols.map((c) => `<th style="text-align:${c.align ?? "left"}">${c.label}</th>`).join("");
    const bodyHtml = mapped
      .map(
        (r) =>
          `<tr>${cols
            .map((c) => `<td style="text-align:${c.align ?? "left"}">${(r as any)[c.key] ?? ""}</td>`)
            .join("")}</tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:16px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:11px;color:#555;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:4px 6px}
        thead{background:#060b5a;color:#fff}
        tfoot td{font-weight:bold;background:#e8ebf5}
      </style></head><body>
      <h1>${titulo}</h1>
      <div class="meta">Emitido em ${new Date().toLocaleString("pt-BR")} — ${rows.length} registro(s)</div>
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot><tr><td colspan="6" style="text-align:right">Total geral</td><td style="text-align:right">R$ ${total.toFixed(2)}</td><td colspan="${cols.length - 7}"></td></tr></tfoot>
      </table>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onPdf} disabled={rows.length === 0}>
        <FileDown className="h-4 w-4 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={onPrint} disabled={rows.length === 0}>
        <Printer className="h-4 w-4 mr-1" /> Imprimir
      </Button>
    </div>
  );
}
