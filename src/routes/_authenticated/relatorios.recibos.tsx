import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import { gerarPdfRecibos } from "@/lib/recibos-export";
import { loadReciboViews } from "@/routes/_authenticated/recibos";
import { desarquivarRecibo } from "@/lib/recibos.functions";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";

export const Route = createFileRoute("/_authenticated/relatorios/recibos")({ component: Page });

type Row = {
  id: string; numero: number; semana_ref: string; data_pagamento: string;
  valor_total: number; ativo: boolean; arquivado_em: string;
  colaboradores?: { nome: string; matricula?: string; empresa_id?: string;
    empresas?: { nome: string }; funcoes?: { nome: string } };
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
  const [fStatus, setFStatus] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const colabs = useQuery({ queryKey: ["rrec-colabs"], queryFn: async () => (await supabase.from("colaboradores").select("id,nome").order("nome")).data ?? [] });
  const empresas = useQuery({ queryKey: ["rrec-empresas"], queryFn: async () => (await supabase.from("empresas").select("id,nome").order("nome")).data ?? [] });

  const list = useQuery({
    queryKey: ["recibos-arquivados", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recibos")
        .select("id,numero,semana_ref,data_pagamento,valor_total,ativo,arquivado_em,colaborador_id,colaboradores(nome,matricula,empresa_id,empresas(nome),funcoes(nome))")
        .not("arquivado_em", "is", null)
        .gte("arquivado_em", `${de}T00:00:00`)
        .lte("arquivado_em", `${ate}T23:59:59`)
        .order("arquivado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtrados = useMemo(() => (list.data ?? []).filter((r) => {
    if (fColab && (r as Row & { colaborador_id: string }).colaborador_id !== fColab) return false;
    if (fEmpresa && r.colaboradores?.empresa_id !== fEmpresa) return false;
    if (fStatus === "ativo" && !r.ativo) return false;
    if (fStatus === "cancelado" && r.ativo) return false;
    return true;
  }), [list.data, fColab, fEmpresa, fStatus]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const todosSel = filtrados.length > 0 && filtrados.every((r) => selected[r.id]);

  const handleImprimir = (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    navigate({ to: "/recibos/imprimir", search: { ids: ids.join(","), action: "print" } });
  };
  const handlePdf = async (ids: string[]) => {
    if (!ids.length) return toast.error("Selecione ao menos um recibo");
    try {
      const views = await loadReciboViews(ids);
      gerarPdfRecibos(views, `recibos-arquivados-${hoje}.pdf`);
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

  return (
    <div>
      <PageHeader title="Relatório de Recibos" description="Recibos já impressos / exportados (arquivados)" />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 rounded-md border p-3 bg-card">
        <div><Label className="text-xs">Arquivado de</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Colaborador</Label>
          <Select value={fColab || "_all"} onValueChange={(v) => setFColab(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todos</SelectItem>{(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Empresa</Label>
          <Select value={fEmpresa || "_all"} onValueChange={(v) => setFEmpresa(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">Todas</SelectItem>{(empresas.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
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
          <Button size="sm" variant="outline" onClick={() => { setFColab(""); setFEmpresa(""); setFStatus(""); }}>Limpar</Button>
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
            {!filtrados.length && <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Nenhum recibo arquivado no período</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 text-right text-sm font-semibold">Total: {formatBRL(totalValor)} — {filtrados.length} recibo(s)</div>
    </div>
  );
}
