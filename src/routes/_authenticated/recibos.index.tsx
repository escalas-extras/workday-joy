import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app-shell";
import {
  gerarRecibosPendentes, excluirRecibo, arquivarRecibos, previewExtrasPendentes,
  type PreviewPagamentoGrupo,
  type GeracaoRecibosResult,
} from "@/lib/recibos.functions";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, FilePlus, Eye, Printer, FileDown } from "lucide-react";
import { ReciboA4 } from "@/components/recibos/ReciboA4";
import { loadReciboViews } from "@/lib/recibos-views";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { formatBRL } from "@/lib/extenso";
import { extrairRecibadasSet, type ReciboItemRow } from "@/lib/recibos-filter";

export const Route = createFileRoute("/_authenticated/recibos/")({ component: Page });

type ReciboRow = {
  id: string; numero: number; semana_ref: string; data_pagamento: string;
  valor_total: number; ativo: boolean; colaborador_id: string; pagamento_id: string;
  arquivado_em?: string | null;
  pagamentos?: { referencia: string | null; data_pagamento: string } | null;
  colaboradores?: { nome: string; matricula?: string; empresa_id?: string;
    empresas?: { id: string; nome: string }; funcoes?: { nome: string } };
};

type VisibilidadeRecibos = "pendentes" | "arquivados" | "todos";

type ExtraPagaSemReciboRow = {
  id: string;
  data: string;
  valor: number;
  colaborador_id: string;
  cliente_id: string;
  empresa_id: string | null;
  colaboradores?: { nome: string } | null;
  clientes?: { nome_fantasia: string } | null;
  empresas?: { nome: string } | null;
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gerar = useServerFn(gerarRecibosPendentes);
  const previewPag = useServerFn(previewExtrasPendentes);
  const excluir = useServerFn(excluirRecibo);
  const arquivar = useServerFn(arquivarRecibos);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const primeiroDoMes = `${hojeISO.slice(0, 7)}-01`;
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [ultimaGeracao, setUltimaGeracao] = useState<{
    reciboIds: string[];
    reciboIdsCriados: string[];
    reciboIdsComplementados: string[];
  }>({ reciboIds: [], reciboIdsCriados: [], reciboIdsComplementados: [] });

  const [reDe, setReDe] = useState(primeiroDoMes);
  const [reAte, setReAte] = useState(hojeISO);

  const [fColab, setFColab] = useState<string>("");
  const [fCliente, setFCliente] = useState<string>("");
  const [fEmpresa, setFEmpresa] = useState<string>("");
  const [fVisibilidade, setFVisibilidade] = useState<VisibilidadeRecibos>("pendentes");

  const list = useQuery({
    queryKey: ["recibos", fVisibilidade],
    queryFn: async () => {
      let query = supabase
        .from("recibos")
        .select("*, pagamentos(referencia,data_pagamento), colaboradores(id,nome,matricula,empresa_id,empresas(id,nome),funcoes(nome))")
        .eq("ativo", true);
      if (fVisibilidade === "pendentes") query = query.is("arquivado_em", null);
      if (fVisibilidade === "arquivados") query = query.not("arquivado_em", "is", null);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as ReciboRow[]).sort((a, b) =>
        (a.colaboradores?.nome ?? "").localeCompare(
          b.colaboradores?.nome ?? "",
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
    },
  });

  const colabs = useQuery({
    queryKey: ["filter-colab"],
    queryFn: async () => (await supabase.from("colaboradores").select("id,nome").order("nome")).data ?? [],
  });
  const empresas = useQuery({
    queryKey: ["filter-empresas"],
    queryFn: async () => (await supabase.from("empresas").select("id,nome").order("nome")).data ?? [],
  });
  const clientes = useQuery({
    queryKey: ["filter-clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome_fantasia").order("nome_fantasia")).data ?? [],
  });

  const recibosClientesMap = useQuery({
    queryKey: ["recibos-clientes-map", (list.data ?? []).map((r) => r.id)],
    enabled: !!list.data?.length,
    queryFn: async () => {
      const ids = (list.data ?? []).map((r) => r.id);
      const { data } = await supabase.from("recibos_itens").select("recibo_id, extras(cliente_id)").in("recibo_id", ids);
      const map: Record<string, Set<string>> = {};
      for (const it of (data ?? []) as { recibo_id: string; extras: { cliente_id: string } | null }[]) {
        if (!it.extras?.cliente_id) continue;
        (map[it.recibo_id] ||= new Set()).add(it.extras.cliente_id);
      }
      return map;
    },
  });

  const extrasPagasSemRecibo = useQuery({
    queryKey: ["extras-pagas-sem-recibo"],
    queryFn: async () => {
      const { data: extras, error } = await supabase
        .from("extras")
        .select("id,data,valor,colaborador_id,cliente_id,empresa_id,colaboradores!colaborador_id(nome),clientes(nome_fantasia),empresas(nome)")
        .eq("status", "aprovado_financeiro")
        .eq("situacao_financeira", "pago")
        .order("data", { ascending: false });
      if (error) throw error;

      const rows = (extras ?? []) as unknown as ExtraPagaSemReciboRow[];
      if (!rows.length) return [];

      const recibadasSet = new Set<string>();
      const lote = 500;
      for (let i = 0; i < rows.length; i += lote) {
        const ids = rows.slice(i, i + lote).map((extra) => extra.id);
        const { data: recibadas, error: eRecibadas } = await supabase
          .from("recibos_itens")
          .select("extra_id, recibos!inner(ativo)")
          .in("extra_id", ids)
          .eq("recibos.ativo", true);
        if (eRecibadas) throw eRecibadas;
        for (const id of extrairRecibadasSet((recibadas ?? []) as ReciboItemRow[])) recibadasSet.add(id);
      }

      return rows.filter((extra) => !recibadasSet.has(extra.id));
    },
  });

  const filtrados = useMemo(() => {
    const rows = list.data ?? [];
    return rows.filter((r) => {
      if (fColab && r.colaborador_id !== fColab) return false;
      if (fEmpresa && r.colaboradores?.empresa_id !== fEmpresa) return false;
      if (fCliente) {
        const set = recibosClientesMap.data?.[r.id];
        if (!set || !set.has(fCliente)) return false;
      }
      return true;
    });
  }, [list.data, fColab, fEmpresa, fCliente, recibosClientesMap.data]);

  const extrasPagasSemReciboFiltradas = useMemo(() => {
    const rows = extrasPagasSemRecibo.data ?? [];
    return rows.filter((extra) => {
      if (fColab && extra.colaborador_id !== fColab) return false;
      if (fCliente && extra.cliente_id !== fCliente) return false;
      if (fEmpresa && extra.empresa_id !== fEmpresa) return false;
      return true;
    });
  }, [extrasPagasSemRecibo.data, fColab, fCliente, fEmpresa]);

  const totalExtrasPagasSemRecibo = extrasPagasSemReciboFiltradas.reduce(
    (total, extra) => total + Number(extra.valor),
    0,
  );

  const itens = useQuery({
    queryKey: ["recibo_itens", detalheId],
    queryFn: async () => detalheId
      ? (await supabase.from("recibos_itens").select("*, extras(data,semana_ref,hora_inicio,hora_termino,valor,cliente_id,clientes(nome_fantasia),empresas(nome))").eq("recibo_id", detalheId)).data ?? []
      : [],
    enabled: !!detalheId,
  });

  const recibosViewsQuery = useQuery({
    queryKey: ["recibos-preview", previewIds],
    enabled: !!previewIds?.length,
    queryFn: async () => loadReciboViews(previewIds ?? []),
  });

  const previewPendentesQuery = useQuery({
    queryKey: ["preview-extras-pendentes"],
    queryFn: () => previewPag({ data: {} }),
  });

  const pendentesGrupos = (previewPendentesQuery.data?.grupos ?? []) as PreviewPagamentoGrupo[];
  const qtdExtrasPendentes = pendentesGrupos.reduce((a, g) => a + g.qtd, 0);

  const mGerar = useMutation({
    mutationFn: () => gerar({ data: {} }),
    onSuccess: (r: GeracaoRecibosResult) => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      qc.invalidateQueries({ queryKey: ["preview-extras-pendentes"] });
      qc.invalidateQueries({ queryKey: ["extras-pagas-sem-recibo"] });
      if (r.emAndamento) toast.info(`${r.emAndamento} recibo(s) já em geração — aguarde a conclusão`);
      if (r.reciboIds.length) {
        setUltimaGeracao({
          reciboIds: r.reciboIds,
          reciboIdsCriados: r.reciboIdsCriados,
          reciboIdsComplementados: r.reciboIdsComplementados,
        });
        const sel: Record<string, boolean> = {};
        for (const id of r.reciboIds) sel[id] = true;
        setSelected(sel);
      }
      if (r.anexados) toast.info(`${r.anexados} recibo(s) complementado(s) com novas extras`);
      if (r.criados > 0) toast.success(`${r.criados} recibo(s) gerado(s)`);
      else if (r.mensagem) toast.info(r.mensagem);
      if (r.erros?.length) toast.error(r.erros.join("; "));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recibosRecemGerados = ultimaGeracao.reciboIds;
  const qtdCriadosUltima = ultimaGeracao.reciboIdsCriados.length;
  const qtdComplementadosUltima = ultimaGeracao.reciboIdsComplementados.length;

  const mExcluir = useMutation({
    mutationFn: () => excluir({ data: { reciboId: excluirId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      qc.invalidateQueries({ queryKey: ["extras-pagas-sem-recibo"] });
      qc.invalidateQueries({ queryKey: ["preview-extras-pendentes"] });
      toast.success("Recibo excluído");
      setExcluirId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const todosVisiveisSelecionados = filtrados.length > 0 && filtrados.every((r) => selected[r.id]);

  const handleImprimir = (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    navigate({ to: "/recibos/imprimir", search: { ids: ids.join(","), action: "print" } });
  };

  const handlePdf = async (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    try {
      const views = await loadReciboViews(ids);
      await gerarPdfRecibos(views, `recibos-${new Date().toISOString().slice(0, 10)}.pdf`);
      const r = await arquivar({ data: { ids } });
      if (r.arquivados) toast.success(`${r.arquivados} recibo(s) arquivado(s) — disponíveis em Relatórios › Recibos`);
      qc.invalidateQueries({ queryKey: ["recibos"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleArquivar = async (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    try {
      const r = await arquivar({ data: { ids } });
      if (r.arquivados) toast.success(`${r.arquivados} recibo(s) arquivado(s)`);
      else toast.info("Nenhum recibo foi arquivado");
      qc.invalidateQueries({ queryKey: ["recibos"] });
      setSelected({});
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <PageHeader
        title="Recibos"
        description="Extras liberadas pelo financeiro ficam disponíveis aqui. Gere os recibos pendentes, imprima e arquive. A emissão do recibo representa o pagamento."
      />

      <div className="rounded-md border p-3 bg-card mb-4">
        <div className="text-sm font-semibold mb-2">Emissão</div>
        <div className="text-xs text-muted-foreground mb-3">
          Inclui extras retroativas aprovadas e pagas sem recibo ativo.
          A <strong>semana_ref</strong> de cada extra é preservada no item do recibo.
        </div>

        <Button
          onClick={() => mGerar.mutate()}
          disabled={mGerar.isPending || !qtdExtrasPendentes}
        >
          <FilePlus className="h-4 w-4 mr-1" />
          Gerar recibos pendentes
          {qtdExtrasPendentes ? ` (${qtdExtrasPendentes} extra(s), ${pendentesGrupos.length} colaborador(es))` : ""}
        </Button>

        {!!pendentesGrupos.length && (
          <div className="mt-2 rounded-md border bg-muted/30 p-2 max-h-64 overflow-auto text-xs">
            <div className="font-semibold mb-1">Prévia — extras elegíveis</div>
            {pendentesGrupos.map((g) => (
              <div key={g.colaborador_id} className="mb-1">
                <div className="font-medium">
                  {g.nome}
                  <span className="font-normal text-muted-foreground"> — {g.qtd} extra(s), {formatBRL(g.total)}</span>
                </div>
                <ul className="ml-4">
                  {g.extras.map((extra) => (
                    <li key={extra.id}>
                      {extra.data ? `${extra.data}: ` : ""}{formatBRL(extra.valor)}
                      <span className="text-muted-foreground"> — semana {extra.semana_ref}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {!previewPendentesQuery.isLoading && !pendentesGrupos.length && (
          <div className="mt-2 text-xs text-muted-foreground">Nenhuma extra elegível pendente de recibo.</div>
        )}
      </div>

      <ReimpressaoPorGeracao
        reDe={reDe} reAte={reAte} setReDe={setReDe} setReAte={setReAte}
        onImprimir={(ids) => navigate({ to: "/recibos/imprimir", search: { ids: ids.join(","), action: "print" } })}
        onPdf={async (ids) => {
          const views = await loadReciboViews(ids);
          await gerarPdfRecibos(views, `recibos-${new Date().toISOString().slice(0, 10)}.pdf`);
        }}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div>
          <Label className="text-xs">Colaborador</Label>
          <Select value={fColab || "_all"} onValueChange={(v) => setFColab(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos</SelectItem>
              {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Cliente</Label>
          <Select value={fCliente || "_all"} onValueChange={(v) => setFCliente(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos</SelectItem>
              {(clientes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Empresa</Label>
          <Select value={fEmpresa || "_all"} onValueChange={(v) => setFEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas</SelectItem>
              {(empresas.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Visibilidade</Label>
          <Select value={fVisibilidade} onValueChange={(v) => setFVisibilidade(v as VisibilidadeRecibos)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="arquivados">Arquivados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <Button size="sm" variant="outline" onClick={() => { setFColab(""); setFCliente(""); setFEmpresa(""); setFVisibilidade("pendentes"); }}>Limpar</Button>
        </div>
      </div>

      {!!recibosRecemGerados.length && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 mb-3 text-xs">
          <div className="font-semibold mb-1">Última geração</div>
          <p className="text-muted-foreground mb-2">
            {qtdCriadosUltima} recibo(s) criado(s), {qtdComplementadosUltima} complementado(s), {recibosRecemGerados.length} afetado(s) no total.
            {qtdComplementadosUltima > 0 && (
              <> Recibos complementados serão impressos/baixados <strong>completos</strong>, incluindo itens anteriores.</>
            )}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => handleImprimir(recibosRecemGerados)} disabled={!recibosRecemGerados.length}>
              <Printer className="h-4 w-4 mr-1" />Imprimir última geração ({recibosRecemGerados.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => handlePdf(recibosRecemGerados)} disabled={!recibosRecemGerados.length}>
              <FileDown className="h-4 w-4 mr-1" />Baixar PDF última geração ({recibosRecemGerados.length})
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => handleImprimir(recibosRecemGerados)} disabled={!recibosRecemGerados.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir recém-gerados ({recibosRecemGerados.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => handlePdf(recibosRecemGerados)} disabled={!recibosRecemGerados.length}>
          <FileDown className="h-4 w-4 mr-1" />Baixar PDF recém-gerados ({recibosRecemGerados.length})
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" variant="outline" onClick={() => handleImprimir(selectedIds)} disabled={!selectedIds.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Selecionados ({selectedIds.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => handlePdf(selectedIds)} disabled={!selectedIds.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Selecionados
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPreviewIds(selectedIds)} disabled={!selectedIds.length}>
          <Eye className="h-4 w-4 mr-1" />Visualizar Selecionados
        </Button>
        <Button size="sm" variant="default" onClick={() => handleArquivar(selectedIds)} disabled={!selectedIds.length} title="Marcar como arquivados (após impressão confirmada)">
          Arquivar Selecionados ({selectedIds.length})
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" onClick={() => handleImprimir(filtrados.map((r) => r.id))} disabled={!filtrados.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Filtrados ({filtrados.length})
        </Button>
        <Button size="sm" onClick={() => handlePdf(filtrados.map((r) => r.id))} disabled={!filtrados.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Filtrados
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" variant="secondary" onClick={() => handleImprimir((list.data ?? []).map((r) => r.id))} disabled={!list.data?.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Todos ({list.data?.length ?? 0})
        </Button>
        <Button size="sm" variant="secondary" onClick={() => handlePdf((list.data ?? []).map((r) => r.id))} disabled={!list.data?.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Todos
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={todosVisiveisSelecionados}
                  onCheckedChange={(v) => {
                    const next: Record<string, boolean> = { ...selected };
                    filtrados.forEach((r) => { next[r.id] = !!v; });
                    setSelected(next);
                  }}
                />
              </TableHead>
              <TableHead>Nº</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Pago em</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))} />
                </TableCell>
                <TableCell>{r.numero}</TableCell>
                <TableCell>
                  {r.colaboradores?.nome}
                  <div className="text-xs text-muted-foreground">{r.colaboradores?.matricula} - {r.colaboradores?.funcoes?.nome}</div>
                </TableCell>
                <TableCell>{r.colaboradores?.empresas?.nome}</TableCell>
                <TableCell>{r.data_pagamento}</TableCell>
                <TableCell>{formatBRL(r.valor_total)}</TableCell>
                <TableCell>
                  <Badge variant={r.arquivado_em ? "secondary" : "default"}>
                    {r.arquivado_em ? "Arquivado" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setPreviewIds([r.id])} title="Visualizar"><Eye className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleImprimir([r.id])} title="Imprimir"><Printer className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handlePdf([r.id])} title="PDF"><FileDown className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDetalheId(r.id)}>Itens</Button>
                    <Button size="sm" variant="destructive" onClick={() => setExcluirId(r.id)} title="Excluir (admin)"><Ban className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum recibo</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto mt-4">
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <div>
            <div className="text-sm font-semibold">Extras pagas sem recibo</div>
            <div className="text-xs text-muted-foreground">
              {extrasPagasSemReciboFiltradas.length} extra(s), total {formatBRL(totalExtrasPagasSemRecibo)}
            </div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extrasPagasSemReciboFiltradas.map((extra) => (
              <TableRow key={extra.id}>
                <TableCell>{extra.colaboradores?.nome ?? "—"}</TableCell>
                <TableCell>{extra.data}</TableCell>
                <TableCell>{extra.clientes?.nome_fantasia ?? "—"}</TableCell>
                <TableCell>{extra.empresas?.nome ?? "—"}</TableCell>
                <TableCell className="text-right">{formatBRL(extra.valor)}</TableCell>
              </TableRow>
            ))}
            {!extrasPagasSemRecibo.isLoading && extrasPagasSemReciboFiltradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma extra paga sem recibo ativo
                </TableCell>
              </TableRow>
            )}
            {extrasPagasSemRecibo.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!excluirId} onOpenChange={(o) => !o && setExcluirId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Recibo</DialogTitle>
            <DialogDescription>Esta ação é definitiva. O recibo e seus itens serão removidos. Apenas administradores podem executar.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirId(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => mExcluir.mutate()} disabled={mExcluir.isPending}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Itens do Recibo</DialogTitle>
            <DialogDescription>Extras incluídas neste recibo.</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Semana ref.</TableHead><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead><TableHead>Horário</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {(itens.data ?? []).map((i: { id: string; valor_snapshot: number; extras?: { data?: string; semana_ref?: string; hora_inicio?: string; hora_termino?: string; clientes?: { nome_fantasia?: string }; empresas?: { nome?: string } | null } }) => (
                <TableRow key={i.id}>
                  <TableCell>{i.extras?.data}</TableCell>
                  <TableCell>{i.extras?.semana_ref}</TableCell>
                  <TableCell>{i.extras?.clientes?.nome_fantasia}</TableCell>
                  <TableCell>{i.extras?.empresas?.nome ?? "—"}</TableCell>
                  <TableCell>{i.extras?.hora_inicio} → {i.extras?.hora_termino}</TableCell>
                  <TableCell className="text-right">{formatBRL(i.valor_snapshot)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewIds} onOpenChange={(o) => !o && setPreviewIds(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização — {previewIds?.length} recibo(s)</DialogTitle>
            <DialogDescription>Visualização A4 retrato (3 recibos por folha).</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-3">
            <Button size="sm" onClick={() => previewIds && handleImprimir(previewIds)}>
              <Printer className="h-4 w-4 mr-1" />Imprimir
            </Button>
            <Button size="sm" variant="outline" onClick={() => previewIds && handlePdf(previewIds)}>
              <FileDown className="h-4 w-4 mr-1" />PDF
            </Button>
          </div>
          <div className="bg-gray-100 p-4">
            {recibosViewsQuery.data ? <ReciboA4 recibos={recibosViewsQuery.data} /> : <p>Carregando...</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReimpressaoPorGeracao({
  reDe, reAte, setReDe, setReAte, onImprimir, onPdf,
}: {
  reDe: string; reAte: string;
  setReDe: (v: string) => void; setReAte: (v: string) => void;
  onImprimir: (ids: string[]) => void;
  onPdf: (ids: string[]) => Promise<void>;
}) {
  const q = useQuery({
    queryKey: ["recibos-gerados", reDe, reAte],
    enabled: !!reDe && !!reAte,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recibos")
        .select("id, numero, gerado_em, arquivado_em, valor_total, colaboradores(nome)")
        .gte("gerado_em", `${reDe}T00:00:00`)
        .lte("gerado_em", `${reAte}T23:59:59.999`)
        .eq("ativo", true);
      if (error) throw error;
      type ReciboGerado = { id: string; numero: number; gerado_em: string; arquivado_em: string | null; valor_total: number; colaboradores?: { nome?: string } | null };
      return ((data ?? []) as ReciboGerado[]).sort((a, b) =>
        (a.colaboradores?.nome ?? "").localeCompare(
          b.colaboradores?.nome ?? "",
          "pt-BR",
          { sensitivity: "base" },
        ) || a.gerado_em.localeCompare(b.gerado_em) || a.id.localeCompare(b.id),
      );
    },
  });
  const ids = (q.data ?? []).map((r) => r.id);
  const totalValor = (q.data ?? []).reduce((s, r) => s + Number(r.valor_total), 0);
  return (
    <div className="rounded-md border p-3 bg-card mb-4">
      <div className="text-sm font-semibold mb-2">Reimprimir por período de geração</div>
      <div className="text-xs text-muted-foreground mb-3">
        Inclui recibos já arquivados. Útil para reimprimir tudo o que foi gerado num intervalo.
      </div>
      <div className="flex gap-2 items-end flex-wrap">
        <div><Label className="text-xs">Gerado de</Label><Input type="date" value={reDe} onChange={(e) => setReDe(e.target.value)} /></div>
        <div><Label className="text-xs">até</Label><Input type="date" value={reAte} onChange={(e) => setReAte(e.target.value)} /></div>
        <Button size="sm" onClick={() => onImprimir(ids)} disabled={!ids.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir ({ids.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPdf(ids)} disabled={!ids.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF
        </Button>
        {!!ids.length && (
          <span className="text-xs text-muted-foreground">Total: {formatBRL(totalValor)}</span>
        )}
      </div>
    </div>
  );
}
