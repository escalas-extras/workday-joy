import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { getDisciplinaryIntel, type IntelFilters } from "@/lib/disciplinary-intelligence.functions";
import { logPrintAction } from "@/lib/disciplinary-audit.functions";
import { exportarExcel } from "@/lib/relatorios-export";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/inteligencia-disciplinar")({ component: Page });

const ACT: Record<string, string> = {
  orientacao_verbal: "Orientação", advertencia_escrita: "Advertência",
  suspensao: "Suspensão", justa_causa: "Justa Causa",
};
const STATUS: Record<string, string> = {
  aberto: "Aberto", em_apuracao: "Em Apuração", aguardando_rh: "Aguardando RH",
  aguardando_diretoria: "Aguardando Diretoria", aprovado: "Aprovado",
  arquivado: "Arquivado", convertido_justa_causa: "Convertido em JC",
};
const COLORS = ["#060B5A", "#D61E1E", "#5B6BAD", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"];

function Page() {
  const fn = useServerFn(getDisciplinaryIntel);
  const log = useServerFn(logPrintAction);
  const relatorioId = useMemo(() => crypto.randomUUID(), []);

  const [filters, setFilters] = useState<IntelFilters>({});
  const upd = (k: keyof IntelFilters, v: string) => setFilters((p) => ({ ...p, [k]: v || null }));

  const { data: empresas } = useQuery({
    queryKey: ["int-empresas"],
    queryFn: async () => (await supabase.from("empresas").select("id, nome").eq("situacao", "ativo").order("nome")).data ?? [],
  });
  const { data: clientes } = useQuery({
    queryKey: ["int-clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id, nome_fantasia").eq("situacao", "ativo").order("nome_fantasia")).data ?? [],
  });
  const { data: motivos } = useQuery({
    queryKey: ["int-motivos"],
    queryFn: async () => (await supabase.from("warning_reasons").select("id, nome").order("motivo")).data ?? [],
  });
  const { data: supers } = useQuery({
    queryKey: ["int-supers"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["intel", filters],
    queryFn: () => fn({ data: filters }),
  });

  async function exportExcel() {
    if (!data) return;
    exportarExcel(
      `inteligencia_disciplinar_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Medidas",
      [
        { key: "warning_date", label: "Data" }, { key: "action_type", label: "Tipo" },
        { key: "colaborador_nome", label: "Colaborador" }, { key: "cpf", label: "CPF" },
        { key: "empresa_nome", label: "Empresa" }, { key: "reason_nome", label: "Motivo" },
        { key: "supervisor", label: "Supervisor" },
      ],
      data.rows as unknown as Record<string, unknown>[],
    );
    try { await log({ data: { entity_type: "relatorio", entity_id: relatorioId, action: "download" } }); } catch { /* noop */ }
  }
  async function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ format: "a4", unit: "pt", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Inteligência Disciplinar — Executivo", 40, 40);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 55);
    let y = 80;
    const cards = [
      { l: "Orientações", v: data.totals.orientacao_verbal },
      { l: "Advertências", v: data.totals.advertencia_escrita },
      { l: "Suspensões", v: data.totals.suspensao },
      { l: "Justas Causas", v: data.totals.justa_causa },
      { l: "Processos", v: data.totals.processos },
      { l: "Alertas", v: data.alerts.length },
    ];
    cards.forEach((c, i) => {
      const x = 40 + (i % 3) * 250;
      if (i > 0 && i % 3 === 0) y += 60;
      doc.setFontSize(9); doc.text(c.l, x, y);
      doc.setFontSize(18); doc.text(String(c.v), x, y + 22);
    });
    y += 80;
    if (data.alerts.length) {
      doc.setFontSize(11); doc.text("Alertas Automáticos", 40, y); y += 8;
      autoTable(doc, {
        startY: y, head: [["Tipo", "Severidade", "Mensagem"]],
        body: data.alerts.slice(0, 30).map((a) => [a.type, a.severity, a.message]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [214, 30, 30] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    }
    doc.setFontSize(11); doc.text("Top 10 Motivos", 40, y); y += 4;
    autoTable(doc, {
      startY: y + 4, head: [["Motivo", "Qtd"]],
      body: data.tops.motivos.map((m) => [m.label, String(m.qtd)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [6, 11, 90] },
    });
    autoTable(doc, {
      head: [["Data", "Tipo", "Colaborador", "Empresa", "Motivo"]],
      body: data.rows.slice(0, 300).map((r) => [r.warning_date, ACT[r.action_type] ?? r.action_type, r.colaborador_nome, r.empresa_nome, r.reason_nome]),
      styles: { fontSize: 7 }, headStyles: { fillColor: [6, 11, 90] },
    });
    doc.save(`inteligencia_disciplinar_${new Date().toISOString().slice(0, 10)}.pdf`);
    try { await log({ data: { entity_type: "relatorio", entity_id: relatorioId, action: "download" } }); } catch { /* noop */ }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Inteligência Disciplinar" description="Dashboard executivo, timeline, alertas e indicadores" />

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div><Label>De</Label><Input type="date" value={filters.date_from ?? ""} onChange={(e) => upd("date_from", e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={filters.date_to ?? ""} onChange={(e) => upd("date_to", e.target.value)} /></div>
          <div>
            <Label>Empresa</Label>
            <Select value={filters.empresa_id ?? "all"} onValueChange={(v) => upd("empresa_id", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{empresas?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cliente/Posto</Label>
            <Select value={filters.cliente_id ?? "all"} onValueChange={(v) => upd("cliente_id", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supervisor</Label>
            <Select value={filters.supervisor_id ?? "all"} onValueChange={(v) => upd("supervisor_id", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{supers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={filters.action_type ?? "all"} onValueChange={(v) => upd("action_type", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(ACT).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo</Label>
            <Select value={filters.reason_id ?? "all"} onValueChange={(v) => upd("reason_id", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{motivos?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status (Processo)</Label>
            <Select value={filters.status ?? "all"} onValueChange={(v) => upd("status", v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-2">
            <Button onClick={() => refetch()} disabled={isFetching} className="flex-1">Aplicar</Button>
            <Button variant="outline" onClick={() => setFilters({})}>Limpar</Button>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" onClick={exportPdf}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { l: "Orientações", v: data?.totals.orientacao_verbal ?? 0, c: "text-blue-600", to: "/advertencias" as const },
          { l: "Advertências", v: data?.totals.advertencia_escrita ?? 0, c: "text-amber-600", to: "/advertencias" as const },
          { l: "Suspensões", v: data?.totals.suspensao ?? 0, c: "text-orange-600", to: "/advertencias" as const },
          { l: "Justas Causas", v: data?.totals.justa_causa ?? 0, c: "text-red-600", to: "/processos" as const },
          { l: "Processos", v: data?.totals.processos ?? 0, c: "text-slate-700", to: "/processos" as const },
          { l: "Alertas", v: data?.alerts.length ?? 0, c: "text-purple-700", to: null as string | null },
        ].map((k) => {
          const inner = (
            <Card className={k.to ? "hover:border-primary transition-colors cursor-pointer h-full" : "h-full"}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{k.l}</p>
                <p className={`text-3xl font-bold ${k.c}`}>{k.v}</p>
              </CardContent>
            </Card>
          );
          return k.to ? <Link key={k.l} to={k.to}>{inner}</Link> : <div key={k.l}>{inner}</div>;
        })}
      </div>

      {!!data?.alerts.length && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertCircle className="w-4 h-4" />Alertas Automáticos ({data.alerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-auto">
            {data.alerts.map((a, i) => (
              <Alert key={i} variant={a.severity === "critical" ? "destructive" : "default"}>
                <AlertTitle className="text-sm">{a.type}</AlertTitle>
                <AlertDescription className="text-xs">{a.message}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="tabela">Detalhamento</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Medidas por mês</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer><BarChart data={data?.byMonth ?? []}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis allowDecimals={false} /><Tooltip />
                  <Bar dataKey="qtd" fill="#060B5A" />
                </BarChart></ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Motivos</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer><PieChart>
                  <Pie data={data?.tops.motivos ?? []} dataKey="qtd" nameKey="label" outerRadius={80}>
                    {(data?.tops.motivos ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /><Legend />
                </PieChart></ResponsiveContainer>
              </CardContent>
            </Card>
            {[
              { t: "Top 10 Reincidentes", rows: (data?.tops.reincidentes ?? []).map((r) => ({ label: r.nome, qtd: r.n })) },
              { t: "Top 10 Clientes/Postos", rows: data?.tops.clientes ?? [] },
              { t: "Top 10 Supervisores", rows: data?.tops.supervisores ?? [] },
              { t: "Medidas por Empresa", rows: data?.tops.empresas ?? [] },
            ].map((b) => (
              <Card key={b.t}>
                <CardHeader><CardTitle className="text-base">{b.t}</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer><BarChart data={b.rows} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={140} />
                    <Tooltip /><Bar dataKey="qtd" fill="#D61E1E" />
                  </BarChart></ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3 pt-2">
          {(data?.timeline ?? []).map((y) => (
            <Collapsible key={y.year} defaultOpen>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2"><ChevronDown className="w-4 h-4" />{y.year}</CardTitle>
                    <Badge variant="secondary">{y.total}</Badge>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-2">
                    {y.months.map((m) => (
                      <Collapsible key={m.month} defaultOpen={false}>
                        <CollapsibleTrigger className="w-full text-left">
                          <div className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/50">
                            <span className="text-sm font-medium">{m.month}</span>
                            <Badge variant="outline">{m.items.length}</Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 space-y-1 pl-3 border-l-2 border-muted">
                            {m.items.map((it) => (
                              <div key={it.id} className="text-xs py-1">
                                <span className="font-semibold">{it.warning_date}</span> · <Badge variant="secondary">{ACT[it.action_type] ?? it.action_type}</Badge> · {it.colaborador} · {it.reason} · {it.empresa} · <span className="text-muted-foreground">Sup: {it.supervisor}</span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
          {!data?.timeline.length && <p className="text-sm text-muted-foreground">Sem registros.</p>}
        </TabsContent>

        <TabsContent value="ranking" className="pt-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Ranking Disciplinar (Top 50)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Colaborador</TableHead><TableHead>CPF</TableHead><TableHead>Ocorrências</TableHead><TableHead>Última</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data?.ranking ?? []).map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>{r.cpf}</TableCell>
                      <TableCell><Badge variant={r.n >= 5 ? "destructive" : r.n >= 3 ? "default" : "secondary"}>{r.n}</Badge></TableCell>
                      <TableCell>{r.last}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tabela" className="pt-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalhamento ({data?.rows.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Colaborador</TableHead>
                    <TableHead>CPF</TableHead><TableHead>Empresa</TableHead><TableHead>Motivo</TableHead><TableHead>Supervisor</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? <TableRow><TableCell colSpan={7}>Carregando…</TableCell></TableRow>
                    : (data?.rows ?? []).slice(0, 500).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.warning_date}</TableCell>
                        <TableCell>{ACT[r.action_type] ?? r.action_type}</TableCell>
                        <TableCell>{r.colaborador_nome}</TableCell>
                        <TableCell>{r.cpf}</TableCell>
                        <TableCell>{r.empresa_nome}</TableCell>
                        <TableCell>{r.reason_nome}</TableCell>
                        <TableCell>{r.supervisor}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
