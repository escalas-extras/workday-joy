import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/extras-helpers";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/faturamento")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["extras", "faturamento"],
    queryFn: async () => {
      const { data } = await supabase.from("extras").select("*, colaboradores!colaborador_id(nome), clientes(nome_fantasia)")
        .eq("status", "aprovado_financeiro").eq("classificacao_comercial", "a_cobrar").order("data", { ascending: false });
      const { enrichEmitentes } = await import("@/lib/emitentes");
      return enrichEmitentes(data ?? []);
    },
  });
  const a_faturar = (list.data ?? []).filter((e: any) => e.situacao_financeira !== "faturado" && e.situacao_financeira !== "cancelado");
  const faturados = (list.data ?? []).filter((e: any) => e.situacao_financeira === "faturado");

  const faturar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("extras").update({ situacao_financeira: "faturado" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Faturado"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Faturamento" description="Lançamentos classificados como À Cobrar" />

      <h2 className="text-sm font-semibold mb-2">A faturar ({a_faturar.length})</h2>
      <div className="rounded-md border bg-card overflow-x-auto mb-6">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {a_faturar.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell><TableCell>{e.colaboradores?.nome}</TableCell><TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell><Button size="sm" onClick={() => faturar.mutate(e.id)}><Receipt className="h-3 w-3 mr-1" />Faturar</Button></TableCell>
              </TableRow>
            ))}
            {a_faturar.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">—</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-sm font-semibold mb-2">Faturados ({faturados.length})</h2>
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Faturado em</TableHead></TableRow></TableHeader>
          <TableBody>
            {faturados.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell><TableCell>{e.colaboradores?.nome}</TableCell><TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>{e.faturado_em ? new Date(e.faturado_em).toLocaleString("pt-BR") : "—"}</TableCell>
              </TableRow>
            ))}
            {faturados.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">—</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
