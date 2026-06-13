import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Layout,
});

function Layout() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!user) return <Navigate to="/auth" />;
  return <AppShell />;
}
