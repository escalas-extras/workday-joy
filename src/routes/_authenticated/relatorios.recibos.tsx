import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
import { Printer, FileDown, Eye, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/extenso";
import { ReciboA4, type ReciboView } from "@/components/recibos/ReciboA4";
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { loadReciboViews } from "@/routes/_authenticated/recibos";
import { desarquivarRecibo } from "@/lib/recibos.functions";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";

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

  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtras = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(mesAtras);
  const [ate, setAte] = useState(hoje);
  const [fColab, setFColab] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Recibos no período (por semana_ref). Inclui dados de empresa do colaborador.
  const list = useQuery({
    queryKey: ["recibos-arquivados", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recibos")
        .select("id,numero,semana_ref,data_pagamento,valor_total,ativo,arquivado_em,colaborador_id,colaboradores(nome,matricula,empresa_id,empresas(id,nome),funcoes(nome))")
        .not("arquivado_em", "is", null)
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
    if (fStatus === "ativo" && !r.ativo) return false;
    if (fStatus === "cancelado" && r.ativo) return false;
    if (fCliente) {
      const set = clientesMap.data?.map[r.id];
      if (!set || !set.has(fCliente)) return false;
    }
    return true;
  }), [list.data, fColab, fEmpresa, fStatus, fCliente, clientesMap.data]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const todosSel = filtrados.length > 0 && filtrados.every((r) => selected[r.id]);

  const handleImprimir = (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    const params = new URLSearchParams({ ids: ids.join(","), action: "print" });
    const janela = window.open(`/recibos/imprimir?${params.toString()}`, "_blank");
    if (!janela) toast.error("Não foi possível abrir a impressão. Verifique se o navegador bloqueou a nova aba.");
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

  const limpar = () => { setFColab(""); setFEmpresa(""); setFCliente(""); setFStatus(""); };

  return (
    <div>
      <PageHeader title="Relatório de Recibos" description="Recibos já impressos / exportados (arquivados). Filtros mostram apenas registros com recibos no período." />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div><Label className="text-xs">Semana de</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
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
        <div className="flex items-end">
          <Button size="sm" variant="outline" onClick={limpar}>Limpar</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => handleImprimir(selectedIds)} disabled={!selectedIds.length}>
          <Printer className="h-4 w-4 mr-1" />Imprimir Selecionados ({selectedIds.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => handlePdf(selectedIds)} disabled={!selectedIds.length}>
          <FileDown className="h-4 w-4 mr-1" />PDF Selecionados
        </Button>
        <div className="w-px bg-border mx-1" />
        <Button size="sm" onClick={() => handleImprimir(filtrados.map((r) => r.id))} disabled={!filtrados.length}>
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

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-8"><Checkbox checked={todosSel} onCheckedChange={(v) => {
              const next = { ...selected }; filtrados.forEach((r) => { next[r.id] = !!v; }); setSelected(next);
            }} /></TableHead>
            <TableHead>Nº</TableHead><TableHead>Colaborador</TableHead><TableHead>Empresa</TableHead>
            <TableHead>Semana</TableHead><TableHead>Pago em</TableHead><TableHead>Arquivado em</TableHead>
            <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtrados.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))} /></TableCell>
                <TableCell>{r.numero}</TableCell>
                <TableCell>{r.colaboradores?.nome}<div className="text-xs text-muted-foreground">{r.colaboradores?.matricula} - {r.colaboradores?.funcoes?.nome}</div></TableCell>
                <TableCell>{r.colaboradores?.empresas?.nome}</TableCell>
                <TableCell>{r.semana_ref}</TableCell>
                <TableCell>{r.data_pagamento}</TableCell>
                <TableCell className="text-xs">{r.arquivado_em?.slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell className="text-right">{formatBRL(r.valor_total)}</TableCell>
                <TableCell><Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Ativo" : "Cancelado"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => navigate({ to: "/recibos/imprimir", search: { ids: r.id, action: "preview" } })} title="Visualizar"><Eye className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleImprimir([r.id])} title="Imprimir"><Printer className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handlePdf([r.id])} title="PDF"><FileDown className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDesarquivar(r.id)} title="Desarquivar"><Undo2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtrados.length && <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Nenhum recibo no período / filtros aplicados</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 text-right text-sm font-semibold">Total: {formatBRL(totalValor)} — {filtrados.length} recibo(s)</div>
    </div>
  );
}
