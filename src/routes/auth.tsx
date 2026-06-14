import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import julianiLogo from "@/assets/juliani-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/inicio" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (sess) navigate({ to: "/inicio" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const res = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setLoading(false);
    // Log temporário para diagnóstico
    console.log("[signIn] email=", normalizedEmail, "len(senha)=", password.length, "res=", {
      user: res.data?.user?.id,
      email_confirmed_at: res.data?.user?.email_confirmed_at,
      banned_until: (res.data?.user as any)?.banned_until,
      error: res.error ? { name: res.error.name, status: (res.error as any).status, code: (res.error as any).code, message: res.error.message } : null,
    });
    if (res.error) toast.error(`${res.error.message}${(res.error as any).code ? ` (${(res.error as any).code})` : ""}`);
    else navigate({ to: "/inicio" });
  };

  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.");
      setMode("signin");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-primary/10 shadow-lg">
        <CardHeader className="items-center text-center">
          <img src={julianiLogo.url} alt="Grupo Juliani" className="h-20 w-auto mb-2" />
          <CardTitle className="text-primary">Gestão de Horas Extras</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Acesse sua conta para continuar" : "Recuperação de senha"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <form onSubmit={signIn} className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
              <button type="button" className="text-xs text-primary hover:underline w-full text-center mt-2" onClick={() => setMode("forgot")}>
                Esqueci minha senha
              </button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Acesso somente por convite. Solicite ao administrador.
              </p>
            </form>
          ) : (
            <form onSubmit={forgot} className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Enviar link de redefinição"}</Button>
              <button type="button" className="text-xs text-muted-foreground hover:underline w-full text-center mt-2" onClick={() => setMode("signin")}>
                Voltar para login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
