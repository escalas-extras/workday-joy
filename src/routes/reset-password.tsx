import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [isInvite, setIsInvite] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const url = new URL(window.location.href);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryType = url.searchParams.get("type");
    const hashType = hash.get("type");
    const type = queryType || hashType;
    setIsInvite(type === "invite" || type === "signup");

    const errDesc = url.searchParams.get("error_description") || hash.get("error_description");
    if (errDesc) {
      setError(decodeURIComponent(errDesc));
      return;
    }

    const finish = () => {
      // limpa tokens da URL para evitar reprocessamento
      window.history.replaceState({}, document.title, window.location.pathname);
      setReady(true);
    };

    void (async () => {
      // 1) Já existe sessão? (detectSessionInUrl pode ter processado hash)
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) return finish();

      // 2) Fluxo PKCE: ?code=...
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        return finish();
      }

      // 3) Fluxo legado: #access_token & #refresh_token
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          setError(error.message);
          return;
        }
        return finish();
      }

      // 4) Token OTP por e-mail: ?token=...&type=recovery
      const token_hash = url.searchParams.get("token_hash") || url.searchParams.get("token");
      if (token_hash && (type === "recovery" || type === "invite" || type === "signup" || type === "email")) {
        const { error } = await supabase.auth.verifyOtp({
          type: (type === "invite" ? "invite" : type === "signup" ? "signup" : type === "email" ? "email" : "recovery") as any,
          token_hash,
        });
        if (error) {
          setError(error.message);
          return;
        }
        return finish();
      }

      setError("Link inválido ou expirado. Solicite um novo e-mail de redefinição.");
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Senha deve ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    try { await log({}); } catch { /* ignora */ }
    await supabase.auth.signOut();
    setLoading(false);
    toast.success(isInvite ? "Conta ativada! Faça login com sua nova senha." : "Senha redefinida com sucesso. Faça login.");
    navigate({ to: "/auth" });
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
          {error ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Voltar para login
              </Button>
            </div>
          ) : !ready ? (
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
