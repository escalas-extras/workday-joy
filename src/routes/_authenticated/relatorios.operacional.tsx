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
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { SITUACAO_SERVICO_LABEL, STATUS_LABEL, SIT_FIN_LABEL } from "@/components/extras-helpers";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { buildMesesOpts, buildSemanasOpts, derivePeriodo, agruparMesSemana } from "@/lib/semana-buckets";

export const Route = createFileRoute("/_authenticated/relatorios/operacional")({ component: Page });

type ExtraRow = {
  id: string; data: string; hora_inicio: string; hora_termino: string;
  valor: number; classificacao_comercial: string; situacao_servico: string;
  status: string; situacao_financeira: string | null;
  cliente_id: string; colaborador_id: string; funcao_id: string; empresa_id: string | null;
  clientes?: { nome_fantasia: string; cliente_empresas?: Array<{ situacao: string; empresas?: { id: string; nome: string } | null }> };
  empresas?: { id: string; nome: string } | null;
  colaboradores?: { id: string; nome: string; empresas?: { id: string; nome: string } | null };
  coberto?: { nome: string };
  funcoes?: { id: string; nome: string };
};

function Page() {
  const [mesRef, setMesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [semana, setSemana] = useState<string>("_all");
  const [cliente, setCliente] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [colab, setColab] = useState("");
  const [funcao, setFuncao] = useState("");
  const [situacao, setSituacao] = useState("");

  const mesesOpts = useMemo(() => buildMesesOpts(), []);
  const semanasOpts = useMemo(() => buildSemanasOpts(mesRef), [mesRef]);
  const { de, ate } = useMemo(() => derivePeriodo(mesRef, semana, semanasOpts), [mesRef, semana, semanasOpts]);
  const onChangeMes = (v: string) => { setMesRef(v); setSemana("_all"); };

  const q = useQuery({
    queryKey: ["rel-operacional", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select(
          "id,data,hora_inicio,hora_termino,valor,classificacao_comercial,situacao_servico,status,situacao_financeira," +
          "cliente_id,colaborador_id,funcao_id,empresa_id," +
          "clientes(nome_fantasia,cliente_empresas(situacao,empresas(id,nome)))," +
          "empresas(id,nome)," +
          "colaboradores!colaborador_id(id,nome,empresas(id,nome))," +
          "coberto:colaboradores!colaborador_coberto_id(nome)," +
          "funcoes(id,nome)"
        )
        .gte("data", de).lte("data", ate)
        .order("data");
      if (error) throw error;
      return (data ?? []) as unknown as ExtraRow[];
    },
  });

  const isVigilante = (r: ExtraRow) => /vigilante/i.test(r.funcoes?.nome ?? "");
  const isJSP = (nome: string) => /\bjsp\b/i.test(nome);
  const JA_ID = "067e9a1f-18de-45b3-afa1-d57dc6a12a40";
  const remapAvulso = (e: { id: string; nome: string } | null): { id: string; nome: string } | null =>
    e && /^avulso$/i.test(e.nome) ? { id: JA_ID, nome: "J.A" } : e;
  const empresaDeRaw = (r: ExtraRow): { id: string; nome: string } | null => {
    if (r.empresas) return r.empresas;
    const todas = (r.clientes?.cliente_empresas ?? []).filter((ce) => ce.empresas).map((ce) => ce.empresas!);
    const ativas = (r.clientes?.cliente_empresas ?? []).filter((ce) => ce.situacao === "ativo" && ce.empresas).map((ce) => ce.empresas!);
    const lista = ativas.length ? ativas : todas;
    if (lista.length === 1) return lista[0];
    if (lista.length > 1) {
      if (isVigilante(r)) { const jsp = lista.find((e) => isJSP(e.nome)); if (jsp) return jsp; }
      else { const naoJsp = lista.find((e) => !isJSP(e.nome)); if (naoJsp) return naoJsp; }
      return lista[0];
    }
    if (r.colaboradores?.empresas) return r.colaboradores.empresas;
    return null;
  };
  const empresaDe = (r: ExtraRow) => remapAvulso(empresaDeRaw(r));

  const opts = useMemo(() => {
    const empresas = new Map<string, string>();
    const clientes = new Map<string, string>();
    const colabs = new Map<string, string>();
    const funcoes = new Map<string, string>();
    for (const r of q.data ?? []) {
      const emp = empresaDe(r);
      if (emp) empresas.set(emp.id, emp.nome);
      if (r.clientes) clientes.set(r.cliente_id, r.clientes.nome_fantasia);
      if (r.colaboradores) colabs.set(r.colaborador_id, r.colaboradores.nome);
      if (r.funcoes) funcoes.set(r.funcao_id, r.funcoes.nome);
    }
    const sort = (m: Map<string, string>) =>
      [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nome]) => ({ id, nome }));
    return { empresas: sort(empresas), clientes: sort(clientes), colabs: sort(colabs), funcoes: sort(funcoes) };
  }, [q.data]);

  const filtrados = useMemo(() => (q.data ?? []).filter((r) => {
    if (cliente && r.cliente_id !== cliente) return false;
    if (empresa) { const emp = empresaDe(r); if (!emp || emp.id !== empresa) return false; }
    if (colab && r.colaborador_id !== colab) return false;
    if (funcao && r.funcao_id !== funcao) return false;
    if (situacao) { if (r.status !== situacao && r.situacao_financeira !== situacao) return false; }
    return true;
  }), [q.data, cliente, empresa, colab, funcao, situacao]);

  // Pendentes vs Fechados (após manipulação): pago / faturado / cancelado
  const isFechado = (r: ExtraRow) =>
    r.status === "cancelado" || r.situacao_financeira === "pago" || r.situacao_financeira === "faturado";
  const pendentes = useMemo(() => filtrados.filter((r) => !isFechado(r)), [filtrados]);
  const arquivados = useMemo(() => filtrados.filter(isFechado), [filtrados]);

  const toRow = (r: ExtraRow) => ({
    data: r.data,
    cliente: r.clientes?.nome_fantasia ?? "",
    empresa: empresaDe(r)?.nome ?? "—",
    colaborador: r.colaboradores?.nome ?? "",
    funcao: r.funcoes?.nome ?? "",
    horario: `${r.hora_inicio?.slice(0, 5) ?? ""} - ${r.hora_termino?.slice(0, 5) ?? ""}`,
    valor: Number(r.valor),
    valor_fmt: formatBRL(r.valor),
    classificacao: r.classificacao_comercial === "a_cobrar" ? "À Cobrar" : "Contrato",
    situacao_serv: SITUACAO_SERVICO_LABEL[r.situacao_servico] ?? r.situacao_servico ?? "",
    coberto: r.coberto?.nome ?? "",
    status: STATUS_LABEL[r.status] ?? r.status,
    sit_fin: r.situacao_financeira ? (SIT_FIN_LABEL[r.situacao_financeira] ?? r.situacao_financeira) : "—",
  });
  const rowsAll = useMemo(() => filtrados.map(toRow), [filtrados]);
  const total = rowsAll.reduce((s, r) => s + r.valor, 0);

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 38 },
    { key: "empresa", label: "Empresa", width: 28 },
    { key: "colaborador", label: "Colaborador", width: 34 },
    { key: "funcao", label: "Função", width: 22 },
    { key: "horario", label: "Horário", width: 22 },
    { key: "situacao_serv", label: "Tipo Serviço", width: 26 },
    { key: "status", label: "Status", width: 22 },
    { key: "sit_fin", label: "Financeiro", width: 22 },
    { key: "valor_fmt", label: "Valor", align: "right", width: 22 },
    { key: "classificacao", label: "Classif.", width: 18 },
  ];

  const tabela = (rs: ExtraRow[], emptyMsg: string) => {
    const rows = rs.map(toRow);
    return (
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead>
            <TableHead>Colaborador</TableHead><TableHead>Função</TableHead><TableHead>Horário</TableHead>
            <TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Financeiro</TableHead>
            <TableHead className="text-right">Valor</TableHead><TableHead>Classif.</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.empresa}</TableCell>
                <TableCell>{r.colaborador}</TableCell><TableCell>{r.funcao}</TableCell><TableCell>{r.horario}</TableCell>
                <TableCell>{r.situacao_serv}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.sit_fin}</TableCell>
                <TableCell className="text-right">{r.valor_fmt}</TableCell><TableCell>{r.classificacao}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">{emptyMsg}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    );
  };

  const buckets = useMemo(() => agruparMesSemana(arquivados, (r) => r.data), [arquivados]);
  const limpar = () => { setCliente(""); setEmpresa(""); setColab(""); setFuncao(""); setSituacao(""); };

  return (
    <div>
      <PageHeader title="Relatório Operacional" description="Extras por período. Filtros mostram apenas registros com lançamentos no período selecionado." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 rounded-md border p-3 bg-card">
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
        <div><Label className="text-xs">Colaborador</Label>
          <Select value={colab || "_all"} onValueChange={(v) => setColab(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos ({opts.colabs.length})</SelectItem>{opts.colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Cargo</Label>
          <Select value={funcao || "_all"} onValueChange={(v) => setFuncao(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos ({opts.funcoes.length})</SelectItem>{opts.funcoes.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Situação</Label>
          <Select value={situacao || "_all"} onValueChange={(v) => setSituacao(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="aprovado_operacional">Aprov. Operacional</SelectItem>
              <SelectItem value="aprovado_financeiro">Aprov. Financeiro</SelectItem>
              <SelectItem value="rejeitado">Rejeitado</SelectItem>
              <SelectItem value="pendente_pagamento">Pend. Pagamento</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="faturado">Faturado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <Button size="sm" variant="outline" onClick={limpar}>Limpar</Button>
          <Button size="sm" variant="outline" onClick={() => exportarExcel(`operacional-${de}-${ate}.xlsx`, "Operacional", cols, rowsAll)} disabled={!rowsAll.length}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportarPdf(`operacional-${de}-${ate}.pdf`, "Relatório Operacional", cols, rowsAll, ["", "", "", "", "", "", "", "", "TOTAL", formatBRL(total), ""])} disabled={!rowsAll.length}>
            <FileDown className="h-4 w-4 mr-1" />PDF
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["pendentes"]} className="space-y-2">
        <AccordionItem value="pendentes" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Pendentes — aguardando processamento ({pendentes.length})
          </AccordionTrigger>
          <AccordionContent>{tabela(pendentes, "Nenhum registro pendente")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="arquivados" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Arquivos fechados — pago / faturado / cancelado ({arquivados.length})
          </AccordionTrigger>
          <AccordionContent>
            {!buckets.length
              ? <div className="text-sm text-muted-foreground py-3">Nenhum registro fechado</div>
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
                                <AccordionContent>{tabela(sb.rows, "—")}</AccordionContent>
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

      <div className="mt-3 text-right text-sm font-semibold">Total: {formatBRL(total)} — {rowsAll.length} registro(s)</div>
    </div>
  );
}
