import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, CLASSIFICACAO_COMERCIAL_OPTS } from "@/components/extras-helpers";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ExtrasFilters, applyServerFilters, applyClientFilters, type ExtrasFilterState } from "@/components/extras-filters";
import { ExtrasExportActions } from "@/components/extras-export";

const searchSchema = z.object({
  empresa_id: fallback(z.string().optional(), undefined),
  cliente_id: fallback(z.string().optional(), undefined),
  colaborador_id: fallback(z.string().optional(), undefined),
  matricula: fallback(z.string().optional(), undefined),
  nome: fallback(z.string().optional(), undefined),
  funcao_id: fallback(z.string().optional(), undefined),
  emitente_id: fallback(z.string().optional(), undefined),
  situacao_servico: fallback(z.string().optional(), undefined),
  status: fallback(z.string().optional(), undefined),
  situacao_financeira: fallback(z.string().optional(), undefined),
  semana_ref: fallback(z.string().optional(), undefined),
  data_ini: fallback(z.string().optional(), undefined),
  data_fim: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/aprovacoes/financeiro")({
  validateSearch: zodValidator(searchSchema),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const filters: ExtrasFilterState = search;
  const setFilters = (next: ExtrasFilterState) => navigate({ search: next as any, replace: true });

  const list = useQuery({
    queryKey: ["extras", "aprovado_operacional", filters],
    queryFn: async () => {
      let q = supabase
        .from("extras")
        .select("*, colaboradores!colaborador_id(nome,matricula), clientes(nome_fantasia), empresas(nome,razao_social), funcoes(nome)")
        .eq("status", "aprovado_operacional")
        .order("data", { ascending: false });
      q = applyServerFilters(q, { ...filters, status: undefined });
      const { data, error } = await q;
      if (error) throw error;
      return applyClientFilters(data ?? [], filters);
    },
  });
  const aprovar = useMutation({
    mutationFn: async (row: { id: string; classificacao_comercial: string }) => {
      const patch: Record<string, any> = { status: "aprovado_financeiro" };
      // À Cobrar segue para Faturamento; os demais já vão direto para Recibos como "pago"
      if (row.classificacao_comercial !== "a_cobrar") {
        patch.situacao_financeira = "pago";
        patch.forma_pagamento = "dinheiro";
        patch.data_pagamento = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from("extras").update(patch as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Aprovado financeiramente"); },
    onError: (e: any) => toast.error(e.message),
  });
  const setClass = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: string }) => {
      const { error } = await supabase.from("extras").update({ classificacao_comercial: v as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Classificação atualizada"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Aprovação Financeira" description="Liberar para pagamento" />
      <ExtrasFilters value={filters} onChange={setFilters} showSitFin />
      <div className="flex justify-end mb-2">
        <ExtrasExportActions rows={list.data ?? []} titulo="Aprovação Financeira" filename="aprovacao-financeira" variant="financeiro" />
      </div>
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Classificação</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.matricula} — {e.colaboradores?.nome}</TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>
                  <Select value={e.classificacao_comercial} onValueChange={(v) => setClass.mutate({ id: e.id, v })}>
                    <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{CLASSIFICACAO_COMERCIAL_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell><Button size="sm" onClick={() => aprovar.mutate({ id: e.id, classificacao_comercial: e.classificacao_comercial })}><Check className="h-3 w-3 mr-1" />Aprovar Financeiro</Button></TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum aguardando aprovação financeira</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
