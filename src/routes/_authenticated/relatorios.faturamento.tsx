import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios/faturamento")({ component: Page });

function Page() {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(mesAtras);
  const [ate, setAte] = useState(hoje);

  const q = useQuery({
    queryKey: ["rel-faturamento", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select("id,data,valor,valor_faturamento,situacao_financeira,status,hora_inicio,hora_termino,clientes(nome_fantasia),colaboradores(nome),funcoes(nome)")
        .eq("classificacao_comercial", "a_cobrar")
        .gte("data", de).lte("data", ate).order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => (q.data ?? []).map((r) => ({
    data: r.data,
    cliente: r.clientes?.nome_fantasia ?? "",
    colaborador: r.colaboradores?.nome ?? "",
    funcao: r.funcoes?.nome ?? "",
    horario: `${r.hora_inicio?.slice(0, 5) ?? ""} - ${r.hora_termino?.slice(0, 5) ?? ""}`,
    valor: Number(r.valor),
    valor_fmt: formatBRL(r.valor),
    valor_fat_fmt: formatBRL(r.valor_faturamento ?? r.valor),
    situacao: r.situacao_financeira ?? "—",
    status: r.status,
  })), [q.data]);

  const total = rows.reduce((s, r) => s + r.valor, 0);
  const totalFat = (q.data ?? []).reduce((s, r) => s + Number(r.valor_faturamento ?? r.valor), 0);

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 50 },
    { key: "colaborador", label: "Colaborador", width: 40 },
    { key: "funcao", label: "Função", width: 30 },
    { key: "horario", label: "Horário", width: 25 },
    { key: "valor_fmt", label: "Valor Extra", align: "right", width: 25 },
    { key: "valor_fat_fmt", label: "Valor Faturamento", align: "right", width: 30 },
    { key: "situacao", label: "Situação", width: 25 },
  ];

  return (
    <div>
      <PageHeader title="Relatório de Faturamento" description="Somente extras classificados como À Cobrar" />
      <div className="flex gap-2 mb-4 items-end flex-wrap rounded-md border p-3 bg-card">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => exportarExcel(`faturamento-${de}-${ate}.xlsx`, "Faturamento", cols, rows)}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportarPdf(`faturamento-${de}-${ate}.pdf`, "Relatório de Faturamento (À Cobrar)", cols, rows, ["", "", "", "", "TOTAL", formatBRL(total), formatBRL(totalFat), ""])}>
          <FileDown className="h-4 w-4 mr-1" />PDF
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Colaborador</TableHead>
            <TableHead>Função</TableHead><TableHead>Horário</TableHead>
            <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Valor Faturamento</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.colaborador}</TableCell>
                <TableCell>{r.funcao}</TableCell><TableCell>{r.horario}</TableCell>
                <TableCell className="text-right">{r.valor_fmt}</TableCell><TableCell className="text-right">{r.valor_fat_fmt}</TableCell>
                <TableCell>{r.situacao}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 text-right text-sm font-semibold">Total Valor: {formatBRL(total)} — Total Faturamento: {formatBRL(totalFat)}</div>
    </div>
  );
}
