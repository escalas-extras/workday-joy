import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, RejeitarDialog, SITUACAO_SERVICO_OPTS } from "@/components/extras-helpers";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/aprovacoes/operacional")({
  validateSearch: zodValidator(searchSchema),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const filters: ExtrasFilterState = search;
  const setFilters = (next: ExtrasFilterState) => navigate({ search: next as any, replace: true });

  const [rejId, setRejId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["extras", "pendente", filters],
    queryFn: async () => {
      let q = supabase
        .from("extras")
        .select("*, colaboradores!colaborador_id(nome,matricula), clientes(nome_fantasia), empresas(nome,razao_social), funcoes(nome)")
        .eq("status", "pendente")
        .order("data", { ascending: false });
      q = applyServerFilters(q, { ...filters, status: undefined }); // status fixo
      const { data, error } = await q;
      if (error) throw error;
      return applyClientFilters(data ?? [], filters);
    },
  });
  const aprovar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("extras").update({ status: "aprovado_operacional" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Aprovado"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Aprovação Operacional" description="Validar lançamentos pendentes" />
      <ExtrasFilters value={filters} onChange={setFilters} />
      <div className="flex justify-end mb-2">
        <ExtrasExportActions rows={list.data ?? []} titulo="Aprovação Operacional — Pendentes" filename="aprovacao-operacional" variant="operacional" />
      </div>
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Situação Serv.</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.matricula} — {e.colaboradores?.nome}</TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>{SITUACAO_SERVICO_OPTS.find((o) => o.v === e.situacao_servico)?.l}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => aprovar.mutate(e.id)}><Check className="h-3 w-3 mr-1" />Aprovar</Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejId(e.id)}><X className="h-3 w-3 mr-1" />Rejeitar</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nada pendente</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {rejId && <RejeitarDialog extraId={rejId} open={!!rejId} onOpenChange={(o) => !o && setRejId(null)} />}
    </div>
  );
}
