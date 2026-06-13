import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const SITUACAO_SERVICO_OPTS = [
  { v: "contrato", l: "Contrato" },
  { v: "cobertura_ferias", l: "Cobertura de Férias" },
  { v: "cobertura_atestado", l: "Cobertura de Atestado" },
  { v: "evento", l: "Evento" },
  { v: "apoio_operacional", l: "Apoio Operacional" },
  { v: "outro", l: "Outro" },
];

export const FORMA_PGTO_OPTS = [
  { v: "pix", l: "PIX" },
  { v: "transferencia", l: "Transferência" },
  { v: "dinheiro", l: "Dinheiro" },
  { v: "conta_corrente", l: "Conta Corrente" },
];

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aprovado_operacional: "Aprovado Operacional",
  rejeitado: "Rejeitado",
  aprovado_financeiro: "Aprovado Financeiro",
};

export const SIT_FIN_LABEL: Record<string, string> = {
  pendente_pagamento: "Pendente Pagamento",
  pago: "Pago",
  a_cobrar: "À Cobrar",
  faturado: "Faturado",
  cancelado: "Cancelado",
};

export function StatusBadge({ status, sit }: { status: string; sit?: string | null }) {
  const cls: Record<string, string> = {
    pendente: "bg-yellow-500/15 text-yellow-700",
    aprovado_operacional: "bg-blue-500/15 text-blue-700",
    rejeitado: "bg-red-500/15 text-red-700",
    aprovado_financeiro: "bg-green-500/15 text-green-700",
  };
  const sitCls: Record<string, string> = {
    pendente_pagamento: "bg-orange-500/15 text-orange-700",
    pago: "bg-emerald-500/15 text-emerald-700",
    a_cobrar: "bg-purple-500/15 text-purple-700",
    faturado: "bg-cyan-500/15 text-cyan-700",
    cancelado: "bg-gray-500/15 text-gray-700",
  };
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-xs px-2 py-0.5 rounded inline-block w-fit ${cls[status]}`}>{STATUS_LABEL[status]}</span>
      {sit && <span className={`text-xs px-2 py-0.5 rounded inline-block w-fit ${sitCls[sit]}`}>{SIT_FIN_LABEL[sit]}</span>}
    </div>
  );
}

export function RejeitarDialog({ extraId, open, onOpenChange }: { extraId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [motivoId, setMotivoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const motivos = useQuery({ queryKey: ["motivos_rejeicao"], queryFn: async () => (await supabase.from("motivos_rejeicao").select("*").eq("ativo", true).order("descricao")).data ?? [] });
  const selecionado = (motivos.data ?? []).find((m: any) => m.id === motivoId);
  const isOutros = selecionado?.descricao?.toLowerCase() === "outros";
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("extras").update({
        status: "rejeitado", motivo_rejeicao_id: motivoId, motivo_rejeicao_descricao: descricao || null,
      }).eq("id", extraId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Rejeitado"); onOpenChange(false); setMotivoId(""); setDescricao(""); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rejeitar Extra</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo</Label>
            <Select value={motivoId} onValueChange={setMotivoId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{(motivos.data ?? []).map((mo: any) => <SelectItem key={mo.id} value={mo.id}>{mo.descricao}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {isOutros && <div><Label>Descrição</Label><Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={!motivoId || (isOutros && !descricao)} onClick={() => m.mutate()}>Rejeitar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarcarPagoDialog({ extraId, open, onOpenChange }: { extraId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [forma, setForma] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [comprovante, setComprovante] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("extras").update({
        situacao_financeira: "pago", forma_pagamento: forma as any, data_pagamento: data, comprovante_url: comprovante || null,
      }).eq("id", extraId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Marcado como pago"); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Marcar como Pago</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{FORMA_PGTO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Data do Pagamento</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div><Label>URL do Comprovante (opcional)</Label><Input value={comprovante} onChange={(e) => setComprovante(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!forma || !data}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelarExtraDialog({ extraId, open, onOpenChange }: { extraId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [just, setJust] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("extras").update({ situacao_financeira: "cancelado", justificativa_cancelamento: just }).eq("id", extraId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Cancelado"); onOpenChange(false); setJust(""); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancelar Extra</DialogTitle></DialogHeader>
        <Textarea placeholder="Justificativa" value={just} onChange={(e) => setJust(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button variant="destructive" disabled={!just} onClick={() => m.mutate()}>Cancelar Extra</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useMarcarACobrar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("extras").update({ situacao_financeira: "a_cobrar" as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Marcado como À Cobrar"); },
    onError: (e: any) => toast.error(e.message),
  });
}
