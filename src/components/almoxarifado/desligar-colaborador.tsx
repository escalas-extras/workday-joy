import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserMinus, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { desligarColaborador } from "@/lib/almoxarifado.functions";
import { useAuth } from "@/hooks/use-auth";

interface Pendencia {
  id: string;
  quantidade: number;
  quantidade_devolvida: number;
  almox_itens: { nome: string } | null;
}

export function DesligarColaboradorButton({ colaboradorId, situacao }: { colaboradorId: string; situacao: string }) {
  const { isAdmin, isGestorOp } = useAuth();
  const [open, setOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(desligarColaborador);

  if (!isAdmin && !isGestorOp) return null;
  if (situacao === "inativo") return null;

  async function confirm(forcar: boolean) {
    if (justificativa.trim().length < 5) {
      toast.error("Justificativa mínima de 5 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const res = await fn({ data: { colaborador_id: colaboradorId, justificativa: justificativa.trim(), forcar } });
      if (!res.ok) {
        setPendencias(res.pendencias as Pendencia[]);
        toast.warning("Existem pendências no almoxarifado. Revise antes de continuar.");
      } else {
        toast.success("Colaborador desligado.");
        setOpen(false); setJustificativa(""); setPendencias(null);
        qc.invalidateQueries({ queryKey: ["crud", "colaboradores"] });
        qc.invalidateQueries({ queryKey: ["almox-pend"] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <>
      <Button size="icon" variant="ghost" title="Desligar" onClick={() => setOpen(true)}>
        <UserMinus className="h-3 w-3" />
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPendencias(null); setJustificativa(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Desligar colaborador</DialogTitle>
            <DialogDescription>
              O sistema verifica pendências no almoxarifado antes de inativar.
            </DialogDescription>
          </DialogHeader>

          {pendencias && pendencias.length > 0 && (
            <div className="border border-orange-300 bg-orange-50 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
                <AlertTriangle className="h-4 w-4" />
                {pendencias.length} pendência(s) de devolução
              </div>
              <ul className="text-xs space-y-1">
                {pendencias.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.almox_itens?.nome ?? "—"}</span>
                    <Badge variant="destructive">{p.quantidade - p.quantidade_devolvida} restante(s)</Badge>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-orange-800">
                Você pode prosseguir mesmo assim — a decisão é da operação e ficará registrada na auditoria.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Justificativa do desligamento *</Label>
            <Textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Motivo do desligamento (mínimo 5 caracteres)" />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            {pendencias && pendencias.length > 0 ? (
              <Button variant="destructive" onClick={() => confirm(true)} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Desligar mesmo assim
              </Button>
            ) : (
              <Button onClick={() => confirm(false)} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verificar e desligar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
