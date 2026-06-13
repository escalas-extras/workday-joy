import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Link2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({ component: Page });

interface Cliente { id: string; nome_fantasia: string; razao_social: string; cnpj: string; situacao: "ativo" | "inativo"; observacoes?: string | null }

const EMPTY = { nome_fantasia: "", razao_social: "", cnpj: "", situacao: "ativo" as const, observacoes: "" };

function Page() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [vals, setVals] = useState<any>(EMPTY);
  const [empresasSel, setEmpresasSel] = useState<Set<string>>(new Set());

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: async () => (await supabase.from("clientes").select("*").order("nome_fantasia")).data ?? [] });
  const empresas = useQuery({ queryKey: ["empresas-ativas"], queryFn: async () => (await supabase.from("empresas").select("id,nome").eq("situacao", "ativo").order("nome")).data ?? [] });
  const vincs = useQuery({ queryKey: ["cliente_empresas_all"], queryFn: async () => (await supabase.from("cliente_empresas").select("cliente_id,empresa_id,situacao,empresas(nome)")).data ?? [] });

  const vincPorCliente = new Map<string, { empresa_id: string; nome: string; situacao: string }[]>();
  for (const v of (vincs.data ?? []) as any[]) {
    const arr = vincPorCliente.get(v.cliente_id) ?? [];
    arr.push({ empresa_id: v.empresa_id, nome: v.empresas?.nome ?? "", situacao: v.situacao });
    vincPorCliente.set(v.cliente_id, arr);
  }

  const openCreate = () => { setEditing(null); setVals(EMPTY); setEmpresasSel(new Set()); setOpen(true); };
  const openEdit = (c: Cliente) => {
    setEditing(c); setVals({ ...c, observacoes: c.observacoes ?? "" });
    setEmpresasSel(new Set((vincPorCliente.get(c.id) ?? []).filter((v) => v.situacao === "ativo").map((v) => v.empresa_id)));
    setOpen(true);
  };

  const syncEmpresas = async (clienteId: string) => {
    const atuais = (vincPorCliente.get(clienteId) ?? []);
    const atuaisSet = new Set(atuais.map((v) => v.empresa_id));
    const toAdd = [...empresasSel].filter((id) => !atuaisSet.has(id));
    const toDeactivate = atuais.filter((v) => !empresasSel.has(v.empresa_id) && v.situacao === "ativo").map((v) => v.empresa_id);
    const toReactivate = atuais.filter((v) => empresasSel.has(v.empresa_id) && v.situacao !== "ativo").map((v) => v.empresa_id);
    if (toAdd.length) await supabase.from("cliente_empresas").insert(toAdd.map((empresa_id) => ({ cliente_id: clienteId, empresa_id, situacao: "ativo" })));
    if (toDeactivate.length) await supabase.from("cliente_empresas").update({ situacao: "inativo" }).eq("cliente_id", clienteId).in("empresa_id", toDeactivate);
    if (toReactivate.length) await supabase.from("cliente_empresas").update({ situacao: "ativo" }).eq("cliente_id", clienteId).in("empresa_id", toReactivate);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { nome_fantasia: vals.nome_fantasia, razao_social: vals.razao_social, cnpj: vals.cnpj, situacao: vals.situacao, observacoes: vals.observacoes || null };
      let id = editing?.id;
      if (editing) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("clientes").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (id) await syncEmpresas(id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); qc.invalidateQueries({ queryKey: ["cliente_empresas_all"] }); toast.success("Salvo"); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("clientes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); toast.success("Excluído"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Clientes" actions={isAdmin ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Novo</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Cliente</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
              <div><Label>Nome Fantasia</Label><Input value={vals.nome_fantasia} onChange={(e) => setVals({ ...vals, nome_fantasia: e.target.value })} required /></div>
              <div><Label>Razão Social</Label><Input value={vals.razao_social} onChange={(e) => setVals({ ...vals, razao_social: e.target.value })} required /></div>
              <div><Label>CNPJ</Label><Input value={vals.cnpj} onChange={(e) => setVals({ ...vals, cnpj: e.target.value })} required /></div>
              <div>
                <Label>Situação</Label>
                <Select value={vals.situacao} onValueChange={(v) => setVals({ ...vals, situacao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empresas que atendem este cliente</Label>
                <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1 mt-1">
                  {(empresas.data ?? []).map((e: any) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={empresasSel.has(e.id)} onCheckedChange={(c) => {
                        const next = new Set(empresasSel); if (c) next.add(e.id); else next.delete(e.id); setEmpresasSel(next);
                      }} />
                      {e.nome}
                    </label>
                  ))}
                  {!(empresas.data ?? []).length && <p className="text-xs text-muted-foreground">Nenhuma empresa cadastrada</p>}
                </div>
              </div>
              <div><Label>Observações</Label><Textarea value={vals.observacoes ?? ""} onChange={(e) => setVals({ ...vals, observacoes: e.target.value })} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : undefined} />

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nome Fantasia</TableHead><TableHead>Razão Social</TableHead><TableHead>CNPJ</TableHead>
            <TableHead>Empresas que atendem</TableHead><TableHead>Situação</TableHead><TableHead></TableHead>
            {isAdmin && <TableHead className="w-20"></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {(clientes.data ?? []).map((c: any) => {
              const ativas = (vincPorCliente.get(c.id) ?? []).filter((v) => v.situacao === "ativo");
              return (
                <TableRow key={c.id}>
                  <TableCell>{c.nome_fantasia}</TableCell>
                  <TableCell>{c.razao_social}</TableCell>
                  <TableCell>{c.cnpj}</TableCell>
                  <TableCell>
                    {ativas.length ? <div className="flex flex-wrap gap-1">{ativas.map((v) => <Badge key={v.empresa_id} variant="outline">{v.nome}</Badge>)}</div> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><Badge variant={c.situacao === "ativo" ? "default" : "secondary"}>{c.situacao}</Badge></TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline"><Link to="/clientes/$id/empresas" params={{ id: c.id }}><Link2 className="h-3 w-3 mr-1" />Gerenciar</Link></Button>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir?")) del.mutate(c.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!(clientes.data ?? []).length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum cliente</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
