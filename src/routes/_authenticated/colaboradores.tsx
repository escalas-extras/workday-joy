import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Crud } from "@/components/crud";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DesligarColaboradorButton } from "@/components/almoxarifado/desligar-colaborador";

export const Route = createFileRoute("/_authenticated/colaboradores")({ component: Page });

interface Colab { id: string; matricula: string; nome: string; empresa_id: string; funcao_id: string; situacao: "ativo" | "inativo" }

function Page() {
  const empresas = useQuery({ queryKey: ["empresas"], queryFn: async () => (await supabase.from("empresas").select("id,nome").order("nome")).data ?? [] });
  const funcoes = useQuery({ queryKey: ["funcoes"], queryFn: async () => (await supabase.from("funcoes").select("id,nome").order("nome")).data ?? [] });

  const empMap = new Map((empresas.data ?? []).map((e: any) => [e.id, e.nome]));
  const funMap = new Map((funcoes.data ?? []).map((f: any) => [f.id, f.nome]));

  return (
    <Crud<Colab>
      table="colaboradores"
      title="Colaboradores"
      orderBy="nome"
      defaultValues={{ matricula: "", nome: "", empresa_id: "", funcao_id: "", situacao: "ativo" }}
      columns={[
        { key: "matricula", label: "Matrícula" },
        { key: "nome", label: "Nome" },
        { key: "empresa_id", label: "Empresa", render: (r) => empMap.get(r.empresa_id) ?? "—" },
        { key: "funcao_id", label: "Função", render: (r) => funMap.get(r.funcao_id) ?? "—" },
        { key: "situacao", label: "Situação", render: (r) => <Badge variant={r.situacao === "ativo" ? "default" : "secondary"}>{r.situacao}</Badge> },
      ]}
      renderForm={(v, set) => (
        <>
          <div><Label>Matrícula</Label><Input value={v.matricula ?? ""} onChange={(e) => set({ ...v, matricula: e.target.value })} required /></div>
          <div><Label>Nome</Label><Input value={v.nome ?? ""} onChange={(e) => set({ ...v, nome: e.target.value })} required /></div>
          <div>
            <Label>Empresa</Label>
            <Select value={v.empresa_id} onValueChange={(val) => set({ ...v, empresa_id: val })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{(empresas.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Função</Label>
            <Select value={v.funcao_id} onValueChange={(val) => set({ ...v, funcao_id: val })}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{(funcoes.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Situação</Label>
            <Select value={v.situacao} onValueChange={(val) => set({ ...v, situacao: val })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
            </Select>
          </div>
        </>
      )}
    />
  );
}
