import { valorPorExtenso, formatBRL } from "@/lib/extenso";
import { coalesceValorMonetario } from "@/lib/valor-monetario";

export interface ReciboItemView {
  data: string; // YYYY-MM-DD
  semana_ref?: string; // YYYY-MM-DD
  cliente: string;
  empresa?: string;
  valor: number;
  lancado_por?: string;
}

export interface ReciboView {
  id: string;
  numero: number | string;
  colaborador: string;
  semana_ref: string; // legado — referência mínima do recibo
  data_pagamento: string;
  pagamento_referencia?: string;
  valor_total: number;
  ativo: boolean;
  itens: ReciboItemView[];
  lancado_por?: string;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function ReciboBloco({ r }: { r: ReciboView }) {
  const valorTotal = coalesceValorMonetario(r.valor_total);
  const itens = r.itens.length
    ? r.itens
    : [{ data: "", semana_ref: "", cliente: "—", valor: 0, lancado_por: "" }];

  return (
    <div
      className="relative grid grid-cols-2 gap-0 border-2 border-[#060B5A] rounded-lg overflow-hidden bg-white text-black"
      style={{ minHeight: "50mm", pageBreakInside: "avoid", breakInside: "avoid" }}
    >
      {!r.ativo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-[#D61E1E]/20 text-4xl font-black rotate-[-15deg] border-2 border-[#D61E1E]/20 px-3 py-1 rounded">
            CANCELADO
          </span>
        </div>
      )}
      {/* Esquerda: dados do recibo */}
      <div className="p-2 border-r border-[#060B5A] flex flex-col justify-between text-[11px] leading-tight">
        <div>
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold tracking-wide text-[#060B5A]">RECIBO</h2>
            <span className="text-[9px] font-mono">Nº {String(r.numero).padStart(6, "0")}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 border border-[#060B5A]/40 bg-[#E8EBF5] rounded p-1">
            <div className="text-[8px] uppercase text-[#060B5A] font-bold">Valor</div>
            <div className="text-xs font-bold">{formatBRL(valorTotal)}</div>
          </div>
          <p className="mt-1 italic text-[9px] leading-none text-gray-700">
            ({valorPorExtenso(valorTotal)})
          </p>
          <div className="mt-1 space-y-0.5 text-[9px]">
            <p className="truncate">
              <span className="font-semibold">Colaborador: </span>
              {r.colaborador}
            </p>
            <p>
              <span className="font-semibold">Pagamento: </span>
              {r.pagamento_referencia ? `${r.pagamento_referencia} — ` : ""}{fmtDate(r.data_pagamento)}
            </p>
          </div>
        </div>
        <div className="flex justify-between items-end mt-1 text-[8px]">
          <div>Londrina/PR, {fmtDate(r.data_pagamento)}</div>
          <div className="w-1/2">
            <div className="border-t border-black text-center pt-0.5">Assinatura</div>
          </div>
        </div>
      </div>
      {/* Direita: detalhamento */}
      <div className="p-2 flex flex-col text-[11px] leading-tight overflow-hidden">
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr className="border-b border-[#060B5A]">
              <th className="text-left py-0.5">DATA</th>
              <th className="text-left py-0.5">SEM.</th>
              <th className="text-left py-0.5">CLIENTE</th>
              <th className="text-left py-0.5">LANÇADO POR</th>
              <th className="text-right py-0.5">VALOR</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={i} className="border-b border-[#060B5A]/15">
                <td className="py-0.5 align-top">{fmtDate(it.data)}</td>
                <td className="py-0.5 align-top">{fmtDate(it.semana_ref ?? "")}</td>
                <td className="py-0.5 max-w-[80px]">
                  <div className="truncate">{it.cliente}</div>
                  {it.empresa && <div className="truncate text-[8px] text-gray-600">{it.empresa}</div>}
                </td>
                <td className="py-0.5 align-top max-w-[70px]">
                  <div className="truncate text-[8px]">{it.lancado_por ?? ""}</div>
                </td>
                <td className="py-0.5 text-right align-top">{formatBRL(coalesceValorMonetario(it.valor))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#060B5A] font-bold">
              <td colSpan={4} className="py-0.5 text-right">TOTAL</td>
              <td className="py-0.5 text-right">{formatBRL(valorTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ReciboA4({ recibos }: { recibos: ReciboView[] }) {
  // Agrupa 5 por página
  const paginas: ReciboView[][] = [];
  for (let i = 0; i < recibos.length; i += 5) paginas.push(recibos.slice(i, i + 5));

  return (
    <div className="recibos-print">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm 10mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
        .recibos-page { width: 190mm; min-height: 277mm; display: flex; flex-direction: column; gap: 3mm; justify-content: flex-start; }
        @media print {
          .recibos-page { page-break-after: always; }
          .recibos-page:last-child { page-break-after: auto; }
        }
      `}</style>
      {paginas.map((pag, idx) => (
        <div key={idx} className="recibos-page mx-auto">
          {pag.map((r) => (
            <ReciboBloco key={r.id} r={r} />
          ))}
        </div>
      ))}
    </div>
  );
}
