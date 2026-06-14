import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deactivateDisciplinaryEntity } from "@/lib/disciplinary-audit.functions";

type Table =
  | "disciplinary_cases"
  | "disciplinary_case_evidences"
  | "disciplinary_case_witnesses"
  | "disciplinary_case_approvals"
  | "disciplinary_warnings";

interface Props {
  table: Table;
  id: string;
  label?: string;
  description?: string;
  invalidateKeys?: unknown[][];
  onDone?: () => void;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "ghost" | "outline" | "destructive" | "default" | "secondary";
}

const ENTITY_LABEL: Record<Table, string> = {
  disciplinary_cases: "este processo",
  disciplinary_case_evidences: "esta evidência",
  disciplinary_case_witnesses: "esta testemunha",
  disciplinary_case_approvals: "esta aprovação",
  disciplinary_warnings: "esta medida disciplinar",
};

export function InactivateButton({
  table, id, label = "Inativar", description, invalidateKeys, onDone,
  size = "sm", variant = "ghost",
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(deactivateDisciplinaryEntity);

  async function confirm() {
    if (reason.trim().length < 5) {
      toast.error("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await fn({ data: { table, id, reason: reason.trim() } });
      toast.success("Registro inativado.");
      setOpen(false); setReason("");
      invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} title={label}>
        <Archive className="h-4 w-4" />
        {size !== "icon" && size === "sm" ? null : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inativar registro</DialogTitle>
            <DialogDescription>
              {description ?? `Tem certeza que deseja inativar ${ENTITY_LABEL[table]}? Esta ação não pode ser desfeita e ficará registrada na trilha de auditoria. Por motivos legais, exclusões físicas não são permitidas.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da inativação *</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo (mínimo 5 caracteres)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button variant="destructive" onClick={confirm} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar inativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
