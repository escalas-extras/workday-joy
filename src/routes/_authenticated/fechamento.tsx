import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/app-shell";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, ShieldCheck, Eye, FileLock2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/fechamento")({ component: Page });

type Fechamento = {
  id: string;
  semana_ref: string;
  status: "aberta" | "fechada";
  encerrado_financeiro: boolean;
  fechado_em: string | null;
  fechado_por: string | null;
  motivo_reabertura: string | null;
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Page() {
  const qc = useQueryClient();
  const { isAdmin, isAdminOrGestor, isGestorFin } = useAuth();
  const [novaSemana, setNovaSemana] = useState("");
  const [reabrir, setReabrir] = useState<{ id: string; semana: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [verSnap, setVerSnap] = useState<{ semana: string; id: string } | null>(null);

  const list = useQuery({
    queryKey: ["fechamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos_semanais")
        .select("*")
        .order("semana_ref", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fechamento[];
    },
  });

  const { abertas, fechadas } = useMemo(() => {
    const all = list.data ?? [];
    return {
      abertas: all.filter((f) => f.status === "aberta"),
      fechadas: all.filter((f) => f.status === "fechada"),
    };
  }, [list.data]);

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fechamentos_semanais").insert({ semana_ref: novaSemana, status: "aberta" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Criado"); setNovaSemana(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fechamentos_semanais").update({ status: "fechada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Semana fechada (snapshot gerado)"); },
    onError: (e: any) => toast.error(e.message),
  });

  const reabrirM = useMutation({
    mutationFn: async () => {
      if (!reabrir) return;
      const target = (list.data ?? []).find((f) => f.id === reabrir.id);
      const payload: any = { status: "aberta", motivo_reabertura: motivo };
      // Admin pode reabrir mesmo após encerramento financeiro — reverte a flag para permitir lançamentos esquecidos.
      if (target?.encerrado_financeiro && isAdmin) payload.encerrado_financeiro = false;
      const { error } = await supabase
        .from("fechamentos_semanais")
        .update(payload)
        .eq("id", reabrir.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Reaberta"); setReabrir(null); setMotivo(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const encerrarFin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fechamentos_semanais").update({ encerrado_financeiro: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Encerrado financeiramente"); },
    onError: (e: any) => toast.error(e.message),
  });

  const renderAcoes = (f: Fechamento) => (
    <div className="flex gap-1 flex-wrap">
      {f.status === "aberta" && isAdminOrGestor && (
        <Button size="sm" onClick={() => { if (confirm(`Fechar semana ${f.semana_ref}? Será gerado snapshot imutável.`)) fechar.mutate(f.id); }}>
          <Lock className="h-3 w-3 mr-1" />Fechar
        </Button>
      )}
      {f.status === "fechada" && (
        <Button size="sm" variant="outline" onClick={() => setVerSnap({ semana: f.semana_ref, id: f.id })}>
          <Eye className="h-3 w-3 mr-1" />Ver detalhes
        </Button>
      )}
      {f.status === "fechada" && (isAdmin || (isAdminOrGestor && !f.encerrado_financeiro)) && (
        <Button size="sm" variant="outline" onClick={() => setReabrir({ id: f.id, semana: f.semana_ref })}>
          <Unlock className="h-3 w-3 mr-1" />Reabrir
        </Button>
      )}
      {!f.encerrado_financeiro && (isAdmin || isGestorFin) && f.status === "fechada" && (
        <Button size="sm" variant="destructive" onClick={() => { if (confirm("Encerrar financeiramente? Bloqueia novas alterações."))encerrarFin.mutate(f.id); }}>
          <ShieldCheck className="h-3 w-3 mr-1" />Encerrar Fin.
        </Button>
      )}
      {f.encerrado_financeiro && (
        <Badge variant="destructive" className="gap-1"><FileLock2 className="h-3 w-3" />Encerrada</Badge>
      )}
    </div>
  );

  const renderTable = (rows: Fechamento[], empty: string) => (
    <div className="rounded-md border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Semana Ref</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fin. Encerrado</TableHead>
            <TableHead>Fechado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-medium">{f.semana_ref}</TableCell>
              <TableCell>
                <Badge variant={f.status === "fechada" ? "default" : "secondary"}>{f.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={f.encerrado_financeiro ? "destructive" : "outline"}>
                  {f.encerrado_financeiro ? "Sim" : "Não"}
                </Badge>
              </TableCell>
              <TableCell>{f.fechado_em ? new Date(f.fechado_em).toLocaleString("pt-BR") : "—"}</TableCell>
              <TableCell className="text-right">{renderAcoes(f)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">{empty}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div>
      <PageHeader title="Fechamento Semanal" description="Semana operacional: quinta 19h → quinta 18h59" />

      {isAdminOrGestor && (
        <div className="flex gap-2 mb-4 items-end">
          <div>
            <Label>Nova semana (quinta-feira)</Label>
            <Input type="date" value={novaSemana} onChange={(e) => setNovaSemana(e.target.value)} />
          </div>
          <Button onClick={() => criar.mutate()} disabled={!novaSemana}>Criar</Button>
        </div>
      )}

      <Accordion type="multiple" defaultValue={["abertas"]} className="space-y-2">
        <AccordionItem value="abertas" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Unlock className="h-4 w-4" />
              <span className="font-medium">Semanas abertas</span>
              <Badge variant="secondary">{abertas.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {renderTable(abertas, "Nenhuma semana aberta")}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="fechadas" className="border rounded-md bg-card px-3">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="font-medium">Histórico — semanas fechadas</span>
              <Badge variant="secondary">{fechadas.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            {renderTable(fechadas, "Nenhuma semana fechada")}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={!!reabrir} onOpenChange={(o) => !o && setReabrir(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reabrir semana {reabrir?.semana}</DialogTitle></DialogHeader>
          <Textarea placeholder="Motivo da reabertura" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReabrir(null)}>Cancelar</Button>
            <Button onClick={() => reabrirM.mutate()} disabled={!motivo}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {verSnap && <SnapshotDialog semana={verSnap.semana} fechamentoId={verSnap.id} onClose={() => setVerSnap(null)} />}
    </div>
  );
}

function SnapshotDialog({ semana, fechamentoId, onClose }: { semana: string; fechamentoId: string; onClose: () => void }) {
  const snap = useQuery({
    queryKey: ["snapshot", fechamentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fechamentos_snapshots")
        .select("*")
        .eq("fechamento_id", fechamentoId)
        .order("gerado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const extras: any[] = (snap.data?.extras as any[]) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Snapshot — semana {semana}</DialogTitle>
          <DialogDescription>
            Cópia imutável gerada no fechamento. Refletindo os dados originais — alterações
            posteriores em cadastros não afetam este histórico.
          </DialogDescription>
        </DialogHeader>

        {snap.isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando snapshot…</div>}
        {!snap.isLoading && !snap.data && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum snapshot encontrado para esta semana.
          </div>
        )}

        {snap.data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Stat label="Registros" value={String(snap.data.total_registros)} />
              <Stat label="Total" value={formatBRL(Number(snap.data.total_valor))} />
              <Stat label="Gerado em" value={new Date(snap.data.gerado_em).toLocaleString("pt-BR")} />
              <Stat label="Semana" value={snap.data.semana_ref} />
            </div>

            <div className="overflow-auto border rounded-md mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Matr.</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sit. Fin.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extras.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.data}</TableCell>
                      <TableCell>{e.colaborador_matricula ?? "—"}</TableCell>
                      <TableCell>{e.colaborador_nome ?? "—"}</TableCell>
                      <TableCell>{e.cliente_nome ?? "—"}</TableCell>
                      <TableCell>{e.empresa_nome ?? "—"}</TableCell>
                      <TableCell>{e.funcao_nome ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                      <TableCell className="text-right">{formatBRL(Number(e.valor ?? 0))}</TableCell>
                      <TableCell><Badge variant="outline">{e.status}</Badge></TableCell>
                      <TableCell>{e.situacao_financeira ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {extras.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center py-4 text-muted-foreground">Nenhum extra registrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
