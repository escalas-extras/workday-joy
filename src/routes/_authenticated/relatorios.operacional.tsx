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
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios/operacional")({ component: Page });

function Page() {
  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(mesAtras);
  const [ate, setAte] = useState(hoje);
  const [cliente, setCliente] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [colab, setColab] = useState("");

  const clientes = useQuery({ queryKey: ["op-clientes"], queryFn: async () => (await supabase.from("clientes").select("id,nome_fantasia").order("nome_fantasia")).data ?? [] });
  const empresas = useQuery({ queryKey: ["op-empresas"], queryFn: async () => (await supabase.from("empresas").select("id,nome").order("nome")).data ?? [] });
  const colabs = useQuery({ queryKey: ["op-colabs"], queryFn: async () => (await supabase.from("colaboradores").select("id,nome").order("nome")).data ?? [] });
  const vincs = useQuery({ queryKey: ["op-cliente-empresas"], queryFn: async () => (await supabase.from("cliente_empresas").select("cliente_id,empresa_id,situacao,empresas(nome)").eq("situacao", "ativo")).data ?? [] });

  // cliente_id -> empresas[]
  const empPorCliente = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }[]>();
    for (const v of (vincs.data ?? []) as any[]) {
      const arr = m.get(v.cliente_id) ?? [];
      arr.push({ id: v.empresa_id, nome: v.empresas?.nome ?? "" });
      m.set(v.cliente_id, arr);
    }
    return m;
  }, [vincs.data]);

  // Clientes pertencentes à empresa selecionada
  const clienteIdsPorEmpresa = useMemo(() => {
    if (!empresa) return null;
    return new Set((vincs.data ?? []).filter((v: any) => v.empresa_id === empresa).map((v: any) => v.cliente_id));
  }, [vincs.data, empresa]);

  const q = useQuery({
    queryKey: ["rel-operacional", de, ate, cliente, empresa, colab, !!clienteIdsPorEmpresa],
    enabled: !empresa || !!vincs.data,
    queryFn: async () => {
      let qb = supabase.from("extras")
        .select("id,data,hora_inicio,hora_termino,valor,classificacao_comercial,cliente_id,clientes(nome_fantasia),colaboradores!colaborador_id(nome),funcoes(nome)")
        .gte("data", de).lte("data", ate)
        .order("data");
      if (cliente) qb = qb.eq("cliente_id", cliente);
      if (colab) qb = qb.eq("colaborador_id", colab);
      if (empresa) {
        const ids = [...(clienteIdsPorEmpresa ?? new Set<string>())];
        if (!ids.length) return [];
        qb = qb.in("cliente_id", ids);
      }
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => (q.data ?? []).map((r: any) => {
    const emps = empPorCliente.get(r.cliente_id) ?? [];
    const empNome = empresa ? (emps.find((e) => e.id === empresa)?.nome ?? "") : emps.map((e) => e.nome).join(", ");
    return {
      data: r.data,
      cliente: r.clientes?.nome_fantasia ?? "",
      colaborador: r.colaboradores?.nome ?? "",
      funcao: r.funcoes?.nome ?? "",
      horario: `${r.hora_inicio?.slice(0, 5) ?? ""} - ${r.hora_termino?.slice(0, 5) ?? ""}`,
      valor: Number(r.valor),
      valor_fmt: formatBRL(r.valor),
      classificacao: r.classificacao_comercial === "a_cobrar" ? "À Cobrar" : "Contrato",
      empresa: empNome || "—",
    };
  }), [q.data, empPorCliente, empresa]);

  const total = rows.reduce((s, r) => s + r.valor, 0);

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 45 },
    { key: "empresa", label: "Empresa", width: 35 },
    { key: "colaborador", label: "Colaborador", width: 40 },
    { key: "funcao", label: "Função", width: 30 },
    { key: "horario", label: "Horário", width: 25 },
    { key: "valor_fmt", label: "Valor", align: "right", width: 25 },
    { key: "classificacao", label: "Classificação", width: 25 },
  ];

  return (
    <div>
      <PageHeader title="Relatório Operacional" description="Extras por período, cliente, empresa e colaborador" />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div><Label className="text-xs">De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div><Label className="text-xs">Cliente</Label>
          <Select value={cliente || "_all"} onValueChange={(v) => setCliente(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos</SelectItem>{(clientes.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Empresa</Label>
          <Select value={empresa || "_all"} onValueChange={(v) => setEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas</SelectItem>{(empresas.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Colaborador</Label>
          <Select value={colab || "_all"} onValueChange={(v) => setColab(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos</SelectItem>{(colabs.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <Button size="sm" variant="outline" onClick={() => exportarExcel(`operacional-${de}-${ate}.xlsx`, "Operacional", cols, rows)}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportarPdf(`operacional-${de}-${ate}.pdf`, "Relatório Operacional", cols, rows, ["", "", "", "", "", "TOTAL", formatBRL(total), ""])}>
            <FileDown className="h-4 w-4 mr-1" />PDF
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead>
            <TableHead>Colaborador</TableHead><TableHead>Função</TableHead><TableHead>Horário</TableHead>
            <TableHead className="text-right">Valor</TableHead><TableHead>Classificação</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.empresa}</TableCell>
                <TableCell>{r.colaborador}</TableCell><TableCell>{r.funcao}</TableCell><TableCell>{r.horario}</TableCell>
                <TableCell className="text-right">{r.valor_fmt}</TableCell><TableCell>{r.classificacao}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 text-right text-sm font-semibold">Total: {formatBRL(total)}</div>
    </div>
  );
}
