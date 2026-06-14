import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, MarcarPagoDialog, FORMA_PGTO_OPTS, CLASSIFICACAO_COMERCIAL_LABEL } from "@/components/extras-helpers";
import { useMemo, useState } from "react";
import { Wallet, Banknote } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/extenso";

export const Route = createFileRoute("/_authenticated/pagamentos")({ component: Page });

type ExtraRow = {
  id: string; data: string; valor: number; situacao_financeira: string | null;
  forma_pagamento: string | null; data_pagamento: string | null;
  classificacao_comercial: string; status: string;
  colaboradores?: { nome: string; matricula?: string };
  clientes?: { nome_fantasia: string };
};

function Page() {
  const qc = useQueryClient();
  const [pagarId, setPagarId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const list = useQuery({
    queryKey: ["extras", "pagamentos"],
    queryFn: async () => (await supabase.from("extras")
      .select("*, colaboradores!colaborador_id(nome,matricula), clientes(nome_fantasia)")
      .eq("status", "aprovado_financeiro").order("data", { ascending: false })).data as unknown as ExtraRow[] ?? [],
  });

  const pendentes = useMemo(() => (list.data ?? []).filter((e) => e.situacao_financeira === "pendente_pagamento"), [list.data]);
  const concluidos = useMemo(() => (list.data ?? []).filter((e) => e.situacao_financeira === "pago"), [list.data]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k] && pendentes.some((p) => p.id === k));
  const todosSel = pendentes.length > 0 && pendentes.every((p) => selected[p.id]);

  const aprovarLote = useMutation({
    mutationFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("extras")
        .update({ situacao_financeira: "pago", forma_pagamento: "dinheiro", data_pagamento: hoje })
        .in("id", selectedIds);
      if (error) throw error;
      return selectedIds.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} pagamento(s) aprovado(s) em dinheiro`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["extras", "pagamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Pagamentos" description="Forma e data de pagamento" />

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Pendentes ({pendentes.length})</h2>
        <Button
          size="sm"
          onClick={() => aprovarLote.mutate()}
          disabled={!selectedIds.length || aprovarLote.isPending}
        >
          <Banknote className="h-4 w-4 mr-1" />
          Aprovar Selecionados em Dinheiro ({selectedIds.length})
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto mb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={todosSel}
                  onCheckedChange={(v) => {
                    const next = { ...selected };
                    pendentes.forEach((p) => { next[p.id] = !!v; });
                    setSelected(next);
                  }}
                />
              </TableHead>
              <TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Class.</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendentes.map((e) => (
              <TableRow key={e.id} className={selected[e.id] ? "bg-primary/5" : ""}>
                <TableCell>
                  <Checkbox
                    checked={!!selected[e.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [e.id]: !!v }))}
                  />
                </TableCell>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</TableCell>
                <TableCell>{formatBRL(e.valor)}</TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setPagarId(e.id)}>
                    <Wallet className="h-3 w-3 mr-1" />Marcar Pago
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {pendentes.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sem pendências</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-sm font-semibold mb-2">Pagos recentes ({concluidos.length})</h2>
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Class.</TableHead><TableHead>Valor</TableHead><TableHead>Forma</TableHead><TableHead>Pago em</TableHead></TableRow></TableHeader>
          <TableBody>
            {concluidos.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}</TableCell>
                <TableCell>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</TableCell>
                <TableCell>{formatBRL(e.valor)}</TableCell>
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
