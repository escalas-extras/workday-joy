import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app-shell";
import { gerarRecibosSemana, excluirRecibo, arquivarRecibos } from "@/lib/recibos.functions";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, FilePlus, Eye, Printer, FileDown } from "lucide-react";
import { ReciboA4, type ReciboView } from "@/components/recibos/ReciboA4";
import { loadReciboViews } from "@/lib/recibos-views";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { formatBRL } from "@/lib/extenso";

export const Route = createFileRoute("/_authenticated/recibos/")({ component: Page });

type ReciboRow = {
  id: string; numero: number; semana_ref: string; data_pagamento: string;
  valor_total: number; ativo: boolean; colaborador_id: string;
  arquivado_em?: string | null;
  colaboradores?: { nome: string; matricula?: string; empresa_id?: string;
    empresas?: { id: string; nome: string }; funcoes?: { nome: string } };
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gerar = useServerFn(gerarRecibosSemana);
  const excluir = useServerFn(excluirRecibo);
  const arquivar = useServerFn(arquivarRecibos);

  const hojeISO = new Date().toISOString().slice(0, 10);
  // Período padrão: 1º do mês até hoje
  const primeiroDoMes = `${hojeISO.slice(0, 7)}-01`;
  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(hojeISO);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});


  // Filtros
  const [fSemana, setFSemana] = useState("");
  const [fColab, setFColab] = useState<string>("");
  const [fCliente, setFCliente] = useState<string>("");
  const [fEmpresa, setFEmpresa] = useState<string>("");
  const [fStatus] = useState<string>("");

  const list = useQuery({
    queryKey: ["recibos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("recibos")
        .select("*, colaboradores(id,nome,matricula,empresa_id,empresas(id,nome),funcoes(nome))")
        .is("arquivado_em", null)
        .order("gerado_em", { ascending: false });
      return (data ?? []) as ReciboRow[];
    },
  });

  // Auxiliares para os selects de filtro
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

  // Recibos x cliente: derivado via tabela recibos_itens -> extras. Carregamos um mapa por demanda.
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

  const filtrados = useMemo(() => {
    const rows = list.data ?? [];
    return rows.filter((r) => {
      if (fSemana && r.semana_ref !== fSemana) return false;
      if (fColab && r.colaborador_id !== fColab) return false;
      if (fEmpresa && r.colaboradores?.empresa_id !== fEmpresa) return false;
      // recibos cancelados são excluídos definitivamente; lista contém apenas ativos
      if (fCliente) {
        const set = recibosClientesMap.data?.[r.id];
        if (!set || !set.has(fCliente)) return false;
      }
      return true;
    });
  }, [list.data, fSemana, fColab, fEmpresa, fStatus, fCliente, recibosClientesMap.data]);

  const itens = useQuery({
    queryKey: ["recibo_itens", detalheId],
    queryFn: async () => detalheId
      ? (await supabase.from("recibos_itens").select("*, extras(data,hora_inicio,hora_termino,valor,cliente_id,clientes(nome_fantasia),empresas(nome))").eq("recibo_id", detalheId)).data ?? []
      : [],
    enabled: !!detalheId,
  });

  // Carrega views completas para preview (lista de IDs)
  const previewQuery = useQuery({
    queryKey: ["recibos-preview", previewIds],
    enabled: !!previewIds?.length,
    queryFn: async () => loadReciboViews(previewIds ?? []),
  });

  const mGerar = useMutation({
    mutationFn: () => gerar({ data: { de, ate, data_pagamento: hojeISO } }),
    onSuccess: (r: { criados: number; erros?: string[]; mensagem?: string }) => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      qc.invalidateQueries({ queryKey: ["extras-pendentes-recibo"] });
      if (r.criados > 0) toast.success(`${r.criados} recibo(s) gerado(s)`);
      else if (r.mensagem) toast.info(r.mensagem);
      if (r.erros?.length) toast.error(r.erros.join("; "));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Prévia: extras elegíveis no período que AINDA NÃO foram recibadas (anti-join via recibos_itens ativos)
  const pendentesExtras = useQuery({
    queryKey: ["extras-pendentes-recibo", de, ate],
    enabled: !!de && !!ate,
    queryFn: async () => {
      const { data: extras, error } = await supabase
        .from("extras")
        .select("id, data, semana_ref, valor, colaborador_id, created_at, colaboradores!colaborador_id(nome)")
        .gte("created_at", `${de}T00:00:00`).lte("created_at", `${ate}T23:59:59.999`)
        .eq("status", "aprovado_financeiro")
        .eq("situacao_financeira", "pago")
        .order("created_at");
      if (error) throw error;
      const rows = ((extras ?? []) as unknown) as { id: string; data: string; semana_ref: string; valor: number; colaborador_id: string; colaboradores: { nome: string } | null }[];
      if (!rows.length) return [];
      const { data: ja } = await supabase
        .from("recibos_itens")
        .select("extra_id, recibos!inner(ativo)")
        .in("extra_id", rows.map((r) => r.id))
        .eq("recibos.ativo", true);
      const set = new Set((ja ?? []).map((r) => r.extra_id));
      return rows.filter((r) => !set.has(r.id));
    },
  });

  // Agrupa prévia por colaborador → semana_ref.
  // Deduplica por (colaborador, data) — extras duplicadas no mesmo dia são ignoradas
  // (não relacionadas) tanto na contagem quanto no total.
  const pendentesGrupos = useMemo(() => {
    const out = new Map<string, { colab: string; semanas: Map<string, { qtd: number; total: number; datas: string[] }> }>();
    const vistos = new Set<string>(); // chave: colaborador_id|data
    for (const e of pendentesExtras.data ?? []) {
      const chave = `${e.colaborador_id}|${e.data}`;
      if (vistos.has(chave)) continue; // duplicado: não relacionar
      vistos.add(chave);
      const nome = e.colaboradores?.nome ?? "—";
      const g = out.get(nome) ?? { colab: nome, semanas: new Map() };
      const s = g.semanas.get(e.semana_ref) ?? { qtd: 0, total: 0, datas: [] };
      s.qtd++; s.total += Number(e.valor); s.datas.push(e.data);
      g.semanas.set(e.semana_ref, s);
      out.set(nome, g);
    }
    return [...out.values()].sort((a, b) => a.colab.localeCompare(b.colab));
  }, [pendentesExtras.data]);




  const mExcluir = useMutation({
    mutationFn: () => excluir({ data: { reciboId: excluirId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recibos"] }); toast.success("Recibo excluído"); setExcluirId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const todosVisiveisSelecionados = filtrados.length > 0 && filtrados.every((r) => selected[r.id]);

  const handleImprimir = (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    navigate({ to: "/recibos/imprimir", search: { ids: ids.join(","), action: "print" } });
    arquivar({ data: { ids } })
      .then((r) => {
        if (r.arquivados) toast.success(`${r.arquivados} recibo(s) arquivado(s) — disponíveis em Relatórios › Recibos`);
        qc.invalidateQueries({ queryKey: ["recibos"] });
      })
      .catch((e: Error) => toast.error(e.message));
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

  return (
    <div>
      <PageHeader title="Recibos" description="Recibos pendentes. Após imprimir ou gerar PDF, ficam arquivados em Relatórios › Recibos." />

      {/* Geração — por período de LANÇAMENTO das extras */}
      <div className="rounded-md border p-3 bg-card mb-4">
        <div className="text-sm font-semibold mb-2">Gerar Recibos</div>
        <div className="text-xs text-muted-foreground mb-3">
          Serão considerados apenas lançamentos cadastrados neste período e ainda não recibados.
          A <strong>data original</strong> do serviço e a <strong>semana_ref</strong> da extra são preservadas no recibo.
          <strong> Emitido em: hoje ({hojeISO})</strong>.
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div><Label className="text-xs">Período de lançamento — de</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label className="text-xs">até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <Button onClick={() => mGerar.mutate()} disabled={!de || !ate || mGerar.isPending || !pendentesGrupos.length}>
            <FilePlus className="h-4 w-4 mr-1" />
            Gerar {pendentesGrupos.length ? `(${pendentesGrupos.reduce((acc, g) => acc + [...g.semanas.values()].reduce((a, s) => a + s.qtd, 0), 0)} extra(s) em ${pendentesGrupos.length} grupo(s))` : ""}
          </Button>
        </div>
        {!!pendentesGrupos.length && (
          <div className="mt-3 rounded-md border bg-muted/30 p-2 max-h-64 overflow-auto text-xs">
            <div className="font-semibold mb-1">Prévia — extras lançadas no período e ainda não recibadas</div>
            {pendentesGrupos.map((g) => (
              <div key={g.colab} className="mb-1">
                <div className="font-medium">{g.colab}</div>
                <ul className="ml-4">
                  {[...g.semanas.entries()].sort().map(([sem, s]) => (
                    <li key={sem}>
                      semana original {sem}: {s.qtd} extra(s) — {formatBRL(s.total)}
                      {s.datas.length > 1 && (
                        <div className="ml-2 text-muted-foreground">
                          dias: {[...s.datas].sort().join(", ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {!pendentesExtras.isLoading && !pendentesGrupos.length && (
          <div className="mt-2 text-xs text-muted-foreground">Nenhuma extra lançada (não recibada) neste período.</div>
        )}
      </div>



      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div><Label className="text-xs">Semana</Label><Input type="date" value={fSemana} onChange={(e) => setFSemana(e.target.value)} /></div>
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
        <div className="hidden" />
        <div className="flex items-end gap-1">
          <Button size="sm" variant="outline" onClick={() => { setFSemana(""); setFColab(""); setFCliente(""); setFEmpresa(""); }}>Limpar</Button>
        </div>
      </div>

      {/* Ações em lote */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => handleImprimir(selectedIds)} disabled={!selectedIds.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Selecionados ({selectedIds.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => handlePdf(selectedIds)} disabled={!selectedIds.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Selecionados
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPreviewIds(selectedIds)} disabled={!selectedIds.length}>
          <Eye className="h-4 w-4 mr-1" />Visualizar Selecionados
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
              <TableHead>Semana</TableHead>
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
                <TableCell>{r.semana_ref}</TableCell>
                <TableCell>{r.data_pagamento}</TableCell>
                <TableCell>{formatBRL(r.valor_total)}</TableCell>
                <TableCell><Badge variant="default">Ativo</Badge></TableCell>
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
            {filtrados.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum recibo</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Excluir */}
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

      {/* Itens */}
      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Itens do Recibo</DialogTitle>
            <DialogDescription>Extras incluídas neste recibo.</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead><TableHead>Horário</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {(itens.data ?? []).map((i: { id: string; valor_snapshot: number; extras?: { data?: string; hora_inicio?: string; hora_termino?: string; clientes?: { nome_fantasia?: string }; empresas?: { nome?: string } | null } }) => (
                <TableRow key={i.id}>
                  <TableCell>{i.extras?.data}</TableCell>
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

      {/* Preview A4 */}
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
            {previewQuery.data ? <ReciboA4 recibos={previewQuery.data} /> : <p>Carregando...</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

