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
import { gerarRecibosSemana, cancelarRecibo } from "@/lib/recibos.functions";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, FilePlus, Eye, Printer, FileDown } from "lucide-react";
import { ReciboA4, type ReciboView } from "@/components/recibos/ReciboA4";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { formatBRL } from "@/lib/extenso";

export const Route = createFileRoute("/_authenticated/recibos")({ component: Page });

type ReciboRow = {
  id: string; numero: number; semana_ref: string; data_pagamento: string;
  valor_total: number; ativo: boolean; colaborador_id: string;
  colaboradores?: { nome: string; matricula?: string; empresa_id?: string;
    empresas?: { id: string; nome: string }; funcoes?: { nome: string } };
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gerar = useServerFn(gerarRecibosSemana);
  const cancelar = useServerFn(cancelarRecibo);

  const [semana, setSemana] = useState("");
  const [dataPag, setDataPag] = useState(new Date().toISOString().slice(0, 10));
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Filtros
  const [fSemana, setFSemana] = useState("");
  const [fColab, setFColab] = useState<string>("");
  const [fCliente, setFCliente] = useState<string>("");
  const [fEmpresa, setFEmpresa] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");

  const list = useQuery({
    queryKey: ["recibos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("recibos")
        .select("*, colaboradores(id,nome,matricula,empresa_id,empresas(id,nome),funcoes(nome))")
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
    queryFn: async () => (await supabase.from("clientes").select("id,nome").order("nome")).data ?? [],
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
      if (fStatus === "ativo" && !r.ativo) return false;
      if (fStatus === "cancelado" && r.ativo) return false;
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
      ? (await supabase.from("recibos_itens").select("*, extras(data,hora_inicio,hora_termino,valor,cliente_id,clientes(nome_fantasia))").eq("recibo_id", detalheId)).data ?? []
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
    mutationFn: () => gerar({ data: { semana_ref: semana, data_pagamento: dataPag } }),
    onSuccess: (r: { criados: number; erros?: string[] }) => {
      qc.invalidateQueries({ queryKey: ["recibos"] });
      toast.success(`${r.criados} recibo(s) gerado(s)`);
      if (r.erros?.length) toast.error(r.erros.join("; "));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mCancelar = useMutation({
    mutationFn: () => cancelar({ data: { reciboId: cancelarId!, motivo } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recibos"] }); toast.success("Cancelado"); setCancelarId(null); setMotivo(""); },
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
      gerarPdfRecibos(views, `recibos-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader title="Recibos" description="Geração, visualização, impressão e PDF" />

      {/* Geração */}
      <div className="flex gap-2 mb-4 items-end flex-wrap rounded-md border p-3 bg-card">
        <div><Label>Semana Ref</Label><Input type="date" value={semana} onChange={(e) => setSemana(e.target.value)} /></div>
        <div><Label>Data de Pagamento</Label><Input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} /></div>
        <Button onClick={() => mGerar.mutate()} disabled={!semana || !dataPag || mGerar.isPending}>
          <FilePlus className="h-4 w-4 mr-1" />Gerar Recibos da Semana
        </Button>
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
              {(clientes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
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
          <Label className="text-xs">Status</Label>
          <Select value={fStatus || "_all"} onValueChange={(v) => setFStatus(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <Button size="sm" variant="outline" onClick={() => { setFSemana(""); setFColab(""); setFCliente(""); setFEmpresa(""); setFStatus(""); }}>Limpar</Button>
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
                <TableCell><Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Ativo" : "Cancelado"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setPreviewIds([r.id])} title="Visualizar"><Eye className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleImprimir([r.id])} title="Imprimir"><Printer className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handlePdf([r.id])} title="PDF"><FileDown className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDetalheId(r.id)}>Itens</Button>
                    {r.ativo && <Button size="sm" variant="destructive" onClick={() => setCancelarId(r.id)}><Ban className="h-3 w-3" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum recibo</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Cancelar */}
      <Dialog open={!!cancelarId} onOpenChange={(o) => !o && setCancelarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Recibo</DialogTitle>
            <DialogDescription>Informe o motivo do cancelamento.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarId(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => mCancelar.mutate()} disabled={!motivo}>Cancelar</Button>
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
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Horário</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {(itens.data ?? []).map((i: { id: string; valor_snapshot: number; extras?: { data?: string; hora_inicio?: string; hora_termino?: string; clientes?: { nome?: string } } }) => (
                <TableRow key={i.id}>
                  <TableCell>{i.extras?.data}</TableCell>
                  <TableCell>{i.extras?.clientes?.nome}</TableCell>
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

export async function loadReciboViews(ids: string[]): Promise<ReciboView[]> {
  if (!ids.length) return [];
  const { data: recs } = await supabase
    .from("recibos")
    .select("id, numero, semana_ref, data_pagamento, valor_total, ativo, colaboradores(nome)")
    .in("id", ids)
    .order("numero");
  const { data: its } = await supabase
    .from("recibos_itens")
    .select("recibo_id, valor_snapshot, extras(data, clientes(nome_fantasia))")
    .in("recibo_id", ids);
  type Item = { recibo_id: string; valor_snapshot: number; extras?: { data?: string; clientes?: { nome?: string } } };
  const byRec: Record<string, { data: string; cliente: string; valor: number }[]> = {};
  for (const it of (its ?? []) as Item[]) {
    (byRec[it.recibo_id] ||= []).push({
      data: it.extras?.data ?? "",
      cliente: it.extras?.clientes?.nome ?? "",
      valor: Number(it.valor_snapshot),
    });
  }
  type Rec = { id: string; numero: number; semana_ref: string; data_pagamento: string; valor_total: number; ativo: boolean; colaboradores?: { nome?: string } };
  return ((recs ?? []) as Rec[]).map((r) => ({
    id: r.id,
    numero: r.numero,
    colaborador: r.colaboradores?.nome ?? "",
    semana_ref: r.semana_ref,
    data_pagamento: r.data_pagamento,
    valor_total: Number(r.valor_total),
    ativo: r.ativo,
    itens: (byRec[r.id] ?? []).sort((a, b) => a.data.localeCompare(b.data)),
  }));
}
