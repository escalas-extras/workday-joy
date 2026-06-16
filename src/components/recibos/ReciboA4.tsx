import { valorPorExtenso, formatBRL } from "@/lib/extenso";

export interface ReciboItemView {
  data: string; // YYYY-MM-DD
  cliente: string;
  empresa?: string;
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
  lancado_por?: string;
}

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

function ReciboBloco({ r }: { r: ReciboView }) {
  return (
    <div
      className="relative grid grid-cols-2 gap-0 border-2 border-[#060B5A] rounded-lg overflow-hidden bg-white text-black"
      style={{ height: "50mm", pageBreakInside: "avoid", breakInside: "avoid" }}
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
            <div className="text-xs font-bold">{formatBRL(r.valor_total)}</div>
          </div>
          <p className="mt-1 italic text-[9px] leading-none text-gray-700">
            ({valorPorExtenso(r.valor_total)})
          </p>
          <div className="mt-1 space-y-0.5 text-[9px]">
            {(() => {
              const s = semanaDoMes(r.semana_ref);
              return (
                <>
                  <p>
                    <span className="font-semibold">Semana Ref.: </span>
                    {s.label}
                  </p>
                  <p>
                    <span className="font-semibold">Período: </span>
                    {s.periodo}
                  </p>
                </>
              );
            })()}
            <p className="truncate">
              <span className="font-semibold">Colaborador: </span>
              {r.colaborador}
            </p>
            <p>
              <span className="font-semibold">Pagamento: </span>
              {fmtDate(r.data_pagamento)}
            </p>
            {r.lancado_por && (
              <p className="truncate">
                <span className="font-semibold">Lançado por: </span>
                {r.lancado_por}
              </p>
            )}
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
              <th className="text-left py-0.5">CLIENTE</th>
              <th className="text-right py-0.5">VALOR</th>
            </tr>
          </thead>
          <tbody>
            {r.itens.slice(0, 4).map((it, i) => (
              <tr key={i} className="border-b border-[#060B5A]/15">
                <td className="py-0.5">{fmtDate(it.data)}</td>
                <td className="py-0.5 truncate max-w-[100px]">{it.cliente}</td>
                <td className="py-0.5 text-right">{formatBRL(it.valor)}</td>
              </tr>
            ))}
            {r.itens.length > 4 && (
              <tr>
                <td colSpan={3} className="text-[8px] text-gray-500 italic py-0.5">
                  + {r.itens.length - 4} item(ns) ocultado(s)
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#060B5A] font-bold">
              <td colSpan={2} className="py-0.5 text-right">TOTAL</td>
              <td className="py-0.5 text-right">{formatBRL(r.valor_total)}</td>
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
