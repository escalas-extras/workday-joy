import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { logPasswordChange } from "@/lib/usuarios.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const log = useServerFn(logPasswordChange);
  const [ready, setReady] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // O Supabase trata o link (recovery/invite) automaticamente e cria a sessão.
    const hash = window.location.hash;
    setIsInvite(hash.includes("type=invite"));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setReady(true);
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Senha deve ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    try { await log({}); } catch { /* ignora falha de log */ }
    toast.success(isInvite ? "Conta ativada! Você já está conectado." : "Senha redefinida com sucesso.");
    navigate({ to: "/inicio" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isInvite ? "Ativar conta" : "Redefinir senha"}</CardTitle>
          <CardDescription>
            {isInvite ? "Defina sua senha para concluir a ativação." : "Informe uma nova senha para acessar o sistema."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Validando link...</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Nova senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
              <div><Label>Confirmar senha</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} /></div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : isInvite ? "Ativar conta" : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
