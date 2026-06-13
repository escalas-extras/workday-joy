import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/extras-helpers";
import { toast } from "sonner";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/aprovacoes/financeiro")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["extras", "aprovado_operacional"],
    queryFn: async () => (await supabase.from("extras").select("*, colaboradores(nome,matricula), clientes(nome_fantasia)").eq("status", "aprovado_operacional").order("data", { ascending: false })).data ?? [],
  });
  const aprovar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("extras").update({ status: "aprovado_financeiro" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Aprovado financeiramente"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Aprovação Financeira" description="Liberar para pagamento" />
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell><Button size="sm" onClick={() => aprovar.mutate(e.id)}><Check className="h-3 w-3 mr-1" />Aprovar Financeiro</Button></TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum aguardando aprovação financeira</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
