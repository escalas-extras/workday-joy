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

export const Route = createFileRoute("/_authenticated/aprovacoes/operacional")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [rejId, setRejId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["extras", "pendente"],
    queryFn: async () => (await supabase.from("extras").select("*, colaboradores(nome,matricula), clientes(nome_fantasia)").eq("status", "pendente").order("data", { ascending: false })).data ?? [],
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
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Situação Serv.</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
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
