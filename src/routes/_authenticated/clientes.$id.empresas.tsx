import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/clientes/$id/empresas")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [empresaId, setEmpresaId] = useState("");

  const cliente = useQuery({ queryKey: ["cliente", id], queryFn: async () => (await supabase.from("clientes").select("*").eq("id", id).single()).data });
  const empresas = useQuery({ queryKey: ["empresas"], queryFn: async () => (await supabase.from("empresas").select("*").eq("situacao", "ativo").order("nome")).data ?? [] });
  const vinculos = useQuery({ queryKey: ["cliente_empresas", id], queryFn: async () => (await supabase.from("cliente_empresas").select("*, empresas(nome)").eq("cliente_id", id)).data ?? [] });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cliente_empresas").insert({ cliente_id: id, empresa_id: empresaId, situacao: "ativo" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cliente_empresas", id] }); setEmpresaId(""); toast.success("Vinculado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ vid, sit }: { vid: string; sit: "ativo" | "inativo" }) => {
      const { error } = await supabase.from("cliente_empresas").update({ situacao: sit }).eq("id", vid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cliente_empresas", id] }),
  });

  const del = useMutation({
    mutationFn: async (vid: string) => {
      const { error } = await supabase.from("cliente_empresas").delete().eq("id", vid);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cliente_empresas", id] }); toast.success("Removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/clientes"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
      <h1 className="text-2xl font-bold">Empresas vinculadas</h1>
      <p className="text-sm text-muted-foreground mb-4">Cliente: {cliente.data?.nome_fantasia}</p>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
            <SelectContent>
              {(empresas.data ?? []).filter((e: any) => !(vinculos.data ?? []).some((v: any) => v.empresa_id === e.id)).map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => add.mutate()} disabled={!empresaId || add.isPending}>Vincular</Button>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Situação</TableHead>{isAdmin && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {(vinculos.data ?? []).map((v: any) => (
              <TableRow key={v.id}>
                <TableCell>{v.empresas?.nome}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Select value={v.situacao} onValueChange={(s) => toggle.mutate({ vid: v.id, sit: s as "ativo" | "inativo" })}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : <Badge>{v.situacao}</Badge>}
                </TableCell>
                {isAdmin && <TableCell><Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover vínculo?")) del.mutate(v.id); }}><Trash2 className="h-3 w-3" /></Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
