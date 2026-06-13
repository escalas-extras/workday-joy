import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { logPasswordChange } from "@/lib/usuarios.functions";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({ component: Page });

function Page() {
  const { profile, roles } = useAuth();
  const log = useServerFn(logPasswordChange);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Senha deve ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    try { await log({}); } catch { /* ignora */ }
    setPassword(""); setConfirm("");
    toast.success("Senha alterada com sucesso");
  };

  return (
    <div>
      <PageHeader title="Meu Perfil" description="Dados da conta e segurança" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Nome: </span>{profile?.nome ?? "—"}</div>
            <div><span className="text-muted-foreground">Email: </span>{profile?.email ?? "—"}</div>
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-muted-foreground">Papéis: </span>
              {roles.length ? roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>) : "sem papel"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Alterar Senha</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Nova senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
              <div><Label>Confirmar senha</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} /></div>
              <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar nova senha"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
