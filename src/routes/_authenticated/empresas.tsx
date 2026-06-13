import { createFileRoute } from "@tanstack/react-router";
import { Crud } from "@/components/crud";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/empresas")({ component: Page });

function Page() {
  return (
    <Crud<{ id: string; nome: string; situacao: "ativo" | "inativo" }>
      table="empresas"
      title="Empresas"
      description="Empresas responsáveis (empregadoras)"
      orderBy="nome"
      defaultValues={{ nome: "", situacao: "ativo" }}
      columns={[
        { key: "nome", label: "Nome" },
        { key: "situacao", label: "Situação", render: (r) => <Badge variant={r.situacao === "ativo" ? "default" : "secondary"}>{r.situacao}</Badge> },
      ]}
      renderForm={(v, set) => (
        <>
          <div><Label>Nome</Label><Input value={v.nome ?? ""} onChange={(e) => set({ ...v, nome: e.target.value })} required /></div>
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
        </>
      )}
    />
  );
}
