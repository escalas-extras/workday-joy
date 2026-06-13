import { valorPorExtenso, formatBRL } from "@/lib/extenso";

export interface ReciboItemView {
  data: string; // YYYY-MM-DD
  cliente: string;
  valor: number;
}

export interface ReciboView {
  id: string;
  numero: number | string;
  colaborador: string;
  semana_ref: string; // YYYY-MM-DD
  data_pagamento: string; // YYYY-MM-DD
  valor_total: number;
  ativo: boolean;
  itens: ReciboItemView[];
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

function ReciboBloco({ r }: { r: ReciboView }) {
  return (
    <div
      className="relative grid grid-cols-2 gap-0 border-2 border-blue-600 rounded-lg overflow-hidden bg-white text-black"
      style={{ height: "92mm", pageBreakInside: "avoid", breakInside: "avoid" }}
    >
      {!r.ativo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-red-500/30 text-7xl font-black rotate-[-25deg] border-4 border-red-500/30 px-6 py-2 rounded">
            CANCELADO
          </span>
        </div>
      )}
      {/* Esquerda: dados do recibo */}
      <div className="p-4 border-r border-blue-600 flex flex-col justify-between text-sm">
        <div>
          <div className="flex justify-between items-baseline">
            <h2 className="text-xl font-bold tracking-wide">RECIBO</h2>
            <span className="text-sm font-mono">Nº {String(r.numero).padStart(6, "0")}</span>
          </div>
          <div className="mt-2 border border-blue-300 bg-blue-50 rounded p-2">
            <div className="text-[10px] uppercase text-blue-700">Valor</div>
            <div className="text-lg font-bold">{formatBRL(r.valor_total)}</div>
          </div>
          <p className="mt-2 italic text-[11px] leading-tight">
            ({valorPorExtenso(r.valor_total)})
          </p>
          <p className="mt-2 text-[11px]">
            <span className="font-semibold">Ref.: </span>
            {semanaDescricao(r.semana_ref)}
          </p>
          <p className="mt-1 text-[11px]">
            <span className="font-semibold">Colaborador: </span>
            {r.colaborador}
          </p>
          <p className="text-[11px]">
            <span className="font-semibold">Pagamento: </span>
            {fmtDate(r.data_pagamento)}
          </p>
        </div>
        <div className="mt-3">
          <p className="text-[11px]">Londrina/PR, {fmtDate(r.data_pagamento)}</p>
          <div className="border-t border-black mt-6 pt-1 text-center text-[10px]">Assinatura</div>
        </div>
      </div>
      {/* Direita: detalhamento */}
      <div className="p-4 flex flex-col text-sm">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b-2 border-blue-600">
              <th className="text-left py-1">DATA</th>
              <th className="text-left py-1">CLIENTE</th>
              <th className="text-right py-1">VALOR</th>
            </tr>
          </thead>
          <tbody>
            {r.itens.map((it, i) => (
              <tr key={i} className="border-b border-blue-100">
                <td className="py-1">{fmtDate(it.data)}</td>
                <td className="py-1 truncate max-w-[120px]">{it.cliente}</td>
                <td className="py-1 text-right">{formatBRL(it.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-blue-600 font-bold">
              <td colSpan={2} className="py-1 text-right">TOTAL</td>
              <td className="py-1 text-right">{formatBRL(r.valor_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ReciboA4({ recibos }: { recibos: ReciboView[] }) {
  // Agrupa 3 por página
  const paginas: ReciboView[][] = [];
  for (let i = 0; i < recibos.length; i += 3) paginas.push(recibos.slice(i, i + 3));

  return (
    <div className="recibos-print">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
        .recibos-page { width: 190mm; min-height: 277mm; display: flex; flex-direction: column; gap: 4mm; }
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
