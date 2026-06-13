import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/fechamento")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { isAdmin, isAdminOrGestor, isGestorFin } = useAuth();
  const [novaSemana, setNovaSemana] = useState("");
  const [reabrir, setReabrir] = useState<{ id: string; semana: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  const list = useQuery({
    queryKey: ["fechamentos"],
    queryFn: async () => (await supabase.from("fechamentos_semanais").select("*").order("semana_ref", { ascending: false })).data ?? [],
  });

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
    onSuccess: () => { qc.invalidateQueries(); toast.success("Semana fechada"); },
    onError: (e: any) => toast.error(e.message),
  });

  const reabrirM = useMutation({
    mutationFn: async () => {
      if (!reabrir) return;
      const { error } = await supabase.from("fechamentos_semanais").update({ status: "aberta", motivo_reabertura: motivo }).eq("id", reabrir.id);
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

  return (
    <div>
      <PageHeader title="Fechamento Semanal" description="Semana operacional: quinta 19h → quinta 18h59" />

      {isAdminOrGestor && (
        <div className="flex gap-2 mb-4 items-end">
          <div><Label>Nova semana (quinta-feira)</Label><Input type="date" value={novaSemana} onChange={(e) => setNovaSemana(e.target.value)} /></div>
          <Button onClick={() => criar.mutate()} disabled={!novaSemana}>Criar</Button>
        </div>
      )}

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Semana Ref</TableHead><TableHead>Status</TableHead><TableHead>Fin. Encerrado</TableHead><TableHead>Fechado em</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>{f.semana_ref}</TableCell>
                <TableCell><Badge variant={f.status === "fechada" ? "default" : "secondary"}>{f.status}</Badge></TableCell>
                <TableCell><Badge variant={f.encerrado_financeiro ? "destructive" : "outline"}>{f.encerrado_financeiro ? "Sim" : "Não"}</Badge></TableCell>
                <TableCell>{f.fechado_em ? new Date(f.fechado_em).toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {f.status === "aberta" && isAdminOrGestor && <Button size="sm" onClick={() => fechar.mutate(f.id)}><Lock className="h-3 w-3 mr-1" />Fechar</Button>}
                    {f.status === "fechada" && (isAdmin || isAdminOrGestor) && <Button size="sm" variant="outline" onClick={() => setReabrir({ id: f.id, semana: f.semana_ref })}><Unlock className="h-3 w-3 mr-1" />Reabrir</Button>}
                    {!f.encerrado_financeiro && (isAdmin || isGestorFin) && <Button size="sm" variant="destructive" onClick={() => { if (confirm("Encerrar financeiramente?")) encerrarFin.mutate(f.id); }}><ShieldCheck className="h-3 w-3 mr-1" />Encerrar Fin.</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma semana</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
