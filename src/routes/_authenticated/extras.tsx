import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, SITUACAO_SERVICO_OPTS, CLASSIFICACAO_COMERCIAL_OPTS, CLASSIFICACAO_COMERCIAL_LABEL, CancelarExtraDialog } from "@/components/extras-helpers";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Plus, Pencil, Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/extras")({ component: Page });

interface Extra {
  id: string; data: string; colaborador_id: string; cliente_id: string; empresa_id: string | null; funcao_id: string;
  hora_inicio: string; hora_termino: string; valor: number; motivo?: string; observacoes?: string;
  status: string; situacao_financeira: string | null; situacao_servico: string;
  emitente_id: string; semana_ref: string;
}

function Page() {
  const qc = useQueryClient();
  const { user, isAdmin, isSupervisor } = useAuth();
  const podeLancar = isAdmin || isSupervisor;

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroSemana, setFiltroSemana] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Extra | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [vals, setVals] = useState<any>(empty());

  function empty() {
    return { data: new Date().toISOString().slice(0, 10), colaborador_id: "", cliente_id: "", funcao_id: "",
      hora_inicio: "19:00", hora_termino: "07:00", valor: "", situacao_servico: "contrato", classificacao_comercial: "contrato", motivo: "", observacoes: "" };
  }

  const colabs = useQuery({ queryKey: ["colaboradores"], queryFn: async () => (await supabase.from("colaboradores").select("*").eq("situacao", "ativo").order("nome")).data ?? [] });
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: async () => (await supabase.from("clientes").select("*").eq("situacao", "ativo").order("nome_fantasia")).data ?? [] });
  const funcoes = useQuery({ queryKey: ["funcoes"], queryFn: async () => (await supabase.from("funcoes").select("*").eq("situacao", "ativo").order("nome")).data ?? [] });

  const extras = useQuery({
    queryKey: ["extras", filtroStatus, filtroSemana],
    queryFn: async () => {
      const q = supabase.from("extras").select("*, colaboradores(nome,matricula), clientes(nome_fantasia), empresas(nome), funcoes(nome)").order("data", { ascending: false });
      if (filtroStatus !== "todos") q.eq("status", filtroStatus as any);
      if (filtroSemana) q.eq("semana_ref", filtroSemana);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });


  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...vals,
        valor: parseFloat(vals.valor),
        semana_ref: vals.data, // será sobrescrito pelo trigger
        emitente_id: user!.id,
      };
      if (editing) {
        const { error } = await supabase.from("extras").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("extras").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["extras"] }); toast.success("Salvo"); setOpen(false); setEditing(null); setVals(empty()); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setVals(empty()); setOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setVals({ ...e, valor: String(e.valor) }); setOpen(true); };

  const podeEditar = (e: any) => isAdmin || (isSupervisor && e.emitente_id === user?.id && e.status === "pendente");

  return (
    <div>
      <PageHeader title="Extras" description="Lançamentos de horas extras" actions={
        podeLancar && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Novo Extra</Button>
      } />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado_operacional">Aprov. Operacional</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
            <SelectItem value="aprovado_financeiro">Aprov. Financeiro</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" placeholder="Semana ref" value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)} className="w-48" />
        {filtroSemana && <Button variant="outline" size="sm" onClick={() => setFiltroSemana("")}>Limpar</Button>}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Class.</TableHead>
              <TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Situação Serv.</TableHead>
              <TableHead>Status / Situação</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(extras.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}<div className="text-xs text-muted-foreground">{e.colaboradores?.matricula}</div></TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${e.classificacao_comercial === 'a_cobrar' ? 'bg-purple-500/15 text-purple-700' : 'bg-slate-500/15 text-slate-700'}`}>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</span></TableCell>
                <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>{SITUACAO_SERVICO_OPTS.find((o) => o.v === e.situacao_servico)?.l}</TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {podeEditar(e) && <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>}
                    {isAdmin && e.situacao_financeira !== "cancelado" && (
                      <Button size="icon" variant="ghost" onClick={() => setCancelarId(e.id)}><Ban className="h-3 w-3" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(extras.data ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum extra</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Extra</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={vals.data} onChange={(e) => setVals({ ...vals, data: e.target.value })} required /></div>
            <div>
              <Label>Colaborador</Label>
              <Select value={vals.colaborador_id} onValueChange={(v) => { const c: any = (colabs.data ?? []).find((x: any) => x.id === v); setVals({ ...vals, colaborador_id: v, funcao_id: c?.funcao_id ?? "" }); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{(colabs.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.matricula} - {c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select value={vals.cliente_id} onValueChange={(v) => setVals({ ...vals, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{(clientes.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Função</Label>
              <Select value={vals.funcao_id} onValueChange={(v) => setVals({ ...vals, funcao_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{(funcoes.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação do Serviço</Label>
              <Select value={vals.situacao_servico} onValueChange={(v) => setVals({ ...vals, situacao_servico: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SITUACAO_SERVICO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Hora Início</Label><Input type="time" value={vals.hora_inicio} onChange={(e) => setVals({ ...vals, hora_inicio: e.target.value })} required /></div>
            <div><Label>Hora Término</Label><Input type="time" value={vals.hora_termino} onChange={(e) => setVals({ ...vals, hora_termino: e.target.value })} required /></div>
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0" value={vals.valor} onChange={(e) => setVals({ ...vals, valor: e.target.value })} required /></div>
            <div className="md:col-span-2"><Label>Motivo</Label><Input value={vals.motivo ?? ""} onChange={(e) => setVals({ ...vals, motivo: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={vals.observacoes ?? ""} onChange={(e) => setVals({ ...vals, observacoes: e.target.value })} /></div>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {cancelarId && <CancelarExtraDialog extraId={cancelarId} open={!!cancelarId} onOpenChange={(o) => !o && setCancelarId(null)} />}
    </div>
  );
}
