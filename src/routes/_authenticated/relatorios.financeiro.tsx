import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/app-shell";
import { exportarExcel, exportarPdf, type ColunaRelatorio } from "@/lib/relatorios-export";
import { SITUACAO_SERVICO_LABEL } from "@/components/extras-helpers";
import { formatBRL } from "@/lib/extenso";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { buildMesesOpts, buildSemanasOpts, derivePeriodo, agruparMesSemana } from "@/lib/semana-buckets";

export const Route = createFileRoute("/_authenticated/relatorios/financeiro")({ component: Page });

type Linha = {
  id: string; data: string; valor: number; classificacao: "contrato" | "a_cobrar";
  situacao_financeira: string | null; status: string;
  cliente: string; empresa: string; colaborador: string; coberto: string; motivo_subst: string;
  lancado_por: string;
};

function Page() {
  const [mesRef, setMesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [semana, setSemana] = useState<string>("_all");

  const mesesOpts = useMemo(() => buildMesesOpts(), []);
  const semanasOpts = useMemo(() => buildSemanasOpts(mesRef), [mesRef]);
  const { de, ate } = useMemo(() => derivePeriodo(mesRef, semana, semanasOpts), [mesRef, semana, semanasOpts]);

  const q = useQuery({
    queryKey: ["rel-financeiro", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase.from("extras")
        .select("id,data,valor,classificacao_comercial,situacao_servico,situacao_financeira,status,funcoes(nome),clientes(nome_fantasia,cliente_empresas(situacao,empresas(id,nome))),empresas(id,nome),colaboradores!colaborador_id(nome,empresas(id,nome)),coberto:colaboradores!colaborador_coberto_id(nome)")
        .gte("data", de).lte("data", ate).order("data");
      if (error) throw error;
      const isJSP = (n: string) => /\bjsp\b/i.test(n);
      const remapAvulso = (n: string) => (/^avulso$/i.test(n) ? "J.A" : n);
      const empresaNome = (r: any): string => {
        if (r.empresas?.nome) return remapAvulso(r.empresas.nome);
        const ces: any[] = r.clientes?.cliente_empresas ?? [];
        const ativas = ces.filter((ce) => ce.situacao === "ativo" && ce.empresas).map((ce) => ce.empresas);
        const lista = ativas.length ? ativas : ces.filter((ce) => ce.empresas).map((ce) => ce.empresas);
        if (lista.length === 1) return remapAvulso(lista[0].nome);
        if (lista.length > 1) {
          const vig = /vigilante/i.test(r.funcoes?.nome ?? "");
          const escolhida = vig
            ? lista.find((e: any) => isJSP(e.nome))
            : lista.find((e: any) => !isJSP(e.nome));
          return remapAvulso((escolhida ?? lista[0]).nome);
        }
        if (r.colaboradores?.empresas?.nome) return remapAvulso(r.colaboradores.empresas.nome);
        return "—";
      };
      return (data ?? []).map((r: any): Linha => ({
        id: r.id, data: r.data, valor: Number(r.valor),
        classificacao: r.classificacao_comercial as "contrato" | "a_cobrar",
        situacao_financeira: r.situacao_financeira, status: r.status,
        cliente: r.clientes?.nome_fantasia ?? "",
        empresa: empresaNome(r),
        colaborador: r.colaboradores?.nome ?? "",
        coberto: r.coberto?.nome ?? "",
        motivo_subst: r.coberto?.nome ? (SITUACAO_SERVICO_LABEL[r.situacao_servico] ?? r.situacao_servico ?? "") : "",
      }));
    },
  });

  // Pendentes vs Fechados (manipulados): pago / faturado / cancelado = fechado
  const isFechado = (r: Linha) =>
    r.status === "cancelado" || r.situacao_financeira === "pago" || r.situacao_financeira === "faturado" || r.situacao_financeira === "cancelado";
  const pendentes = useMemo(() => (q.data ?? []).filter((r) => !isFechado(r)), [q.data]);
  const arquivados = useMemo(() => (q.data ?? []).filter(isFechado), [q.data]);

  const totais = useMemo(() => {
    const rows = q.data ?? [];
    const calc = (filtroClasse: "contrato" | "a_cobrar") => {
      const grp = rows.filter((r) => r.classificacao === filtroClasse);
      const soma = (pred: (r: Linha) => boolean) => grp.filter(pred).reduce((s, r) => s + r.valor, 0);
      return {
        pago: soma((r) => r.situacao_financeira === "pago"),
        pendente: soma((r) => r.situacao_financeira === "pendente" || r.situacao_financeira === null),
        cancelado: soma((r) => r.status === "cancelado"),
        faturado: soma((r) => r.situacao_financeira === "faturado"),
      };
    };
    return { contrato: calc("contrato"), a_cobrar: calc("a_cobrar") };
  }, [q.data]);

  const toExport = (rs: Linha[]) => rs.map((r) => ({
    data: r.data, cliente: r.cliente, empresa: r.empresa, colaborador: r.colaborador,
    coberto: r.coberto || "—",
    motivo_subst: r.motivo_subst || "—",
    classificacao: r.classificacao === "a_cobrar" ? "À Cobrar" : "Contrato",
    situacao: r.situacao_financeira ?? "—", status: r.status,
    valor_fmt: formatBRL(r.valor),
  }));

  const cols: ColunaRelatorio[] = [
    { key: "data", label: "Data", width: 22 },
    { key: "cliente", label: "Cliente", width: 42 },
    { key: "empresa", label: "Empresa", width: 30 },
    { key: "colaborador", label: "Colaborador", width: 40 },
    { key: "coberto", label: "Substituído", width: 40 },
    { key: "motivo_subst", label: "Motivo Subst.", width: 28 },
    { key: "classificacao", label: "Classificação", width: 22 },
    { key: "status", label: "Status", width: 26 },
    { key: "situacao", label: "Situação Fin.", width: 22 },
    { key: "valor_fmt", label: "Valor", align: "right", width: 22 },
  ];
  // PDF compacto: remove "Situação Fin." e "Status" para caber na página
  const pdfCols: ColunaRelatorio[] = cols.filter((c) => c.key !== "situacao" && c.key !== "status");

  const tabela = (rs: Linha[], emptyMsg: string) => {
    const rows = toExport(rs);
    return (
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Empresa</TableHead><TableHead>Colaborador</TableHead><TableHead>Substituído</TableHead><TableHead>Motivo Subst.</TableHead>
            <TableHead>Classificação</TableHead><TableHead>Status</TableHead><TableHead>Situação Fin.</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.data}</TableCell><TableCell>{r.cliente}</TableCell><TableCell>{r.empresa}</TableCell><TableCell>{r.colaborador}</TableCell><TableCell>{r.coberto}</TableCell><TableCell>{r.motivo_subst}</TableCell>
                <TableCell>{r.classificacao}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.situacao}</TableCell>
                <TableCell className="text-right">{r.valor_fmt}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">{emptyMsg}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    );
  };

  const buckets = useMemo(() => agruparMesSemana(arquivados, (r) => r.data), [arquivados]);
  const totalGeral = (q.data ?? []).reduce((s, r) => s + r.valor, 0);
  const onChangeMes = (v: string) => { setMesRef(v); setSemana("_all"); };

  return (
    <div>
      <PageHeader title="Relatório Financeiro" description="Totais por status, separados por Contrato e À Cobrar" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 items-end rounded-md border p-3 bg-card">
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
        <Button size="sm" variant="outline" onClick={() => exportarExcel(`financeiro-${de}-${ate}.xlsx`, "Financeiro", cols, toExport(q.data ?? []))}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportarPdf(`financeiro-${de}-${ate}.pdf`, "Relatório Financeiro", pdfCols, toExport(q.data ?? []))}>
          <FileDown className="h-4 w-4 mr-1" />PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {(["contrato", "a_cobrar"] as const).map((k) => (
          <Card key={k}>
            <CardHeader><CardTitle>{k === "contrato" ? "Contrato" : "À Cobrar"}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Pago</div><div className="text-lg font-bold text-green-600">{formatBRL(totais[k].pago)}</div></div>
              <div><div className="text-xs text-muted-foreground">Pendente</div><div className="text-lg font-bold text-amber-600">{formatBRL(totais[k].pendente)}</div></div>
              <div><div className="text-xs text-muted-foreground">Cancelado</div><div className="text-lg font-bold text-red-600">{formatBRL(totais[k].cancelado)}</div></div>
              <div><div className="text-xs text-muted-foreground">Faturado</div><div className="text-lg font-bold text-blue-600">{formatBRL(totais[k].faturado)}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Accordion type="multiple" defaultValue={["pendentes"]} className="space-y-2">
        <AccordionItem value="pendentes" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Pendentes — aguardando processamento ({pendentes.length})
          </AccordionTrigger>
          <AccordionContent>{tabela(pendentes, "Nenhum registro pendente")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="arquivados" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Arquivos fechados — pago / faturado / cancelado ({arquivados.length})
          </AccordionTrigger>
          <AccordionContent>
            {!buckets.length
              ? <div className="text-sm text-muted-foreground py-3">Nenhum registro fechado</div>
              : (
                <Accordion type="multiple" className="space-y-2">
                  {buckets.map((mes) => {
                    const total = mes.semanas.reduce((s, w) => s + w.rows.length, 0);
                    return (
                      <AccordionItem key={mes.key} value={mes.key} className="border rounded-md bg-muted/30 px-3">
                        <AccordionTrigger className="text-sm">{mes.label} ({total})</AccordionTrigger>
                        <AccordionContent>
                          <Accordion type="multiple" className="space-y-2">
                            {mes.semanas.map((sb) => (
                              <AccordionItem key={sb.key} value={sb.key} className="border rounded-md bg-card px-3">
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
              )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-3 text-right text-sm font-semibold">Total geral: {formatBRL(totalGeral)} — {(q.data ?? []).length} registro(s)</div>
    </div>
  );
}
