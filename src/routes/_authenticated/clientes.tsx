import { createFileRoute } from "@tanstack/react-router";
import { Crud } from "@/components/crud";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Link2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({ component: Page });

interface Cliente { id: string; nome_fantasia: string; razao_social: string; cnpj: string; situacao: "ativo" | "inativo"; observacoes?: string }

function Page() {
  return (
    <Crud<Cliente>
      table="clientes"
      title="Clientes"
      orderBy="nome_fantasia"
      defaultValues={{ nome_fantasia: "", razao_social: "", cnpj: "", situacao: "ativo", observacoes: "" }}
      columns={[
        { key: "nome_fantasia", label: "Nome Fantasia" },
        { key: "razao_social", label: "Razão Social" },
        { key: "cnpj", label: "CNPJ" },
        { key: "situacao", label: "Situação", render: (r) => <Badge variant={r.situacao === "ativo" ? "default" : "secondary"}>{r.situacao}</Badge> },
        { key: "id", label: "Empresas", render: (r) => (
          <Button asChild size="sm" variant="outline">
            <Link to="/clientes/$id/empresas" params={{ id: r.id }}><Link2 className="h-3 w-3 mr-1" />Vincular</Link>
          </Button>
        ) },
      ]}
      renderForm={(v, set) => (
        <>
          <div><Label>Nome Fantasia</Label><Input value={v.nome_fantasia ?? ""} onChange={(e) => set({ ...v, nome_fantasia: e.target.value })} required /></div>
          <div><Label>Razão Social</Label><Input value={v.razao_social ?? ""} onChange={(e) => set({ ...v, razao_social: e.target.value })} required /></div>
          <div><Label>CNPJ</Label><Input value={v.cnpj ?? ""} onChange={(e) => set({ ...v, cnpj: e.target.value })} required /></div>
          <div>
            <Label>Situação</Label>
            <Select value={v.situacao} onValueChange={(val) => set({ ...v, situacao: val })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Observações</Label><Textarea value={v.observacoes ?? ""} onChange={(e) => set({ ...v, observacoes: e.target.value })} /></div>
        </>
      )}
    />
  );
}
