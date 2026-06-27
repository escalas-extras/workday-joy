import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/recibos")({
  component: RecibosLayout,
});

function RecibosLayout() {
  const { loading, isAdmin, isGestorOp } = useAuth();
  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }
  // Emissão de recibos: admin (exceções) ou gestor_operacional. Financeiro só libera na aprovação.
  if (!isAdmin && !isGestorOp) {
    return <Navigate to="/inicio" replace />;
  }
  return <Outlet />;
};
