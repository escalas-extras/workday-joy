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
import { exportarExcel } from "@/lib/relatorios-export";
import { FileSpreadsheet, Upload } from "lucide-react";
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

  const [empresaSel, setEmpresaSel] = useState<string>("");
  const [filtroBaixo, setFiltroBaixo] = useState(false);

  const base = useQuery({ queryKey: ["almox-base"], queryFn: () => baseFn() });
  const estoque = useQuery({
    queryKey: ["almox-estoque", empresaSel, filtroBaixo],
    queryFn: () => estoqueFn({ data: { empresa_id: empresaSel || null, abaixoMinimo: filtroBaixo } }),
  });
  const movs = useQuery({
    queryKey: ["almox-movs", empresaSel],
    queryFn: () => movFn({ data: { empresa_id: empresaSel || null, limit: 200 } }),
  });
  const pendencias = useQuery({ queryKey: ["almox-pend"], queryFn: () => pendFn() });

  // form de movimentação
  const [mov, setMov] = useState({
    empresa_id: "", item_id: "", tamanho: "" as string,
    tipo: "entrada" as "entrada" | "saida",
    motivo: "compra", quantidade: 1, observacao: "",
  });
  const itemSel = useMemo(() => base.data?.itens.find((i) => i.id === mov.item_id), [base.data, mov.item_id]);
  const catSel = useMemo(() => base.data?.categorias.find((c) => c.id === itemSel?.categoria_id), [base.data, itemSel]);
  const tamanhosDisp = catSel ? TAMANHOS[catSel.tipo_tamanho] ?? [] : [];

  async function salvarMin(row: { empresa_id: string; item_id: string; tamanho: string | null; quantidade_minima: number }) {
    const v = prompt(`Quantidade mínima:`, String(row.quantidade_minima));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) { toast.error("Valor inválido"); return; }
    try {
      await upMinFn({ data: { empresa_id: row.empresa_id, item_id: row.item_id, tamanho: row.tamanho, quantidade_minima: n } });
      toast.success("Mínimo atualizado");
      qc.invalidateQueries({ queryKey: ["almox-estoque"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function salvarMov(e: React.FormEvent) {
    e.preventDefault();
    if (!mov.empresa_id || !mov.item_id || !mov.quantidade) { toast.error("Preencha empresa, item e quantidade"); return; }
    try {
      await regFn({ data: {
        empresa_id: mov.empresa_id, item_id: mov.item_id,
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

  return (
    <div className="space-y-4">
      <PageHeader title="Almoxarifado" description="Controle de uniformes e equipamentos" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Itens em estoque</p>
          <p className="text-3xl font-bold">{estoque.data?.length ?? 0}</p>
        </CardContent></Card>
        <Card className="cursor-pointer hover:border-primary" onClick={() => { setFiltroBaixo(true); }}>
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
        </TabsList>

        <TabsContent value="estoque" className="space-y-3 pt-2">
          <Card><CardContent className="pt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <Label>Empresa</Label>
              <Select value={empresaSel || "all"} onValueChange={(v) => setEmpresaSel(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {base.data?.empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filtroBaixo} onChange={(e) => setFiltroBaixo(e.target.checked)} />
              Somente abaixo do mínimo
            </label>
            <Button variant="outline" size="sm" onClick={() => {
              const rows = (estoque.data ?? []).map((r) => ({
                empresa: r.empresas?.nome ?? "",
                item: r.almox_itens?.nome ?? "",
                tamanho: r.tamanho ?? "",
                atual: r.quantidade_atual,
                minimo: r.quantidade_minima,
                abaixo: r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima ? "Sim" : "Não",
              }));
              exportarExcel(`almoxarifado_estoque_${new Date().toISOString().slice(0,10)}.xlsx`, "Estoque",
                [
                  { key: "empresa", label: "Empresa" }, { key: "item", label: "Item" },
                  { key: "tamanho", label: "Tamanho" }, { key: "atual", label: "Atual" },
                  { key: "minimo", label: "Mínimo" }, { key: "abaixo", label: "Abaixo do mínimo" },
                ], rows);
            }}>
              <FileSpreadsheet className="w-4 h-4 mr-1" />Excel
            </Button>
          </CardContent></Card>

          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Empresa</TableHead><TableHead>Item</TableHead><TableHead>Tamanho</TableHead>
                <TableHead className="text-right">Atual</TableHead><TableHead className="text-right">Mínimo</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(estoque.data ?? []).map((r) => {
                  const baixo = r.quantidade_minima > 0 && r.quantidade_atual < r.quantidade_minima;
                  return (
                    <TableRow key={r.id} className={baixo ? "bg-orange-50" : ""}>
                      <TableCell className="text-xs">{r.empresas?.nome}</TableCell>
                      <TableCell className="text-xs font-medium">{r.almox_itens?.nome}</TableCell>
                      <TableCell className="text-xs">{r.tamanho || "—"}</TableCell>
                      <TableCell className="text-right">
                        {baixo ? <Badge variant="destructive">{r.quantidade_atual}</Badge> : r.quantidade_atual}
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.quantidade_minima}</TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => salvarMin(r)}>Min</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!estoque.data?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Sem registros.</TableCell></TableRow>
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
                    <Label>Empresa</Label>
                    <Select value={mov.empresa_id} onValueChange={(v) => setMov({ ...mov, empresa_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {base.data?.empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
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

        <TabsContent value="movs" className="pt-2">
          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Motivo</TableHead>
                <TableHead>Empresa</TableHead><TableHead>Item</TableHead><TableHead>Tam.</TableHead>
                <TableHead className="text-right">Qtd</TableHead><TableHead>Colaborador</TableHead><TableHead>Obs.</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(movs.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell><Badge variant={m.tipo === "entrada" ? "default" : "secondary"}>{m.tipo}</Badge></TableCell>
                    <TableCell className="text-xs">{m.motivo}</TableCell>
                    <TableCell className="text-xs">{m.empresas?.nome}</TableCell>
                    <TableCell className="text-xs">{m.almox_itens?.nome}</TableCell>
                    <TableCell className="text-xs">{m.tamanho || "—"}</TableCell>
                    <TableCell className="text-right">{m.quantidade}</TableCell>
                    <TableCell className="text-xs">{m.colaboradores?.nome ?? "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">{m.observacao}</TableCell>
                  </TableRow>
                ))}
                {!movs.data?.length && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Sem movimentações.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pendencias" className="pt-2">
          <Card><CardContent className="pt-3">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data entrega</TableHead><TableHead>Colaborador</TableHead><TableHead>Empresa</TableHead>
                <TableHead>Item</TableHead><TableHead>Tam.</TableHead>
                <TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Devolvido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(pendencias.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{p.data_entrega}</TableCell>
                    <TableCell className="text-xs font-medium">{p.colaboradores?.nome}</TableCell>
                    <TableCell className="text-xs">{p.empresas?.nome}</TableCell>
                    <TableCell className="text-xs">{p.almox_itens?.nome}</TableCell>
                    <TableCell className="text-xs">{p.tamanho || "—"}</TableCell>
                    <TableCell className="text-right">{p.quantidade}</TableCell>
                    <TableCell className="text-right">{p.quantidade_devolvida}</TableCell>
                    <TableCell><Badge variant={p.status === "em_uso" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {!pendencias.data?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Sem pendências.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
