import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { exportarExcel, type ColunaRelatorio } from "@/lib/relatorios-export";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/relatorios/faturamento")({ component: Page });

const SEM_EMPRESA = "__sem__";

function Page() {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(mesAtras);
  const [ate, setAte] = useState(hoje);
  const [empresa, setEmpresa] = useState("");

  const empresas = useQuery({ queryKey: ["fat-empresas"], queryFn: async () => (await supabase.from("empresas").select("id,nome").order("nome")).data ?? [] });
  const vincs = useQuery({ queryKey: ["fat-cli-emp"], queryFn: async () => (await supabase.from("cliente_empresas").select("cliente_id,empresa_id,situacao,empresas(nome)").eq("situacao", "ativo")).data ?? [] });

  const empPorCliente = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }[]>();
    for (const v of (vincs.data ?? []) as any[]) {
      const arr = m.get(v.cliente_id) ?? [];
      arr.push({ id: v.empresa_id, nome: v.empresas?.nome ?? "" });
      m.set(v.cliente_id, arr);
    }
    return m;
  }, [vincs.data]);

  const q = useQuery({
    queryKey: ["rel-faturamento", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select("id,data,valor,valor_faturamento,situacao_financeira,status,hora_inicio,hora_termino,cliente_id,clientes(nome_fantasia),colaboradores!colaborador_id(nome),funcoes(nome)")
        .eq("classificacao_comercial", "a_cobrar")
        .gte("data", de).lte("data", ate).order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Cada extra pode pertencer a uma ou mais empresas (via cliente). Para agrupamento, usamos a primeira empresa do cliente.
  const rowsAll = useMemo(() => (q.data ?? []).map((r: any) => {
    const emps = empPorCliente.get(r.cliente_id) ?? [];
    const emp = emps[0] ?? { id: SEM_EMPRESA, nome: "Sem empresa" };
    return {
      empresa_id: emp.id,
      empresa: emp.nome,
      data: r.data,
      cliente: r.clientes?.nome_fantasia ?? "",
      colaborador: r.colaboradores?.nome ?? "",
      funcao: r.funcoes?.nome ?? "",
      horario: `${r.hora_inicio?.slice(0, 5) ?? ""} - ${r.hora_termino?.slice(0, 5) ?? ""}`,
      valor_faturamento: Number(r.valor_faturamento ?? r.valor),
      valor_fat_fmt: formatBRL(r.valor_faturamento ?? r.valor),
      situacao: r.situacao_financeira ?? "—",
    };
  }), [q.data, empPorCliente]);

  const rows = useMemo(() => empresa ? rowsAll.filter((r) => r.empresa_id === empresa) : rowsAll, [rowsAll, empresa]);

  // Agrupar por empresa para exibição e PDF
  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; rows: typeof rows; total: number }>();
    for (const r of rows) {
      const g = m.get(r.empresa_id) ?? { nome: r.empresa, rows: [] as typeof rows, total: 0 };
      g.rows.push(r); g.total += r.valor_faturamento;
      m.set(r.empresa_id, g);
    }
    return [...m.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [rows]);

  const totalGeral = rows.reduce((s, r) => s + r.valor_faturamento, 0);

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 50 },
    { key: "colaborador", label: "Colaborador", width: 40 },
    { key: "funcao", label: "Função", width: 30 },
    { key: "horario", label: "Horário", width: 25 },
    { key: "valor_fat_fmt", label: "Valor Faturamento", align: "right", width: 32 },
    { key: "situacao", label: "Situação", width: 25 },
  ];

  const excelRows = rows.map((r) => ({ ...r, empresa: r.empresa }));
  const excelCols: ColunaRelatorio[] = [{ key: "empresa", label: "Empresa", width: 35 }, ...cols];

  const gerarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Relatório de Faturamento por Empresa", 14, 14);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Período: ${de} a ${ate} — Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 19);
    let y = 24;
    for (const [, g] of grupos) {
      autoTable(doc, {
        startY: y,
        head: [[`Empresa: ${g.nome}`]],
        body: [],
        theme: "plain",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 10 },
      });
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY,
        head: [cols.map((c) => c.label)],
        body: g.rows.map((r) => cols.map((c) => String((r as any)[c.key] ?? ""))),
        foot: [["", "", "", "", "Subtotal", formatBRL(g.total), ""]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: 0 },
        footStyles: { fillColor: [239, 246, 255], textColor: 0, fontStyle: "bold" },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: c.align ?? "left", cellWidth: c.width }])),
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (y > 180) { doc.addPage(); y = 14; }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`TOTAL GERAL: ${formatBRL(totalGeral)}`, 14, y + 4);
    doc.save(`faturamento-empresas-${de}-${ate}.pdf`);
  };

  return (
    <div>
      <PageHeader title="Relatório de Faturamento por Empresa" description="Agrupa extras À Cobrar pela empresa que atende o cliente. Não inclui valor pago ao colaborador." />
      <div className="flex gap-2 mb-4 items-end flex-wrap rounded-md border p-3 bg-card">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div><Label className="text-xs">Empresa</Label>
          <Select value={empresa || "_all"} onValueChange={(v) => setEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas</SelectItem>{(empresas.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportarExcel(`faturamento-${de}-${ate}.xlsx`, "Faturamento", excelCols, excelRows)}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
        </Button>
        <Button size="sm" variant="outline" onClick={gerarPdf} disabled={!grupos.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF (todas empresas)
        </Button>
      </div>

      {grupos.map(([id, g]) => (
        <div key={id} className="mb-6">
          <h2 className="text-sm font-semibold mb-2 bg-primary/10 px-3 py-1 rounded">Empresa: {g.nome} — Total: {formatBRL(g.total)}</h2>
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Colaborador</TableHead>
                <TableHead>Função</TableHead><TableHead>Horário</TableHead>
                <TableHead className="text-right">Valor Faturamento</TableHead><TableHead>Situação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {g.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.colaborador}</TableCell>
                    <TableCell>{r.funcao}</TableCell><TableCell>{r.horario}</TableCell>
                    <TableCell className="text-right">{r.valor_fat_fmt}</TableCell><TableCell>{r.situacao}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      {!grupos.length && <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">Sem registros</div>}

      <div className="mt-3 text-right text-base font-bold">Total Geral Faturamento: {formatBRL(totalGeral)}</div>
    </div>
  );
}
