import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listAlmoxBase, listEstoque, upsertEstoqueMinimo, registrarMovimentacao,
  listMovimentacoes, listPendenciasDevolucao, importarEstoqueExcel,
} from "@/lib/almoxarifado.functions";
import { useAuth } from "@/hooks/use-auth";
import { exportarExcel, exportarPdf } from "@/lib/relatorios-export";
import { FileSpreadsheet, FileText, Upload } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/almoxarifado")({ component: Page });

const TAMANHOS: Record<string, string[]> = {
  vestuario: ["PP","P","M","G","GG","XGG","EXG","G1","G2","G3","G4","G5"],
  calca: ["34","36","38","40","42","44","46","48","50","52","54","56","58","60","62","64","66","68","70"],
  calcado: ["33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50"],
  bone: ["P","M","G","Único"],
  sem_tamanho: [],
};

function Page() {
  const { isAdmin, isGestorOp } = useAuth();
  const canWrite = isAdmin || isGestorOp;
  const qc = useQueryClient();
  const baseFn = useServerFn(listAlmoxBase);
  const estoqueFn = useServerFn(listEstoque);
  const movFn = useServerFn(listMovimentacoes);
  const pendFn = useServerFn(listPendenciasDevolucao);
  const upMinFn = useServerFn(upsertEstoqueMinimo);
  const regFn = useServerFn(registrarMovimentacao);
  const importFn = useServerFn(importarEstoqueExcel);

  const [filtroBaixo, setFiltroBaixo] = useState(false);

  const [importModo, setImportModo] = useState<"ingresso" | "ajuste">("ingresso");
  const [importPreview, setImportPreview] = useState<Array<{ item: string; tamanho?: string; quantidade?: number; quantidade_minima?: number }> | null>(null);
  const [importResult, setImportResult] = useState<{ ok: number; total: number; errors: { linha: number; motivo: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const base = useQuery({ queryKey: ["almox-base"], queryFn: () => baseFn() });
  const estoque = useQuery({
    queryKey: ["almox-estoque", filtroBaixo],
    queryFn: () => estoqueFn({ data: { abaixoMinimo: filtroBaixo } }),
  });
  const movs = useQuery({
    queryKey: ["almox-movs"],
    queryFn: () => movFn({ data: { limit: 500 } }),
  });
  const pendencias = useQuery({ queryKey: ["almox-pend"], queryFn: () => pendFn() });

  const [mov, setMov] = useState({
    item_id: "", tamanho: "" as string,
    tipo: "entrada" as "entrada" | "saida",
    motivo: "compra", quantidade: 1, observacao: "",
  });
  const itemSel = useMemo(() => base.data?.itens.find((i) => i.id === mov.item_id), [base.data, mov.item_id]);
  const catSel = useMemo(() => base.data?.categorias.find((c) => c.id === itemSel?.categoria_id), [base.data, itemSel]);
  const tamanhosDisp = catSel ? TAMANHOS[catSel.tipo_tamanho] ?? [] : [];

  async function salvarMin(row: { item_id: string; tamanho: string | null; quantidade_minima: number }) {
    const v = prompt(`Quantidade mínima:`, String(row.quantidade_minima));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) { toast.error("Valor inválido"); return; }
    try {
      await upMinFn({ data: { item_id: row.item_id, tamanho: row.tamanho, quantidade_minima: n } });
      toast.success("Mínimo atualizado");
      qc.invalidateQueries({ queryKey: ["almox-estoque"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function salvarMov(e: React.FormEvent) {
    e.preventDefault();
    if (!mov.item_id || !mov.quantidade) { toast.error("Preencha item e quantidade"); return; }
    try {
      await regFn({ data: {
        item_id: mov.item_id,
        tamanho: tamanhosDisp.length ? mov.tamanho || null : null,
        tipo: mov.tipo, motivo: mov.motivo, quantidade: mov.quantidade,
        observacao: mov.observacao || null,
      }});
      toast.success("Movimentação registrada");
      setMov({ ...mov, quantidade: 1, observacao: "" });
      qc.invalidateQueries({ queryKey: ["almox-estoque"] });
      qc.invalidateQueries({ queryKey: ["almox-movs"] });
    } catch (err) { toast.error((err as Error).message); }
  }

  const MOTIVOS_ENT = [
    { v: "compra", l: "Compra" },
    { v: "devolucao", l: "Devolução" },
    { v: "ajuste_entrada", l: "Ajuste (entrada)" },
    { v: "transferencia_recebida", l: "Transferência recebida" },
  ];
  const MOTIVOS_SAI = [
    { v: "entrega_colaborador", l: "Entrega ao colaborador" },
    { v: "perda", l: "Perda" },
    { v: "descarte", l: "Descarte" },
    { v: "transferencia_enviada", l: "Transferência enviada" },
    { v: "ajuste_saida", l: "Ajuste (saída)" },
  ];

  function relatorioEstoquePdf() {
    const rows = (estoque.data ?? []).map((r) => ({
      item: r.almox_itens?.nome ?? "—",
      tamanho: r.tamanho || "—",
      atual: r.quantidade_atual,
      minimo: r.quantidade_minima,
      abaixo: r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima ? "Sim" : "Não",
    }));
    void exportarPdf(`almoxarifado_estoque_${new Date().toISOString().slice(0,10)}.pdf`,
      "Relatório de Estoque - Almoxarifado",
      [
        { key: "item", label: "Item" }, { key: "tamanho", label: "Tamanho" },
        { key: "atual", label: "Qtd Atual", align: "right" },
        { key: "minimo", label: "Mínimo", align: "right" },
        { key: "abaixo", label: "Abaixo mín." },
      ], rows,
      ["TOTAL", "", String(rows.reduce((a, r) => a + Number(r.atual), 0)), "", `${rows.filter(r => r.abaixo === "Sim").length} item(ns)`]
    );
  }

  function relatorioMovimentacoesPdf() {
    const rows = (movs.data ?? []).map((m) => ({
      data: new Date(m.created_at).toLocaleString("pt-BR"),
      tipo: m.tipo,
      motivo: m.motivo,
      item: m.almox_itens?.nome ?? "—",
      tamanho: m.tamanho || "—",
      qtd: m.quantidade,
      colaborador: m.colaboradores?.nome ?? "—",
      obs: m.observacao ?? "",
    }));
    void exportarPdf(`almoxarifado_movimentacoes_${new Date().toISOString().slice(0,10)}.pdf`,
      "Relatório de Movimentações - Almoxarifado",
      [
        { key: "data", label: "Data" }, { key: "tipo", label: "Tipo" },
        { key: "motivo", label: "Motivo" }, { key: "item", label: "Item" },
        { key: "tamanho", label: "Tam." }, { key: "qtd", label: "Qtd", align: "right" },
        { key: "colaborador", label: "Colaborador" }, { key: "obs", label: "Obs." },
      ], rows
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Almoxarifado" description="Controle único de uniformes e equipamentos" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Itens em estoque</p>
          <p className="text-3xl font-bold">{estoque.data?.length ?? 0}</p>
        </CardContent></Card>
        <Card className="cursor-pointer hover:border-primary" onClick={() => setFiltroBaixo(true)}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Estoque baixo</p>
            <p className="text-3xl font-bold text-orange-600">
              {estoque.data?.filter((r) => r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima).length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Pendências de devolução</p>
          <p className="text-3xl font-bold text-red-600">{pendencias.data?.length ?? 0}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="estoque">
        <TabsList>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          {canWrite && <TabsTrigger value="movimentar">Movimentar</TabsTrigger>}
          <TabsTrigger value="movs">Movimentações</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
          {canWrite && <TabsTrigger value="importar">Importar Excel</TabsTrigger>}
        </TabsList>

        <TabsContent value="estoque" className="space-y-3 pt-2">
          <Card><CardContent className="pt-4 flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filtroBaixo} onChange={(e) => setFiltroBaixo(e.target.checked)} />
              Somente abaixo do mínimo
            </label>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => {
              const rows = (estoque.data ?? []).map((r) => ({
                item: r.almox_itens?.nome ?? "",
                tamanho: r.tamanho ?? "",
                atual: r.quantidade_atual,
                minimo: r.quantidade_minima,
                abaixo: r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima ? "Sim" : "Não",
              }));
              exportarExcel(`almoxarifado_estoque_${new Date().toISOString().slice(0,10)}.xlsx`, "Estoque",
                [
                  { key: "item", label: "Item" }, { key: "tamanho", label: "Tamanho" },
                  { key: "atual", label: "Atual" }, { key: "minimo", label: "Mínimo" },
                  { key: "abaixo", label: "Abaixo do mínimo" },
                ], rows);
            }}>
              <FileSpreadsheet className="w-4 h-4 mr-1" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={relatorioEstoquePdf}>
              <FileText className="w-4 h-4 mr-1" />PDF
            </Button>
          </CardContent></Card>

          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead><TableHead>Tamanho</TableHead>
                <TableHead className="text-right">Atual</TableHead><TableHead className="text-right">Mínimo</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(estoque.data ?? []).map((r) => {
                  const baixo = r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima;
                  return (
                    <TableRow key={r.id} className={baixo ? "bg-orange-50" : ""}>
                      <TableCell className="text-xs font-medium">{r.almox_itens?.nome}</TableCell>
                      <TableCell className="text-xs">{r.tamanho || "—"}</TableCell>
                      <TableCell className="text-right">
                        {baixo ? <Badge variant="destructive">{r.quantidade_atual}</Badge> : r.quantidade_atual}
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.quantidade_minima}</TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => salvarMin({ item_id: r.item_id, tamanho: r.tamanho, quantidade_minima: r.quantidade_minima })}>Min</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!estoque.data?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sem registros.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {canWrite && (
          <TabsContent value="movimentar" className="pt-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Nova movimentação</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={salvarMov} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={mov.tipo} onValueChange={(v) => setMov({ ...mov, tipo: v as "entrada" | "saida", motivo: v === "entrada" ? "compra" : "perda" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Motivo</Label>
                    <Select value={mov.motivo} onValueChange={(v) => setMov({ ...mov, motivo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(mov.tipo === "entrada" ? MOTIVOS_ENT : MOTIVOS_SAI).map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Item</Label>
                    <Select value={mov.item_id} onValueChange={(v) => setMov({ ...mov, item_id: v, tamanho: "" })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {base.data?.itens.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tamanho {tamanhosDisp.length ? "" : "(não se aplica)"}</Label>
                    {tamanhosDisp.length ? (
                      <Select value={mov.tamanho} onValueChange={(v) => setMov({ ...mov, tamanho: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{tamanhosDisp.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <Input disabled value="—" />}
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" min={1} value={mov.quantidade}
                      onChange={(e) => setMov({ ...mov, quantidade: parseInt(e.target.value || "1", 10) })} />
                  </div>
                  <div className="md:col-span-3">
                    <Label>Observação</Label>
                    <Textarea value={mov.observacao} onChange={(e) => setMov({ ...mov, observacao: e.target.value })} />
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <Button type="submit">Registrar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="movs" className="pt-2 space-y-3">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const rows = (movs.data ?? []).map((m) => ({
                data: new Date(m.created_at).toLocaleString("pt-BR"),
                tipo: m.tipo, motivo: m.motivo,
                item: m.almox_itens?.nome ?? "",
                tamanho: m.tamanho || "",
                qtd: m.quantidade,
                colaborador: m.colaboradores?.nome ?? "",
                obs: m.observacao ?? "",
              }));
              exportarExcel(`almoxarifado_movimentacoes_${new Date().toISOString().slice(0,10)}.xlsx`, "Movimentações",
                [
                  { key: "data", label: "Data" }, { key: "tipo", label: "Tipo" },
                  { key: "motivo", label: "Motivo" }, { key: "item", label: "Item" },
                  { key: "tamanho", label: "Tamanho" }, { key: "qtd", label: "Qtd" },
                  { key: "colaborador", label: "Colaborador" }, { key: "obs", label: "Observação" },
                ], rows);
            }}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={relatorioMovimentacoesPdf}>
              <FileText className="w-4 h-4 mr-1" />PDF
            </Button>
          </div>
          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Motivo</TableHead>
                <TableHead>Item</TableHead><TableHead>Tam.</TableHead>
                <TableHead className="text-right">Qtd</TableHead><TableHead>Colaborador</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(movs.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant={m.tipo === "entrada" ? "default" : "secondary"}>{m.tipo}</Badge></TableCell>
                    <TableCell className="text-xs">{m.motivo}</TableCell>
                    <TableCell className="text-xs">{m.almox_itens?.nome}</TableCell>
                    <TableCell className="text-xs">{m.tamanho || "—"}</TableCell>
                    <TableCell className="text-right">{m.quantidade}</TableCell>
                    <TableCell className="text-xs">{m.colaboradores?.nome ?? "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">{m.observacao}</TableCell>
                  </TableRow>
                ))}
                {!movs.data?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Sem movimentações.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pendencias" className="pt-2">
          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data entrega</TableHead><TableHead>Colaborador</TableHead>
                <TableHead>Item</TableHead><TableHead>Tam.</TableHead>
                <TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Devolvido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(pendencias.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.data_entrega}</TableCell>
                    <TableCell className="text-xs font-medium">{p.colaboradores?.nome}</TableCell>
                    <TableCell className="text-xs">{p.almox_itens?.nome}</TableCell>
                    <TableCell className="text-xs">{p.tamanho || "—"}</TableCell>
                    <TableCell className="text-right">{p.quantidade}</TableCell>
                    <TableCell className="text-right">{p.quantidade_devolvida}</TableCell>
                    <TableCell><Badge variant={p.status === "em_uso" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {!pendencias.data?.length && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Sem pendências.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {canWrite && (
          <TabsContent value="importar" className="pt-2 space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Importar ingresso de estoque (planilha Excel)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Colunas obrigatórias (linha 1 = cabeçalho):</p>
                  <code className="block bg-muted p-2 rounded">item | tamanho | quantidade | quantidade_minima</code>
                  <p>O nome do <b>item</b> é comparado sem diferenciar maiúsculas/acentos. Itens não cadastrados são reportados como erro.</p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[260px]">
                    <Label>Modo de importação</Label>
                    <Select value={importModo} onValueChange={(v) => setImportModo(v as "ingresso" | "ajuste")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ingresso">Ingresso (somar como entrada — banco externo)</SelectItem>
                        <SelectItem value="ajuste">Ajuste (definir saldo igual à planilha)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    const exemplo = [
                      { item: "Camisa Polo", tamanho: "M", quantidade: 10, quantidade_minima: 5 },
                      { item: "Bota de Segurança", tamanho: "42", quantidade: 4, quantidade_minima: 2 },
                    ];
                    exportarExcel("modelo_importacao_estoque.xlsx", "Estoque",
                      [
                        { key: "item", label: "item" }, { key: "tamanho", label: "tamanho" },
                        { key: "quantidade", label: "quantidade" },
                        { key: "quantidade_minima", label: "quantidade_minima" },
                      ], exemplo);
                  }}>
                    <FileSpreadsheet className="w-4 h-4 mr-1" />Baixar modelo
                  </Button>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const buf = await file.arrayBuffer();
                        const wb = XLSX.read(buf);
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
                        const rows = json.map((r) => {
                          const lk = (k: string) => {
                            const key = Object.keys(r).find((kk) => kk.toLowerCase().trim() === k);
                            return key ? r[key] : undefined;
                          };
                          const qRaw = lk("quantidade") ?? lk("quantidade_atual");
                          const qMinRaw = lk("quantidade_minima");
                          return {
                            item: String(lk("item") ?? "").trim(),
                            tamanho: lk("tamanho") != null ? String(lk("tamanho")).trim() : "",
                            quantidade: qRaw !== "" && qRaw != null ? Number(qRaw) : 0,
                            quantidade_minima: qMinRaw !== "" && qMinRaw != null ? Number(qMinRaw) : undefined,
                          };
                        }).filter((r) => r.item);
                        setImportPreview(rows);
                        setImportResult(null);
                      } catch (err) {
                        toast.error("Erro ao ler arquivo: " + (err as Error).message);
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </div>

                {importPreview && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Pré-visualização: {importPreview.length} linha(s)</div>
                    <div className="max-h-64 overflow-auto border rounded">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Item</TableHead><TableHead>Tam.</TableHead>
                          <TableHead className="text-right">Quantidade</TableHead><TableHead className="text-right">Mínimo</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {importPreview.slice(0, 50).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.item}</TableCell>
                              <TableCell className="text-xs">{r.tamanho || "—"}</TableCell>
                              <TableCell className="text-right">{r.quantidade ?? 0}</TableCell>
                              <TableCell className="text-right">{r.quantidade_minima ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setImportPreview(null); setImportResult(null); }}>Cancelar</Button>
                      <Button disabled={importing} onClick={async () => {
                        setImporting(true);
                        try {
                          const rowsToSend = importPreview.map((r) => ({
                            item: r.item, tamanho: r.tamanho,
                            quantidade: Number(r.quantidade ?? 0),
                            quantidade_minima: r.quantidade_minima,
                          }));
                          const res = await importFn({ data: { rows: rowsToSend, modo: importModo } });
                          setImportResult(res);
                          toast.success(`Importação concluída: ${res.ok}/${res.total}`);
                          qc.invalidateQueries({ queryKey: ["almox-estoque"] });
                          qc.invalidateQueries({ queryKey: ["almox-movs"] });
                        } catch (err) {
                          toast.error((err as Error).message);
                        } finally { setImporting(false); }
                      }}>
                        <Upload className="w-4 h-4 mr-1" />Confirmar importação
                      </Button>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className="border rounded-md p-3 space-y-2">
                    <p className="text-sm">
                      <Badge>{importResult.ok} ok</Badge>{" "}
                      <Badge variant="destructive">{importResult.errors.length} erro(s)</Badge>
                      {" "}de {importResult.total}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="max-h-40 overflow-auto text-xs space-y-1">
                        {importResult.errors.map((e, i) => (
                          <div key={i}>Linha {e.linha}: <span className="text-red-600">{e.motivo}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
