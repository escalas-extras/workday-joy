import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios/financeiro")({ component: Page });

type Linha = {
  id: string; data: string; valor: number; classificacao: "contrato" | "a_cobrar";
  situacao_financeira: string | null; status: string;
  cliente: string; colaborador: string;
};

function Page() {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(mesAtras);
  const [ate, setAte] = useState(hoje);

  const q = useQuery({
    queryKey: ["rel-financeiro", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select("id,data,valor,classificacao_comercial,situacao_financeira,status,clientes(nome_fantasia),colaboradores!colaborador_id(nome)")
        .gte("data", de).lte("data", ate).order("data");
      if (error) throw error;
      return (data ?? []).map((r): Linha => ({
        id: r.id, data: r.data, valor: Number(r.valor),
        classificacao: r.classificacao_comercial as "contrato" | "a_cobrar",
        situacao_financeira: r.situacao_financeira, status: r.status,
        cliente: r.clientes?.nome_fantasia ?? "",
        colaborador: r.colaboradores?.nome ?? "",
      }));
    },
  });

  const totais = useMemo(() => {
    const rows = q.data ?? [];
    const calc = (filtroClasse: "contrato" | "a_cobrar") => {
      const grp = rows.filter((r) => r.classificacao === filtroClasse);
      const soma = (pred: (r: Linha) => boolean) => grp.filter(pred).reduce((s, r) => s + r.valor, 0);
      return {
        pago: soma((r) => r.situacao_financeira === "pago"),
        pendente: soma((r) => r.situacao_financeira === "pendente" || r.situacao_financeira === null),
        cancelado: soma((r) => r.status === "cancelado"),
        faturado: soma((r) => r.situacao_financeira === "faturado"),
      };
    };
    return { contrato: calc("contrato"), a_cobrar: calc("a_cobrar") };
  }, [q.data]);

  const rows = (q.data ?? []).map((r) => ({
    data: r.data, cliente: r.cliente, colaborador: r.colaborador,
    classificacao: r.classificacao === "a_cobrar" ? "À Cobrar" : "Contrato",
    situacao: r.situacao_financeira ?? "—", status: r.status,
    valor_fmt: formatBRL(r.valor),
  }));

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 50 },
    { key: "colaborador", label: "Colaborador", width: 45 },
    { key: "classificacao", label: "Classificação", width: 25 },
    { key: "status", label: "Status", width: 30 },
    { key: "situacao", label: "Situação Fin.", width: 25 },
    { key: "valor_fmt", label: "Valor", align: "right", width: 25 },
  ];

  return (
    <div>
      <PageHeader title="Relatório Financeiro" description="Totais por status, separados por Contrato e À Cobrar" />
      <div className="flex gap-2 mb-4 items-end flex-wrap rounded-md border p-3 bg-card">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => exportarExcel(`financeiro-${de}-${ate}.xlsx`, "Financeiro", cols, rows)}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportarPdf(`financeiro-${de}-${ate}.pdf`, "Relatório Financeiro", cols, rows)}>
          <FileDown className="h-4 w-4 mr-1" />PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {(["contrato", "a_cobrar"] as const).map((k) => (
          <Card key={k}>
            <CardHeader><CardTitle>{k === "contrato" ? "Contrato" : "À Cobrar"}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Pago</div><div className="text-lg font-bold text-green-600">{formatBRL(totais[k].pago)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pendente</div><div className="text-lg font-bold text-amber-600">{formatBRL(totais[k].pendente)}</div></div>
              <div><div className="text-xs text-muted-foreground">Cancelado</div><div className="text-lg font-bold text-red-600">{formatBRL(totais[k].cancelado)}</div></div>
              <div><div className="text-xs text-muted-foreground">Faturado</div><div className="text-lg font-bold text-blue-600">{formatBRL(totais[k].faturado)}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Colaborador</TableHead>
            <TableHead>Classificação</TableHead><TableHead>Status</TableHead><TableHead>Situação Fin.</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.colaborador}</TableCell>
                <TableCell>{r.classificacao}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.situacao}</TableCell>
                <TableCell className="text-right">{r.valor_fmt}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sem registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
