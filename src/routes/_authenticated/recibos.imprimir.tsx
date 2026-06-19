import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileDown, ArrowLeft } from "lucide-react";
import { ReciboA4 } from "@/components/recibos/ReciboA4";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { loadReciboViews } from "@/lib/recibos-views";

type Search = { ids?: string; action?: string };

export const Route = createFileRoute("/_authenticated/recibos/imprimir")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ids: typeof s.ids === "string" ? s.ids : undefined,
    action: typeof s.action === "string" ? s.action : undefined,
  }),
  component: Page,
});

function Page() {
  const { ids, action } = Route.useSearch();
  const idList = (ids ?? "").split(",").filter(Boolean);

  const q = useQuery({
    queryKey: ["recibos-imprimir", idList],
    queryFn: () => loadReciboViews(idList),
    enabled: idList.length > 0,
  });

  useEffect(() => {
    if (!q.data?.length) return;
    if (action === "print") {
      let cancelled = false;
      const dispararPrint = async () => {
        try {
          if (document.fonts?.ready) await document.fonts.ready;
          const imgs = Array.from(document.images);
          await Promise.all(
            imgs.map((img) =>
              img.complete
                ? Promise.resolve()
                : new Promise((res) => {
                    img.onload = img.onerror = () => res(null);
                  }),
            ),
          );
        } catch { /* ignore */ }
        if (cancelled) return;
        // Pequeno delay extra para garantir layout final
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
        window.focus();
        window.print();
      };
      void dispararPrint();
      return () => { cancelled = true; };
    }
    if (action === "pdf") {
      void gerarPdfRecibos(q.data, `recibos-${new Date().toISOString().slice(0, 10)}.pdf`);
    }
  }, [q.data, action]);

  if (!idList.length) return <p className="p-6">Nenhum recibo selecionado.</p>;
  if (q.isLoading) return <p className="p-6">Carregando recibos...</p>;
  if (!q.data?.length) return <p className="p-6">Recibos não encontrados.</p>;

  return (
    <div>
      <div className="no-print mb-4 flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => history.back()}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
        <Button size="sm" variant="outline" onClick={() => gerarPdfRecibos(q.data!, "recibos.pdf")}><FileDown className="h-4 w-4 mr-1" />Salvar PDF</Button>
        <span className="text-sm text-muted-foreground">{q.data.length} recibo(s)</span>
      </div>
      <div className="bg-gray-100 p-4 print:bg-white print:p-0">
        <ReciboA4 recibos={q.data} />
      </div>
    </div>
  );
}
