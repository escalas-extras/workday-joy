import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsuarios, inviteUsuario, updateUsuarioRoles, setUsuarioAtivo, sendPasswordResetByAdmin, resendInvite, deleteUsuario } from "@/lib/usuarios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, KeyRound, Power, Shield, Mail, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: Page });

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "gestor_operacional", label: "Gestor Operacional" },
  { value: "gestor_financeiro", label: "Gestor Financeiro" },
  { value: "supervisor", label: "Supervisor" },
] as const;

function Page() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listUsuarios);
  const invite = useServerFn(inviteUsuario);
  const updateRoles = useServerFn(updateUsuarioRoles);
  const setAtivo = useServerFn(setUsuarioAtivo);
  const resetPwd = useServerFn(sendPasswordResetByAdmin);
  const resend = useServerFn(resendInvite);
  const remove = useServerFn(deleteUsuario);

  const { data, isLoading } = useQuery({ queryKey: ["usuarios"], queryFn: () => list() });

  const [openNew, setOpenNew] = useState(false);
  const [novo, setNovo] = useState<{ email: string; nome: string; roles: string[] }>({ email: "", nome: "", roles: [] });
  const [rolesEdit, setRolesEdit] = useState<{ userId: string; roles: string[] } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; nome: string; email: string } | null>(null);

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;

  const mInvite = useMutation({
    mutationFn: (d: any) => invite({ data: { ...d, redirectTo } }),
    onSuccess: () => { toast.success("Convite enviado por e-mail"); qc.invalidateQueries({ queryKey: ["usuarios"] }); setOpenNew(false); setNovo({ email: "", nome: "", roles: [] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mRoles = useMutation({ mutationFn: (d: any) => updateRoles({ data: d }), onSuccess: () => { toast.success("Papéis atualizados"); qc.invalidateQueries({ queryKey: ["usuarios"] }); setRolesEdit(null); }, onError: (e: any) => toast.error(e.message) });
  const mAtivo = useMutation({ mutationFn: (d: any) => setAtivo({ data: d }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["usuarios"] }); toast.success("Atualizado"); }, onError: (e: any) => toast.error(e.message) });
  const mPwd = useMutation({ mutationFn: (d: any) => resetPwd({ data: { ...d, redirectTo } }), onSuccess: () => toast.success("E-mail de redefinição enviado"), onError: (e: any) => toast.error(e.message) });
  const mResend = useMutation({ mutationFn: (d: any) => resend({ data: { ...d, redirectTo } }), onSuccess: () => toast.success("Convite reenviado"), onError: (e: any) => toast.error(e.message) });
  const mDel = useMutation({
    mutationFn: (d: { userId: string }) => remove({ data: d }),
    onSuccess: () => { toast.success("Usuário excluído"); qc.invalidateQueries({ queryKey: ["usuarios"] }); setConfirmDel(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleRole = (set: (v: any) => void, curr: string[], role: string) => {
    set(curr.includes(role) ? curr.filter((r) => r !== role) : [...curr, role]);
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Convidar usuários e gerenciar papéis"
        actions={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Convidar Usuário</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Convidar Usuário</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></div>
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
                <p className="text-xs text-muted-foreground">Um e-mail de ativação será enviado. O usuário definirá a própria senha no primeiro acesso.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
                <Button onClick={() => mInvite.mutate(novo)} disabled={mInvite.isPending || !novo.email || !novo.nome}>Enviar Convite</Button>
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
            {(data ?? []).map((u) => {
              const pendente = !u.confirmed_at;
              return (
                <TableRow key={u.id}>
                  <TableCell>{u.nome}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div></TableCell>
                  <TableCell>
                    {pendente ? <Badge variant="outline">Convite pendente</Badge> : <Badge variant={u.ativo ? "default" : "destructive"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="Papéis" onClick={() => setRolesEdit({ userId: u.id, roles: u.roles })}><Shield className="h-3 w-3" /></Button>
                      {pendente ? (
                        <Button size="icon" variant="ghost" title="Reenviar convite" onClick={() => mResend.mutate({ userId: u.id, email: u.email })}><Mail className="h-3 w-3" /></Button>
                      ) : (
                        <Button size="icon" variant="ghost" title="Enviar redefinição de senha" onClick={() => mPwd.mutate({ userId: u.id, email: u.email })}><KeyRound className="h-3 w-3" /></Button>
                      )}
                      <Button size="icon" variant="ghost" title="Ativar/Desativar" onClick={() => mAtivo.mutate({ userId: u.id, ativo: !u.ativo })}><Power className="h-3 w-3" /></Button>
                      {user?.id !== u.id && (
                        <Button size="icon" variant="ghost" title="Excluir usuário" onClick={() => setConfirmDel({ id: u.id, nome: u.nome, email: u.email })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
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

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O usuário <strong>{confirmDel?.nome}</strong> ({confirmDel?.email}) perderá o acesso ao sistema.
              Registros históricos vinculados (extras, auditoria) serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDel && mDel.mutate({ userId: confirmDel.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
