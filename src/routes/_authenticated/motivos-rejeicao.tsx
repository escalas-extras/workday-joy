import { createFileRoute } from "@tanstack/react-router";
import { Crud } from "@/components/crud";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/motivos-rejeicao")({ component: Page });

function Page() {
  return (
    <Crud<{ id: string; descricao: string; ativo: boolean }>
      table="motivos_rejeicao"
      title="Motivos de Rejeição"
      orderBy="descricao"
      defaultValues={{ descricao: "", ativo: true }}
      columns={[
        { key: "descricao", label: "Descrição" },
        { key: "ativo", label: "Ativo", render: (r) => <Badge variant={r.ativo ? "default" : "secondary"}>{r.ativo ? "Sim" : "Não"}</Badge> },
      ]}
      renderForm={(v, set) => (
        <>
          <div><Label>Descrição</Label><Input value={v.descricao ?? ""} onChange={(e) => set({ ...v, descricao: e.target.value })} required /></div>
          <div className="flex items-center gap-2"><Checkbox checked={v.ativo} onCheckedChange={(c) => set({ ...v, ativo: !!c })} /><Label>Ativo</Label></div>
        </>
      )}
    />
  );
}
