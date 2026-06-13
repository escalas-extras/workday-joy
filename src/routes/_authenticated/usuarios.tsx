import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsuarios, createUsuario, updateUsuarioRoles, setUsuarioAtivo, resetUsuarioPassword } from "@/lib/usuarios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Key, Power, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: Page });

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "gestor_operacional", label: "Gestor Operacional" },
  { value: "gestor_financeiro", label: "Gestor Financeiro" },
  { value: "supervisor", label: "Supervisor" },
] as const;

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listUsuarios);
  const create = useServerFn(createUsuario);
  const updateRoles = useServerFn(updateUsuarioRoles);
  const setAtivo = useServerFn(setUsuarioAtivo);
  const resetPwd = useServerFn(resetUsuarioPassword);

  const { data, isLoading } = useQuery({ queryKey: ["usuarios"], queryFn: () => list() });

  const [openNew, setOpenNew] = useState(false);
  const [novo, setNovo] = useState<{ email: string; password: string; nome: string; roles: string[] }>({ email: "", password: "", nome: "", roles: [] });
  const [rolesEdit, setRolesEdit] = useState<{ userId: string; roles: string[] } | null>(null);
  const [pwdEdit, setPwdEdit] = useState<{ userId: string; password: string } | null>(null);

  const mCreate = useMutation({ mutationFn: (d: any) => create({ data: d }), onSuccess: () => { toast.success("Usuário criado"); qc.invalidateQueries({ queryKey: ["usuarios"] }); setOpenNew(false); setNovo({ email: "", password: "", nome: "", roles: [] }); }, onError: (e: any) => toast.error(e.message) });
  const mRoles = useMutation({ mutationFn: (d: any) => updateRoles({ data: d }), onSuccess: () => { toast.success("Papéis atualizados"); qc.invalidateQueries({ queryKey: ["usuarios"] }); setRolesEdit(null); }, onError: (e: any) => toast.error(e.message) });
  const mAtivo = useMutation({ mutationFn: (d: any) => setAtivo({ data: d }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); toast.success("Atualizado"); }, onError: (e: any) => toast.error(e.message) });
  const mPwd = useMutation({ mutationFn: (d: any) => resetPwd({ data: d }), onSuccess: () => { toast.success("Senha atualizada"); setPwdEdit(null); }, onError: (e: any) => toast.error(e.message) });

  const toggleRole = (set: (v: any) => void, curr: string[], role: string) => {
    set(curr.includes(role) ? curr.filter((r) => r !== role) : [...curr, role]);
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerenciar contas e papéis"
        actions={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Novo Usuário</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
                <div><Label>Senha</Label><Input type="password" value={novo.password} onChange={(e) => setNovo({ ...novo, password: e.target.value })} /></div>
                <div>
                  <Label>Papéis</Label>
                  <div className="space-y-1 mt-1">
                    {ROLES.map((r) => (
                      <label key={r.value} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={novo.roles.includes(r.value)} onCheckedChange={() => toggleRole((v) => setNovo({ ...novo, roles: v }), novo.roles, r.value)} />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
                <Button onClick={() => mCreate.mutate(novo)} disabled={mCreate.isPending}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Papéis</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-6">Carregando...</TableCell></TableRow>}
            {(data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div></TableCell>
                <TableCell><Badge variant={u.ativo ? "default" : "destructive"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" title="Papéis" onClick={() => setRolesEdit({ userId: u.id, roles: u.roles })}><Shield className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" title="Senha" onClick={() => setPwdEdit({ userId: u.id, password: "" })}><Key className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" title="Ativar/Desativar" onClick={() => mAtivo.mutate({ userId: u.id, ativo: !u.ativo })}><Power className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!rolesEdit} onOpenChange={(o) => !o && setRolesEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Papéis</DialogTitle></DialogHeader>
          <div className="space-y-1">
            {rolesEdit && ROLES.map((r) => (
              <label key={r.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={rolesEdit.roles.includes(r.value)} onCheckedChange={() => toggleRole((v) => setRolesEdit({ ...rolesEdit, roles: v }), rolesEdit.roles, r.value)} />
                {r.label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesEdit(null)}>Cancelar</Button>
            <Button onClick={() => rolesEdit && mRoles.mutate({ userId: rolesEdit.userId, roles: rolesEdit.roles })}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdEdit} onOpenChange={(o) => !o && setPwdEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir Senha</DialogTitle></DialogHeader>
          <Input type="password" placeholder="Nova senha" value={pwdEdit?.password ?? ""} onChange={(e) => pwdEdit && setPwdEdit({ ...pwdEdit, password: e.target.value })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdEdit(null)}>Cancelar</Button>
            <Button onClick={() => pwdEdit && mPwd.mutate(pwdEdit)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
