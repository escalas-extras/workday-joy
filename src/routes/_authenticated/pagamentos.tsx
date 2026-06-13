import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, MarcarPagoDialog, FORMA_PGTO_OPTS, CLASSIFICACAO_COMERCIAL_LABEL } from "@/components/extras-helpers";
import { useState } from "react";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pagamentos")({ component: Page });

function Page() {
  const [pagarId, setPagarId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["extras", "pagamentos"],
    queryFn: async () => (await supabase.from("extras").select("*, colaboradores(nome,matricula), clientes(nome_fantasia)")
      .eq("status", "aprovado_financeiro").order("data", { ascending: false })).data ?? [],
  });
  const pendentes = (list.data ?? []).filter((e: any) => e.situacao_financeira === "pendente_pagamento");
  const concluidos = (list.data ?? []).filter((e: any) => e.situacao_financeira === "pago");

  return (
    <div>
      <PageHeader title="Pagamentos" description="Forma e data de pagamento" />

      <h2 className="text-sm font-semibold mb-2">Pendentes ({pendentes.length})</h2>
      <div className="rounded-md border bg-card overflow-x-auto mb-6">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead><TableHead>Class.</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {pendentes.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => setPagarId(e.id)}><Wallet className="h-3 w-3 mr-1" />Marcar Pago</Button>
                </TableCell>
              </TableRow>
            ))}
            {pendentes.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sem pendências</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-sm font-semibold mb-2">Pagos recentes ({concluidos.length})</h2>
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Class.</TableHead><TableHead>Valor</TableHead><TableHead>Forma</TableHead><TableHead>Pago em</TableHead></TableRow></TableHeader>
          <TableBody>
            {concluidos.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
                <TableCell>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>{FORMA_PGTO_OPTS.find((o) => o.v === e.forma_pagamento)?.l}</TableCell>
                <TableCell>{e.data_pagamento}</TableCell>
              </TableRow>
            ))}
            {concluidos.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">—</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {pagarId && <MarcarPagoDialog extraId={pagarId} open={!!pagarId} onOpenChange={(o) => !o && setPagarId(null)} />}
    </div>
  );
}
