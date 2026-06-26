import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Printer, FileDown, Eye, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/extenso";
import { ReciboA4, type ReciboView } from "@/components/recibos/ReciboA4";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { loadReciboViews } from "@/lib/recibos-views";
import { desarquivarRecibo, gerarRecibosPendentes, auditarInconsistencias } from "@/lib/recibos.functions";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { extrairRecibadasSet, filtrarNaoRecibadas, type ReciboItemRow } from "@/lib/recibos-filter";

export const Route = createFileRoute("/_authenticated/relatorios/recibos")({ component: Page });

type Row = {
  id: string; numero: number; semana_ref: string; data_pagamento: string;
  valor_total: number; ativo: boolean; arquivado_em: string; colaborador_id: string;
  colaboradores?: { nome: string; matricula?: string; empresa_id?: string;
    empresas?: { id: string; nome: string }; funcoes?: { nome: string } };
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const desarquivar = useServerFn(desarquivarRecibo);
  const gerarPendentes = useServerFn(gerarRecibosPendentes);
  const [gerando, setGerando] = useState(false);
  const [dataPagPend, setDataPagPend] = useState(new Date().toISOString().slice(0, 10));

  const handleGerarPendentes = async () => {
    if (!confirm("Gerar recibos para TODAS as extras aprovadas/pagas ainda sem recibo? Para semanas com recibo ativo, os itens faltantes serão anexados.")) return;
    setGerando(true);
    try {
      const res = await gerarPendentes({ data: { data_pagamento: dataPagPend } });
      toast.success(`${res.criados} recibo(s) criado(s), ${res.anexados ?? 0} anexado(s). ${res.erros?.length ? "Erros: " + res.erros.length : ""}`);
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
    finally { setGerando(false); }
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const [mesRef, setMesRef] = useState(hoje.slice(0, 7)); // YYYY-MM
  const [semana, setSemana] = useState<string>("_all"); // "_all" = mês todo, ou YYYY-MM-DD da sexta
  const [fColab, setFColab] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fStatus] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [printViews, setPrintViews] = useState<ReciboView[]>([]);
  const [apenasNaoRecibadas, setApenasNaoRecibadas] = useState(true);
  // Período de DATA DO SERVIÇO (extras.data) — independente do mês/semana dos recibos
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const [lancDe, setLancDe] = useState(primeiroDoMes);
  const [lancAte, setLancAte] = useState(hoje);


  const MESES_NOMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const mesesOpts = useMemo(() => {
    const out: { v: string; l: string }[] = [];
    const now = new Date();
    for (let i = 1; i >= -12; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ v, l: `${MESES_NOMES[d.getMonth()]}/${d.getFullYear()}` });
    }
    return out;
  }, []);
  const semanasOpts = useMemo(() => {
    if (!mesRef) return [] as { v: string; l: string }[];
    const [yy, mm] = mesRef.split("-").map(Number);
    const out: { v: string; l: string }[] = [];
    const ini = new Date(Date.UTC(yy, mm - 1, 1)); ini.setUTCDate(ini.getUTCDate() - 7);
    const fim = new Date(Date.UTC(yy, mm, 7));
    const ORD = ["1ª","2ª","3ª","4ª","5ª","6ª"];
    let ord = 0;
    for (let d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() !== 5) continue;
      const wed = new Date(d); wed.setUTCDate(wed.getUTCDate() + 5);
      if (wed.getUTCFullYear() !== yy || wed.getUTCMonth() !== mm - 1) continue;
      out.push({ v: d.toISOString().slice(0, 10), l: `${ORD[ord] ?? `${ord + 1}ª`} Semana` });
      ord++;
    }
    return out;
  }, [mesRef]);
  // Período efetivo (de/ate) deriva de mês + semana
  const { de, ate } = useMemo(() => {
    if (semana && semana !== "_all") return { de: semana, ate: semana };
    if (semanasOpts.length) return { de: semanasOpts[0].v, ate: semanasOpts[semanasOpts.length - 1].v };
    return { de: hoje, ate: hoje };
  }, [semana, semanasOpts, hoje]);
  const onChangeMes = (v: string) => { setMesRef(v); setSemana("_all"); };

  // Recibos no período (por semana_ref). Inclui dados de empresa do colaborador.
  const list = useQuery({
    queryKey: ["recibos-arquivados", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recibos")
        .select("id,numero,semana_ref,data_pagamento,valor_total,ativo,arquivado_em,colaborador_id,colaboradores(nome,matricula,empresa_id,empresas(id,nome),funcoes(nome))")
        .gte("semana_ref", de)
        .lte("semana_ref", ate)
        .order("semana_ref", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Mapa recibo -> Set<cliente_id> via recibos_itens
  const clientesMap = useQuery({
    queryKey: ["recibos-arquivados-clientes", (list.data ?? []).map((r) => r.id)],
    enabled: !!list.data?.length,
    queryFn: async () => {
      const ids = (list.data ?? []).map((r) => r.id);
      const { data } = await supabase.from("recibos_itens")
        .select("recibo_id, extras(cliente_id, clientes(id,nome_fantasia))")
        .in("recibo_id", ids);
      const map: Record<string, Set<string>> = {};
      const nomes = new Map<string, string>();
      type ItemRow = { recibo_id: string; extras: { cliente_id: string; clientes?: { id: string; nome_fantasia: string } } | null };
      for (const it of (data ?? []) as ItemRow[]) {
        if (!it.extras?.cliente_id) continue;
        (map[it.recibo_id] ||= new Set()).add(it.extras.cliente_id);
        if (it.extras.clientes) nomes.set(it.extras.clientes.id, it.extras.clientes.nome_fantasia);
      }
      return { map, nomes };
    },
  });

  // Opções dinâmicas — apenas itens presentes no período
  const opts = useMemo(() => {
    const empresas = new Map<string, string>();
    const colabs = new Map<string, string>();
    for (const r of list.data ?? []) {
      if (r.colaboradores?.empresas) empresas.set(r.colaboradores.empresas.id, r.colaboradores.empresas.nome);
      if (r.colaboradores) colabs.set(r.colaborador_id, r.colaboradores.nome);
    }
    const clientes = [...(clientesMap.data?.nomes ?? new Map()).entries()].map(([id, nome]) => ({ id: id as string, nome: nome as string }));
    const sort = (arr: { id: string; nome: string }[]) => arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return {
      empresas: sort([...empresas.entries()].map(([id, nome]) => ({ id, nome }))),
      colabs: sort([...colabs.entries()].map(([id, nome]) => ({ id, nome }))),
      clientes: sort(clientes),
    };
  }, [list.data, clientesMap.data]);

  const filtrados = useMemo(() => (list.data ?? []).filter((r) => {
    if (fColab && r.colaborador_id !== fColab) return false;
    if (fEmpresa && r.colaboradores?.empresa_id !== fEmpresa) return false;
    // recibos cancelados são excluídos definitivamente
    if (fCliente) {
      const set = clientesMap.data?.map[r.id];
      if (!set || !set.has(fCliente)) return false;
    }
    return true;
  }), [list.data, fColab, fEmpresa, fStatus, fCliente, clientesMap.data]);
  const pendentes = useMemo(() => filtrados.filter((r) => !r.arquivado_em), [filtrados]);
  const arquivados = useMemo(() => filtrados.filter((r) => !!r.arquivado_em), [filtrados]);

  const printQuery = useQuery({
    queryKey: ["recibos-arquivados-print", filtrados.map((r) => r.id).join(",")],
    enabled: filtrados.length > 0,
    staleTime: 30000,
    queryFn: () => loadReciboViews(filtrados.map((r) => r.id)),
  });

  // Extras por DATA DO SERVIÇO (extras.data) + flag "recibada"
  type ExtraRow = { id: string; data: string; semana_ref: string; valor: number; created_at: string; status: string; situacao_financeira: string | null; colaborador_id: string; colaboradores: { nome: string } | null };
  const extrasNoPeriodo = useQuery({
    queryKey: ["relatorio-extras-recibos-data", lancDe, lancAte],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extras")
        .select("id, data, semana_ref, valor, created_at, status, situacao_financeira, colaborador_id, colaboradores!colaborador_id(nome)")
        .gte("data", lancDe).lte("data", lancAte)
        .eq("status", "aprovado_financeiro")
        .eq("situacao_financeira", "pago")
        .order("data");
      if (error) throw new Error(`Falha ao carregar extras: ${error.message}`);
      const rows = ((data ?? []) as unknown) as ExtraRow[];
      if (!rows.length) return { rows: [] as ExtraRow[], recibadas: new Set<string>() };
      const { data: ja } = await supabase
        .from("recibos_itens")
        .select("extra_id, recibos!inner(ativo)")
        .in("extra_id", rows.map((r) => r.id))
        .eq("recibos.ativo", true);
      const recibadas = extrairRecibadasSet((ja ?? []) as ReciboItemRow[]);
      return { rows, recibadas };
    },
  });
  const extrasFiltradas = useMemo(() => {
    const { rows = [], recibadas = new Set<string>() } = extrasNoPeriodo.data ?? {};
    return filtrarNaoRecibadas(rows, recibadas, apenasNaoRecibadas).map((r) => ({ ...r, _recibada: recibadas.has(r.id) }));
  }, [extrasNoPeriodo.data, apenasNaoRecibadas]);


  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const todosSel = filtrados.length > 0 && filtrados.every((r) => selected[r.id]);
  const preparandoPrint = printQuery.isLoading || printQuery.isFetching;

  const handleImprimir = (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    const byId = new Map((printQuery.data ?? []).map((r) => [r.id, r]));
    const views = ids.map((id) => byId.get(id)).filter(Boolean) as ReciboView[];
    if (views.length !== ids.length) return toast.error("Aguarde os recibos carregarem para impressão");
    flushSync(() => setPrintViews(views));
    window.focus();
    window.print();
  };
  const handlePdf = async (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    try {
      const views = await loadReciboViews(ids);
      await gerarPdfRecibos(views, `recibos-arquivados-${hoje}.pdf`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const handleDesarquivar = async (id: string) => {
    try {
      await desarquivar({ data: { reciboId: id } });
      toast.success("Recibo desarquivado");
      qc.invalidateQueries({ queryKey: ["recibos-arquivados"] });
      qc.invalidateQueries({ queryKey: ["recibos"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const cols: ColunaRelatorio[] = [
    { key: "numero", label: "Nº", width: 18 },
    { key: "colaborador", label: "Colaborador", width: 50 },
    { key: "empresa", label: "Empresa", width: 35 },
    { key: "semana_ref", label: "Semana", width: 25 },
    { key: "data_pagamento", label: "Pago em", width: 25 },
    { key: "valor_fmt", label: "Valor", align: "right", width: 25 },
    { key: "arquivado_em", label: "Arquivado em", width: 30 },
    { key: "status", label: "Status", width: 22 },
  ];
  const exportRows = filtrados.map((r) => ({
    numero: r.numero,
    colaborador: r.colaboradores?.nome ?? "",
    empresa: r.colaboradores?.empresas?.nome ?? "",
    semana_ref: r.semana_ref,
    data_pagamento: r.data_pagamento,
    valor_fmt: formatBRL(r.valor_total),
    arquivado_em: r.arquivado_em?.slice(0, 16).replace("T", " "),
    status: r.ativo ? "Ativo" : "Cancelado",
  }));
  const totalValor = filtrados.reduce((s, r) => s + Number(r.valor_total), 0);

  const limpar = () => { setFColab(""); setFEmpresa(""); setFCliente(""); };

  return (
    <div>
      <div className="hidden print:block">
        {printViews.length ? <ReciboA4 recibos={printViews} /> : null}
      </div>
      <div className="print:hidden">
      <PageHeader title="Relatório de Recibos" description="Recibos já impressos / exportados (arquivados). Filtros mostram apenas registros com recibos no período." />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div>
          <Label className="text-xs">Mês</Label>
          <Select value={mesRef} onValueChange={onChangeMes}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{mesesOpts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Semana</Label>
          <Select value={semana} onValueChange={setSemana}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Mês inteiro</SelectItem>
              {semanasOpts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Empresa</Label>
          <Select value={fEmpresa || "_all"} onValueChange={(v) => setFEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas ({opts.empresas.length})</SelectItem>{opts.empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Cliente</Label>
          <Select value={fCliente || "_all"} onValueChange={(v) => setFCliente(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos ({opts.clientes.length})</SelectItem>{opts.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Colaborador</Label>
          <Select value={fColab || "_all"} onValueChange={(v) => setFColab(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos ({opts.colabs.length})</SelectItem>{opts.colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="hidden" />
        <div className="flex items-end">
          <Button size="sm" variant="outline" onClick={limpar}>Limpar</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => handleImprimir(selectedIds)} disabled={!selectedIds.length || preparandoPrint}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Selecionados ({selectedIds.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => handlePdf(selectedIds)} disabled={!selectedIds.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Selecionados
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" onClick={() => handleImprimir(filtrados.map((r) => r.id))} disabled={!filtrados.length || preparandoPrint}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Filtrados ({filtrados.length})
        </Button>
        <Button size="sm" onClick={() => handlePdf(filtrados.map((r) => r.id))} disabled={!filtrados.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Filtrados
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" variant="outline" onClick={() => exportarExcel(`recibos-${de}-${ate}.xlsx`, "Recibos", cols, exportRows)} disabled={!exportRows.length}>
          Excel (lista)
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportarPdf(`recibos-lista-${de}-${ate}.pdf`, "Relatório de Recibos Arquivados", cols, exportRows, ["", "", "", "", "TOTAL", formatBRL(totalValor), "", ""])} disabled={!exportRows.length}>
          PDF (lista)
        </Button>
      </div>

      {(() => {
        const renderRow = (r: Row) => (
          <TableRow key={r.id}>
            <TableCell><Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))} /></TableCell>
            <TableCell>{r.numero}</TableCell>
            <TableCell>{r.colaboradores?.nome}<div className="text-xs text-muted-foreground">{r.colaboradores?.matricula} - {r.colaboradores?.funcoes?.nome}</div></TableCell>
            <TableCell>{r.colaboradores?.empresas?.nome}</TableCell>
            <TableCell>{r.semana_ref}</TableCell>
            <TableCell>{r.data_pagamento}</TableCell>
            <TableCell className="text-xs">{r.arquivado_em?.slice(0, 16).replace("T", " ") ?? "—"}</TableCell>
            <TableCell className="text-right">{formatBRL(r.valor_total)}</TableCell>
            <TableCell><Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Ativo" : "Cancelado"}</Badge></TableCell>
            <TableCell>
              <div className="flex gap-1 justify-end">
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/recibos/imprimir", search: { ids: r.id, action: "preview" } })} title="Visualizar"><Eye className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" onClick={() => handleImprimir([r.id])} disabled={preparandoPrint} title="Imprimir"><Printer className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" onClick={() => handlePdf([r.id])} title="PDF"><FileDown className="h-3 w-3" /></Button>
                {r.arquivado_em && <Button size="sm" variant="ghost" onClick={() => handleDesarquivar(r.id)} title="Desarquivar"><Undo2 className="h-3 w-3" /></Button>}
              </div>
            </TableCell>
          </TableRow>
        );
        const tabela = (rows: Row[], emptyMsg: string) => (
          <div className="rounded-md border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"><Checkbox checked={rows.length > 0 && rows.every((r) => selected[r.id])} onCheckedChange={(v) => {
                  const next = { ...selected }; rows.forEach((r) => { next[r.id] = !!v; }); setSelected(next);
                }} /></TableHead>
                <TableHead>Nº</TableHead><TableHead>Colaborador</TableHead><TableHead>Empresa</TableHead>
                <TableHead>Semana</TableHead><TableHead>Pago em</TableHead><TableHead>Arquivado em</TableHead>
                <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map(renderRow)}
                {!rows.length && <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">{emptyMsg}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        );
        return (
          <Accordion type="multiple" defaultValue={["extras-pendentes", "pendentes"]} className="space-y-2">
            <AccordionItem value="extras-pendentes" className="border rounded-md bg-card px-3">
              <AccordionTrigger className="text-sm font-semibold">
                Extras pendentes de recibo no período ({extrasFiltradas.filter((r) => !r._recibada).length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-xs text-muted-foreground mb-2">
                  Serão considerados apenas lançamentos cadastrados neste período e ainda não recibados.
                </div>
                <div className="flex flex-wrap items-end gap-2 mb-2">
                  <div><Label className="text-xs">Data do serviço — de</Label><Input type="date" value={lancDe} onChange={(e) => setLancDe(e.target.value)} /></div>
                  <div><Label className="text-xs">até</Label><Input type="date" value={lancAte} onChange={(e) => setLancAte(e.target.value)} /></div>
                  <div className="flex items-center gap-2 ml-2">
                    <Checkbox id="naorec" checked={apenasNaoRecibadas} onCheckedChange={(v) => setApenasNaoRecibadas(!!v)} />
                    <Label htmlFor="naorec" className="text-xs cursor-pointer">Somente extras ainda não recibadas</Label>
                  </div>
                  <div className="ml-auto flex items-end gap-2">
                    <div>
                      <Label className="text-xs">Data de pagamento</Label>
                      <Input type="date" value={dataPagPend} onChange={(e) => setDataPagPend(e.target.value)} />
                    </div>
                    <Button size="sm" onClick={handleGerarPendentes} disabled={gerando}>
                      {gerando ? "Gerando..." : "Gerar recibos pendentes"}
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Lançado em</TableHead><TableHead>Data do serviço</TableHead><TableHead>Colaborador</TableHead><TableHead>Semana original</TableHead>
                      <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {extrasFiltradas.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{r.created_at?.slice(0, 16).replace("T", " ")}</TableCell>
                          <TableCell>{r.data}</TableCell>
                          <TableCell>{r.colaboradores?.nome ?? "—"}</TableCell>
                          <TableCell>{r.semana_ref}</TableCell>
                          <TableCell className="text-right">{formatBRL(r.valor)}</TableCell>
                          <TableCell><Badge variant={r._recibada ? "secondary" : "default"}>{r._recibada ? "Já recibada" : "Pendente de recibo"}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {!extrasFiltradas.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhuma extra lançada neste período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="pendentes" className="border rounded-md bg-card px-3">

              <AccordionTrigger className="text-sm font-semibold">
                Pendentes — não impressos / sem PDF ({pendentes.length})
              </AccordionTrigger>
              <AccordionContent>{tabela(pendentes, "Nenhum recibo pendente")}</AccordionContent>
            </AccordionItem>
            <AccordionItem value="arquivados" className="border rounded-md bg-card px-3">
              <AccordionTrigger className="text-sm font-semibold">
                Arquivos fechados — já impressos / PDF gerado ({arquivados.length})
              </AccordionTrigger>
              <AccordionContent>
                {(() => {
                  if (!arquivados.length) return <div className="text-sm text-muted-foreground py-3">Nenhum recibo arquivado</div>;
                  // Agrupa por mês (quarta de referência = sexta + 5) e dentro por semana (ordinal no mês)
                  const MES_NM = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
                  type Bucket = { key: string; label: string; semanas: Map<string, { label: string; rows: Row[] }> };
                  const meses = new Map<string, Bucket>();
                  // Para cada mês precisamos saber a ordem das sextas (ordinal) -> mapa por mês
                  const ordinalCache = new Map<string, Map<string, number>>();
                  for (const r of arquivados) {
                    const [y, m, d] = r.semana_ref.split("-").map(Number);
                    const sexta = new Date(Date.UTC(y, m - 1, d));
                    const wed = new Date(sexta); wed.setUTCDate(wed.getUTCDate() + 5);
                    const yy = wed.getUTCFullYear(); const mm = wed.getUTCMonth();
                    const mesKey = `${yy}-${String(mm + 1).padStart(2, "0")}`;
                    let bucket = meses.get(mesKey);
                    if (!bucket) {
                      bucket = { key: mesKey, label: `${MES_NM[mm]}/${yy}`, semanas: new Map() };
                      meses.set(mesKey, bucket);
                    }
                    // calcular ordinal da sexta no mês
                    let ordMap = ordinalCache.get(mesKey);
                    if (!ordMap) {
                      ordMap = new Map();
                      const ini = new Date(Date.UTC(yy, mm, 1)); ini.setUTCDate(ini.getUTCDate() - 7);
                      const fim = new Date(Date.UTC(yy, mm + 1, 7));
                      let o = 0;
                      for (let dd = new Date(ini); dd <= fim; dd.setUTCDate(dd.getUTCDate() + 1)) {
                        if (dd.getUTCDay() !== 5) continue;
                        const w = new Date(dd); w.setUTCDate(w.getUTCDate() + 5);
                        if (w.getUTCFullYear() !== yy || w.getUTCMonth() !== mm) continue;
                        ordMap.set(dd.toISOString().slice(0, 10), o++);
                      }
                      ordinalCache.set(mesKey, ordMap);
                    }
                    const ord = ordMap.get(r.semana_ref) ?? 0;
                    const ORD = ["1ª","2ª","3ª","4ª","5ª","6ª"];
                    const semKey = r.semana_ref;
                    let semBucket = bucket.semanas.get(semKey);
                    if (!semBucket) {
                      semBucket = { label: `${ORD[ord] ?? `${ord + 1}ª`} Semana (${r.semana_ref})`, rows: [] };
                      bucket.semanas.set(semKey, semBucket);
                    }
                    semBucket.rows.push(r);
                  }
                  const mesesOrd = [...meses.values()].sort((a, b) => b.key.localeCompare(a.key));
                  return (
                    <Accordion type="multiple" className="space-y-2">
                      {mesesOrd.map((mes) => {
                        const total = [...mes.semanas.values()].reduce((s, w) => s + w.rows.length, 0);
                        const semOrd = [...mes.semanas.entries()].sort((a, b) => b[0].localeCompare(a[0]));
                        return (
                          <AccordionItem key={mes.key} value={mes.key} className="border rounded-md bg-muted/30 px-3">
                            <AccordionTrigger className="text-sm">{mes.label} ({total})</AccordionTrigger>
                            <AccordionContent>
                              <Accordion type="multiple" className="space-y-2">
                                {semOrd.map(([sk, sb]) => (
                                  <AccordionItem key={sk} value={sk} className="border rounded-md bg-card px-3">
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
                  );
                })()}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })()}
      <div className="mt-3 text-right text-sm font-semibold">Total: {formatBRL(totalValor)} — {filtrados.length} recibo(s)</div>
      </div>
    </div>
  );
}
