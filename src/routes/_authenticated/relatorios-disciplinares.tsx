import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { getDashboardData, logPrintAction } from "@/lib/disciplinary-audit.functions";
import { exportarExcel } from "@/lib/relatorios-export";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/relatorios-disciplinares")({ component: Page });

const COLORS = ["#060B5A", "#D61E1E", "#5B6BAD", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4"];

const ACT_LABEL: Record<string, string> = {
  orientacao_verbal: "Orientação Verbal",
  advertencia_escrita: "Advertência",
  suspensao: "Suspensão",
  justa_causa: "Justa Causa",
};

function Page() {
  const fn = useServerFn(getDashboardData);
  const log = useServerFn(logPrintAction);
  const relatorioId = useMemo(() => crypto.randomUUID(), []);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [empresaId, setEmpresaId] = useState<string>("");
  const [actionType, setActionType] = useState<string>("");

  const { data: empresas } = useQuery({
    queryKey: ["empresas-sel"],
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("id, nome").eq("situacao", "ativo").order("nome");
      return data ?? [];
    },
  });

  const filters = { date_from: dateFrom || null, date_to: dateTo || null, empresa_id: empresaId || null, action_type: actionType || null, colaborador_id: null };
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["disc-dashboard", filters],
    queryFn: () => fn({ data: filters }),
  });

  const cards = useMemo(() => {
    const t = data?.totals;
    return [
      { label: "Orientações", value: t?.orientacao_verbal ?? 0, color: "text-blue-600" },
      { label: "Advertências", value: t?.advertencia_escrita ?? 0, color: "text-amber-600" },
      { label: "Suspensões", value: t?.suspensao ?? 0, color: "text-orange-600" },
      { label: "Justas Causas", value: t?.justa_causa ?? 0, color: "text-red-600" },
      { label: "Reincidências", value: t?.reincidentes ?? 0, color: "text-purple-600" },
      { label: "Processos em andamento", value: t?.processos ?? 0, color: "text-slate-700" },
    ];
  }, [data]);

  async function exportExcel() {
    if (!data) return;
    exportarExcel(
      `relatorio_disciplinar_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Medidas",
      [
        { key: "warning_date", label: "Data" }, { key: "action_type", label: "Tipo" },
        { key: "colaborador_nome", label: "Colaborador" }, { key: "cpf", label: "CPF" },
        { key: "empresa_nome", label: "Empresa" }, { key: "reason_nome", label: "Motivo" },
      ],
      data.rows as unknown as Record<string, unknown>[],
    );
    try { await log({ data: { entity_type: "relatorio", entity_id: relatorioId, action: "download" } }); } catch { /* noop */ }
  }
  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ format: "a4", unit: "pt", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Relatório Disciplinar Executivo", 40, 40);
    doc.setFontSize(10);
    doc.text(`Período: ${dateFrom || "—"} a ${dateTo || "—"}`, 40, 60);
    let y = 90;
    cards.forEach((c, i) => {
      const x = 40 + (i % 3) * 250;
      if (i > 0 && i % 3 === 0) y += 70;
      doc.setFontSize(9); doc.text(c.label, x, y);
      doc.setFontSize(20); doc.text(String(c.value), x, y + 25);
    });
    y += 90;
    autoTable(doc, {
      startY: y, head: [["Data", "Tipo", "Colaborador", "Empresa", "Motivo"]],
      body: (data.rows ?? []).slice(0, 200).map((r) => [
        r.warning_date, ACT_LABEL[r.action_type as string] ?? r.action_type,
        r.colaborador_nome ?? "—", r.empresa_nome ?? "—", r.reason_nome ?? "—",
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [6, 11, 90] },
    });
    doc.save(`relatorio_disciplinar_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Relatórios Disciplinares" description="Dashboard executivo com filtros e exportação" />

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div><Label>De</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <div>
            <Label>Empresa</Label>
            <Select value={empresaId || "all"} onValueChange={(v) => setEmpresaId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {empresas?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={actionType || "all"} onValueChange={(v) => setActionType(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(ACT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={() => refetch()} className="w-full">Aplicar</Button></div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
            <Button variant="outline" onClick={exportPdf}><FileText className="w-4 h-4 mr-1" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Medidas por mês</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byMonth ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" /><YAxis allowDecimals={false} /><Tooltip />
                <Bar dataKey="qtd" fill="#060B5A" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Motivos mais frequentes</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.byReason ?? []} dataKey="qtd" nameKey="motivo" outerRadius={90}>
                  {(data?.byReason ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Medidas por empresa</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byCompany ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="empresa" width={200} />
                <Tooltip /><Bar dataKey="qtd" fill="#D61E1E" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento ({data?.rows?.length ?? 0} registros)</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Colaborador</TableHead>
                <TableHead>CPF</TableHead><TableHead>Empresa</TableHead><TableHead>Motivo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={6}>Carregando…</TableCell></TableRow>
                : (data?.rows ?? []).slice(0, 500).map((r) => (
                  <TableRow key={r.id as string}>
                    <TableCell>{r.warning_date as string}</TableCell>
                    <TableCell>{ACT_LABEL[r.action_type as string] ?? r.action_type}</TableCell>
                    <TableCell>{(r.colaborador_nome as string) ?? "—"}</TableCell>
                    <TableCell>{(r.cpf as string) ?? "—"}</TableCell>
                    <TableCell>{(r.empresa_nome as string) ?? "—"}</TableCell>
                    <TableCell>{(r.reason_nome as string) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
