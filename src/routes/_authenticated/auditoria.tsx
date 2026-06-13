import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/auditoria")({ component: Page });

function Page() {
  const [tabela, setTabela] = useState<string>("todas");
  const [registroId, setRegistroId] = useState<string>("");

  const list = useQuery({
    queryKey: ["auditoria", tabela, registroId],
    queryFn: async () => {
      const q = supabase.from("auditoria").select("*, profiles:usuario_id(nome,email)").order("criado_em", { ascending: false }).limit(500);
      if (tabela !== "todas") q.eq("tabela", tabela);
      if (registroId) q.eq("registro_id", registroId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title="Auditoria" description="Histórico completo de alterações" />

      <div className="flex flex-wrap gap-2 mb-4">
        <div>
          <Label>Tabela</Label>
          <Select value={tabela} onValueChange={setTabela}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="extras">Extras</SelectItem>
              <SelectItem value="recibos">Recibos</SelectItem>
              <SelectItem value="fechamentos_semanais">Fechamentos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Registro ID</Label>
          <Input value={registroId} onChange={(e) => setRegistroId(e.target.value)} placeholder="UUID..." className="w-80" />
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tabela</TableHead><TableHead>Ação</TableHead><TableHead>Campo</TableHead><TableHead>Anterior</TableHead><TableHead>Novo</TableHead><TableHead>Usuário</TableHead><TableHead>Justificativa</TableHead></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(a.criado_em).toLocaleString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline">{a.tabela}</Badge></TableCell>
                <TableCell><Badge>{a.acao}</Badge></TableCell>
                <TableCell className="text-xs">{a.campo ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-xs truncate">{a.valor_anterior ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-xs truncate">{a.valor_novo ?? "—"}</TableCell>
                <TableCell className="text-xs">{(a.profiles as any)?.nome ?? a.usuario_id?.slice(0, 8) ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-xs truncate">{a.justificativa ?? "—"}</TableCell>
              </TableRow>
            ))}
            {(list.data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sem registros</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
