import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2, Briefcase, Users, UserCog, ListChecks, FileText, LogOut, Menu, Home,
  ClipboardList, CheckCircle2, Wallet, Receipt, CalendarCheck, Banknote, ShieldCheck, X,
  BarChart3, FileSpreadsheet, FileBarChart, Upload, UserCircle,
} from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operação",
    items: [
      { to: "/", label: "Início", icon: Home },
      { to: "/extras", label: "Extras", icon: ClipboardList },
      { to: "/aprovacoes/operacional", label: "Aprov. Operacional", icon: CheckCircle2, roles: ["admin", "gestor_operacional"] },
      { to: "/aprovacoes/financeiro", label: "Aprov. Financeira", icon: CheckCircle2, roles: ["admin", "gestor_financeiro"] },
      { to: "/pagamentos", label: "Pagamentos", icon: Wallet, roles: ["admin", "gestor_financeiro"] },
      { to: "/faturamento", label: "Faturamento", icon: Banknote, roles: ["admin", "gestor_financeiro"] },
      { to: "/fechamento", label: "Fechamento", icon: CalendarCheck, roles: ["admin", "gestor_operacional", "gestor_financeiro"] },
      { to: "/recibos", label: "Recibos", icon: Receipt, roles: ["admin", "gestor_financeiro"] },
    ],
  },
  {
    group: "Relatórios",
    items: [
      { to: "/relatorios/operacional", label: "Rel. Operacional", icon: BarChart3, roles: ["admin", "gestor_operacional", "gestor_financeiro", "supervisor"] },
      { to: "/relatorios/financeiro", label: "Rel. Financeiro", icon: FileBarChart, roles: ["admin", "gestor_financeiro"] },
      { to: "/relatorios/faturamento", label: "Rel. Faturamento", icon: FileSpreadsheet, roles: ["admin", "gestor_financeiro"] },
      { to: "/relatorios/recibos", label: "Rel. Recibos", icon: Receipt, roles: ["admin", "gestor_financeiro"] },
    ],
  },
  {
    group: "Cadastros",
    items: [
      { to: "/empresas", label: "Empresas", icon: Building2, roles: ["admin"] },
      { to: "/funcoes", label: "Funções", icon: Briefcase, roles: ["admin"] },
      { to: "/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
      { to: "/colaboradores", label: "Colaboradores", icon: Users, roles: ["admin"] },
      { to: "/usuarios", label: "Usuários", icon: UserCog, roles: ["admin"] },
      { to: "/motivos-rejeicao", label: "Motivos de Rejeição", icon: ListChecks, roles: ["admin"] },
    ],
  },
  {
    group: "Sistema",
    items: [
      { to: "/perfil", label: "Meu Perfil", icon: UserCircle },
      { to: "/admin/importar-lotacao", label: "Importar Lotação", icon: Upload, roles: ["admin"] },
      { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
];

export function AppShell() {
  const { profile, roles, isAdmin, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const canSee = (item: NavItem) =>
    !item.roles || isAdmin || item.roles.some((r) => roles.includes(r));

  const renderNav = (mobile = false) => (
    <nav className="flex flex-col gap-4 p-4">
      {NAV.map((g) => {
        const visible = g.items.filter(canSee);
        if (!visible.length) return null;
        return (
          <div key={g.group}>
            <p className="px-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
            <div className="flex flex-col gap-0.5">
              {visible.map((it) => {
                const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
                const Icon = it.icon;
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => mobile && setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card print:hidden">
        <div className="px-5 py-4 border-b">
          <h1 className="text-lg font-bold">Horas Extras</h1>
          <p className="text-xs text-muted-foreground">Gestão MVP</p>
        </div>
        <div className="flex-1 overflow-y-auto">{renderNav()}</div>
        <div className="border-t p-4">
          <p className="text-sm font-medium truncate">{profile?.nome ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
          <p className="text-xs text-muted-foreground mt-1">{roles.join(", ") || "sem papel"}</p>
          <Button variant="outline" size="sm" className="w-full mt-3" onClick={signOut}>
            <LogOut className="h-3 w-3 mr-2" />Sair
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] h-full bg-card flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h1 className="text-base font-bold">Horas Extras</h1>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto">{renderNav(true)}</div>
            <div className="border-t p-4">
              <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
                <LogOut className="h-3 w-3 mr-2" />Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between border-b bg-card px-4 py-3 print:hidden">
          <Button size="icon" variant="ghost" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
          <h1 className="text-sm font-bold">Horas Extras</h1>
          <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/" })}><Home className="h-5 w-5" /></Button>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-auto print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
