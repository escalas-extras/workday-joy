import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/app-shell";
import { exportarExcel, type ColunaRelatorio } from "@/lib/relatorios-export";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildMesesOpts, buildSemanasOpts, derivePeriodo, agruparMesSemana } from "@/lib/semana-buckets";

export const Route = createFileRoute("/_authenticated/relatorios/faturamento")({ component: Page });

const SEM_EMPRESA = "__sem__";

type ExtraRow = {
  id: string; data: string; valor: number; valor_faturamento: number | null;
  situacao_financeira: string | null; status: string;
  hora_inicio: string; hora_termino: string;
  cliente_id: string;
  clientes?: { id: string; nome_fantasia: string };
  colaboradores?: { id: string; nome: string; empresa_id?: string; empresas?: { id: string; nome: string } };
  funcoes?: { nome: string };
};

type Row = {
  data: string; empresa_id: string; empresa: string; cliente_id: string; cliente: string;
  colaborador: string; funcao: string; horario: string;
  valor_faturamento: number; valor_fat_fmt: string; situacao: string;
};

function Page() {
  const [mesRef, setMesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [semana, setSemana] = useState<string>("_all");
  const [empresa, setEmpresa] = useState("");
  const [cliente, setCliente] = useState("");

  const mesesOpts = useMemo(() => buildMesesOpts(), []);
  const semanasOpts = useMemo(() => buildSemanasOpts(mesRef), [mesRef]);
  const { de, ate } = useMemo(() => derivePeriodo(mesRef, semana, semanasOpts), [mesRef, semana, semanasOpts]);
  const onChangeMes = (v: string) => { setMesRef(v); setSemana("_all"); };

  const q = useQuery({
    queryKey: ["rel-faturamento", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select(
          "id,data,valor,valor_faturamento,situacao_financeira,status,hora_inicio,hora_termino,cliente_id," +
          "clientes(id,nome_fantasia)," +
          "colaboradores!colaborador_id(id,nome,empresa_id,empresas(id,nome))," +
          "funcoes(nome)"
        )
        .eq("classificacao_comercial", "a_cobrar")
        .gte("data", de).lte("data", ate).order("data");
      if (error) throw error;
      return (data ?? []) as unknown as ExtraRow[];
    },
  });

  const opts = useMemo(() => {
    const empresas = new Map<string, string>();
    const clientes = new Map<string, string>();
    for (const r of q.data ?? []) {
      if (r.colaboradores?.empresas) empresas.set(r.colaboradores.empresas.id, r.colaboradores.empresas.nome);
      if (r.clientes) clientes.set(r.cliente_id, r.clientes.nome_fantasia);
    }
    return {
      empresas: [...empresas.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nome]) => ({ id, nome })),
      clientes: [...clientes.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nome]) => ({ id, nome })),
    };
  }, [q.data]);

  const rowsAll = useMemo<Row[]>(() => (q.data ?? []).map((r) => {
    const emp = r.colaboradores?.empresas;
    return {
      empresa_id: emp?.id ?? SEM_EMPRESA,
      empresa: emp?.nome ?? "Sem empresa",
      data: r.data,
      cliente_id: r.cliente_id,
      cliente: r.clientes?.nome_fantasia ?? "",
      colaborador: r.colaboradores?.nome ?? "",
      funcao: r.funcoes?.nome ?? "",
      horario: `${r.hora_inicio?.slice(0, 5) ?? ""} - ${r.hora_termino?.slice(0, 5) ?? ""}`,
      valor_faturamento: Number(r.valor_faturamento ?? r.valor),
      valor_fat_fmt: formatBRL(r.valor_faturamento ?? r.valor),
      situacao: r.situacao_financeira ?? "—",
    };
  }), [q.data]);

  const rows = useMemo(() => rowsAll.filter((r) => {
    if (empresa && r.empresa_id !== empresa) return false;
    if (cliente && r.cliente_id !== cliente) return false;
    return true;
  }), [rowsAll, empresa, cliente]);

  // Pendentes vs Fechados — "fechado" = situacao = faturado
  const pendentes = useMemo(() => rows.filter((r) => r.situacao !== "faturado" && r.situacao !== "cancelado"), [rows]);
  const arquivados = useMemo(() => rows.filter((r) => r.situacao === "faturado" || r.situacao === "cancelado"), [rows]);

  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; rows: Row[]; total: number }>();
    for (const r of rows) {
      const g = m.get(r.empresa_id) ?? { nome: r.empresa, rows: [] as Row[], total: 0 };
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
        headStyles: { fillColor: [6, 11, 90], textColor: 255, fontStyle: "bold", fontSize: 10 },
      });
      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY,
        head: [cols.map((c) => c.label)],
        body: g.rows.map((r) => cols.map((c) => String((r as Record<string, unknown>)[c.key] ?? ""))),
        foot: [["", "", "", "", "Subtotal", formatBRL(g.total), ""]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: 0 },
        footStyles: { fillColor: [239, 246, 255], textColor: 0, fontStyle: "bold" },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: c.align ?? "left", cellWidth: c.width }])),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      if (y > 180) { doc.addPage(); y = 14; }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`TOTAL GERAL: ${formatBRL(totalGeral)}`, 14, y + 4);
    doc.save(`faturamento-empresas-${de}-${ate}.pdf`);
  };

  const renderGrupos = (rs: Row[], emptyMsg: string) => {
    const m = new Map<string, { nome: string; rows: Row[]; total: number }>();
    for (const r of rs) {
      const g = m.get(r.empresa_id) ?? { nome: r.empresa, rows: [] as Row[], total: 0 };
      g.rows.push(r); g.total += r.valor_faturamento;
      m.set(r.empresa_id, g);
    }
    const grps = [...m.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
    if (!grps.length) return <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">{emptyMsg}</div>;
    return (
      <>
        {grps.map(([id, g]) => (
          <div key={id} className="mb-4">
            <h3 className="text-sm font-semibold mb-2 bg-primary/10 px-3 py-1 rounded">Empresa: {g.nome} — Total: {formatBRL(g.total)}</h3>
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
      </>
    );
  };

  const buckets = useMemo(() => agruparMesSemana(arquivados, (r) => r.data), [arquivados]);

  return (
    <div>
      <PageHeader title="Relatório de Faturamento por Empresa" description="Agrupa extras À Cobrar pela empresa do colaborador. Filtros listam apenas registros com extras no período." />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4 rounded-md border p-3 bg-card items-end">
        <div><Label className="text-xs">Mês</Label>
          <Select value={mesRef} onValueChange={onChangeMes}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{mesesOpts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Semana</Label>
          <Select value={semana} onValueChange={setSemana}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Mês inteiro</SelectItem>
              {semanasOpts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Empresa</Label>
          <Select value={empresa || "_all"} onValueChange={(v) => setEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas ({opts.empresas.length})</SelectItem>{opts.empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Cliente</Label>
          <Select value={cliente || "_all"} onValueChange={(v) => setCliente(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos ({opts.clientes.length})</SelectItem>{opts.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { setEmpresa(""); setCliente(""); }}>Limpar</Button>
          <Button size="sm" variant="outline" onClick={() => exportarExcel(`faturamento-${de}-${ate}.xlsx`, "Faturamento", excelCols, rows)} disabled={!rows.length}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
          </Button>
          <Button size="sm" variant="outline" onClick={gerarPdf} disabled={!grupos.length}>
            <FileDown className="h-4 w-4 mr-1" />PDF
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["pendentes"]} className="space-y-2">
        <AccordionItem value="pendentes" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Pendentes — aguardando faturamento ({pendentes.length})
          </AccordionTrigger>
          <AccordionContent>{renderGrupos(pendentes, "Nenhum registro pendente")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="arquivados" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Arquivos fechados — já faturados ({arquivados.length})
          </AccordionTrigger>
          <AccordionContent>
            {!buckets.length
              ? <div className="text-sm text-muted-foreground py-3">Nenhum registro faturado</div>
              : (
                <Accordion type="multiple" className="space-y-2">
                  {buckets.map((mes) => {
                    const tot = mes.semanas.reduce((s, w) => s + w.rows.length, 0);
                    return (
                      <AccordionItem key={mes.key} value={mes.key} className="border rounded-md bg-muted/30 px-3">
                        <AccordionTrigger className="text-sm">{mes.label} ({tot})</AccordionTrigger>
                        <AccordionContent>
                          <Accordion type="multiple" className="space-y-2">
                            {mes.semanas.map((sb) => (
                              <AccordionItem key={sb.key} value={sb.key} className="border rounded-md bg-card px-3">
                                <AccordionTrigger className="text-sm">{sb.label} ({sb.rows.length})</AccordionTrigger>
                                <AccordionContent>{renderGrupos(sb.rows, "—")}</AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-3 text-right text-base font-bold">Total Geral Faturamento: {formatBRL(totalGeral)}</div>
    </div>
  );
}
