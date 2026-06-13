import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { gerarRecibosSemana, cancelarRecibo } from "@/lib/recibos.functions";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, FilePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recibos")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const gerar = useServerFn(gerarRecibosSemana);
  const cancelar = useServerFn(cancelarRecibo);
  const [semana, setSemana] = useState("");
  const [dataPag, setDataPag] = useState(new Date().toISOString().slice(0, 10));
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["recibos"],
    queryFn: async () => (await supabase.from("recibos").select("*, colaboradores(nome,matricula,empresas(nome),funcoes(nome))").order("gerado_em", { ascending: false })).data ?? [],
  });

  const itens = useQuery({
    queryKey: ["recibo_itens", detalheId],
    queryFn: async () => detalheId ? (await supabase.from("recibos_itens").select("*, extras(data,hora_inicio,hora_termino,valor)").eq("recibo_id", detalheId)).data ?? [] : [],
    enabled: !!detalheId,
  });

  const mGerar = useMutation({
    mutationFn: () => gerar({ data: { semana_ref: semana, data_pagamento: dataPag } }),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["recibos"] }); toast.success(`${r.criados} recibo(s) gerado(s)`); if (r.erros?.length) toast.error(r.erros.join("; ")); },
    onError: (e: any) => toast.error(e.message),
  });

  const mCancelar = useMutation({
    mutationFn: () => cancelar({ data: { reciboId: cancelarId!, motivo } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recibos"] }); toast.success("Cancelado"); setCancelarId(null); setMotivo(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Recibos" description="Geração e cancelamento" />

      <div className="flex gap-2 mb-4 items-end flex-wrap">
        <div><Label>Semana Ref</Label><Input type="date" value={semana} onChange={(e) => setSemana(e.target.value)} /></div>
        <div><Label>Data de Pagamento</Label><Input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} /></div>
        <Button onClick={() => mGerar.mutate()} disabled={!semana || !dataPag || mGerar.isPending}><FilePlus className="h-4 w-4 mr-1" />Gerar Recibos da Semana</Button>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Colaborador</TableHead><TableHead>Empresa</TableHead><TableHead>Semana</TableHead><TableHead>Pago em</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.numero}</TableCell>
                <TableCell>{r.colaboradores?.nome}<div className="text-xs text-muted-foreground">{r.colaboradores?.matricula} - {r.colaboradores?.funcoes?.nome}</div></TableCell>
                <TableCell>{r.colaboradores?.empresas?.nome}</TableCell>
                <TableCell>{r.semana_ref}</TableCell>
                <TableCell>{r.data_pagamento}</TableCell>
                <TableCell>R$ {Number(r.valor_total).toFixed(2)}</TableCell>
                <TableCell><Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Ativo" : "Cancelado"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetalheId(r.id)}>Ver</Button>
                    {r.ativo && <Button size="sm" variant="destructive" onClick={() => setCancelarId(r.id)}><Ban className="h-3 w-3" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum recibo</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!cancelarId} onOpenChange={(o) => !o && setCancelarId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar Recibo</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarId(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => mCancelar.mutate()} disabled={!motivo}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Itens do Recibo</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Horário</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {(itens.data ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell>{i.extras?.data}</TableCell>
                  <TableCell>{i.extras?.hora_inicio} → {i.extras?.hora_termino}</TableCell>
                  <TableCell>R$ {Number(i.valor_snapshot).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
