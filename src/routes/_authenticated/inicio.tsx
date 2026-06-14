import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { ClipboardList, CheckCircle2, Wallet, Receipt, CalendarCheck, Users, AlertTriangle, ShieldCheck, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: Inicio,
});

function Inicio() {
  const { profile, roles } = useAuth();
  const cards = [
    { to: "/extras", t: "Extras", d: "Lançamentos", icon: ClipboardList },
    { to: "/aprovacoes/operacional", t: "Aprov. Operacional", d: "Validar lançamentos", icon: CheckCircle2 },
    { to: "/aprovacoes/financeiro", t: "Aprov. Financeira", d: "Liberar pagamentos", icon: CheckCircle2 },
    { to: "/pagamentos", t: "Pagamentos", d: "Forma e data", icon: Wallet },
    { to: "/faturamento", t: "Faturamento", d: "Cobrança ao cliente", icon: Receipt },
    { to: "/fechamento", t: "Fechamento", d: "Semana operacional", icon: CalendarCheck },
    { to: "/recibos", t: "Recibos", d: "Geração e cancelamento", icon: Receipt },
    { to: "/advertencias", t: "Medidas Disciplinares", d: "Advertências e suspensões", icon: AlertTriangle },
    { to: "/processos", t: "Processos Disciplinares", d: "Apuração e Justa Causa", icon: ShieldCheck },
    { to: "/relatorios-disciplinares", t: "Rel. Disciplinar", d: "Dashboard + exportação", icon: ShieldCheck },
    { to: "/pesquisa-disciplinar", t: "Pesquisa Disciplinar", d: "CPF, processo, testemunha", icon: AlertTriangle },
    { to: "/colaboradores", t: "Colaboradores", d: "Cadastro", icon: Users },
  ];
  return (
    <div>
      <PageHeader title={`Olá, ${profile?.nome ?? ""}`} description={`Papéis: ${roles.join(", ") || "Aguardando atribuição pelo Admin"}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to}>
              <Card className="hover:border-primary transition-colors">
                <CardHeader>
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-base">{c.t}</CardTitle>
                  <CardDescription>{c.d}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
