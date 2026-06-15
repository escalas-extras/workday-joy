import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, CheckCircle2, Wallet, Banknote, CalendarCheck, Receipt,
  AlertTriangle, ShieldCheck, Package, BarChart3, FileBarChart, FileSpreadsheet,
  Users, UserCog, Building2, Briefcase, ListChecks, Upload, UserCircle, HelpCircle,
  LogIn, Home,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ajuda")({ component: Page });

type Sec = {
  id: string;
  titulo: string;
  rota?: string;
  papeis?: string[];
  finalidade: string;
  passos: string[];
  dicas?: string[];
  icon: React.ComponentType<{ className?: string }>;
};

const SECOES: { grupo: string; itens: Sec[] }[] = [
  {
    grupo: "Acesso",
    itens: [
      {
        id: "login", titulo: "Acessar o Sistema", icon: LogIn,
        finalidade: "Autenticar-se no App Extras.",
        passos: [
          "Abra a tela de login.",
          "Informe e-mail e senha cadastrados.",
          "Clique em Entrar.",
          "Caso esqueça a senha, utilize a opção de recuperação ou contate o administrador.",
        ],
      },
      {
        id: "inicio", titulo: "Página Inicial", rota: "/inicio", icon: Home,
        finalidade: "Acessar as funcionalidades disponíveis ao seu perfil.",
        passos: [
          "Após login você é direcionado à tela Início.",
          "Os cards exibem atalhos para os módulos liberados conforme seus papéis.",
          "O menu lateral (desktop) ou drawer (mobile) permite navegar entre todos os módulos.",
        ],
      },
    ],
  },
  {
    grupo: "Operação",
    itens: [
      {
        id: "extras", titulo: "Extras", rota: "/extras", icon: ClipboardList,
        finalidade: "Registrar e acompanhar lançamentos de horas extras, plantões e adicionais.",
        passos: [
          "Acesse Extras no menu lateral.",
          "Use os filtros (período, colaborador, cliente, status) para localizar lançamentos.",
          "Para incluir, clique em Novo e preencha colaborador, cliente, data, valor e classificação comercial (À Cobrar / Não Cobrar).",
          "Salve o lançamento — ele entrará em análise nas aprovações.",
        ],
        dicas: ["A classificação comercial define se o lançamento será enviado ao Faturamento."],
      },
      {
        id: "aprov-op", titulo: "Aprovação Operacional", rota: "/aprovacoes/operacional",
        papeis: ["admin", "gestor_operacional"], icon: CheckCircle2,
        finalidade: "Validar lançamentos quanto à execução operacional.",
        passos: [
          "Acesse Aprovações > Operacional.",
          "Analise cada lançamento (colaborador, cliente, justificativa).",
          "Aprove ou rejeite informando o motivo (obrigatório no caso de rejeição).",
        ],
      },
      {
        id: "aprov-fin", titulo: "Aprovação Financeira", rota: "/aprovacoes/financeiro",
        papeis: ["admin", "gestor_financeiro"], icon: CheckCircle2,
        finalidade: "Liberar lançamentos para pagamento.",
        passos: [
          "Acesse Aprovações > Financeira.",
          "Confira valores e classificação.",
          "Aprove para liberar para Pagamentos ou rejeite informando motivo.",
        ],
      },
      {
        id: "pagamentos", titulo: "Pagamentos", rota: "/pagamentos",
        papeis: ["admin", "gestor_financeiro"], icon: Wallet,
        finalidade: "Registrar a forma e data de pagamento dos extras aprovados.",
        passos: [
          "Acesse Pagamentos.",
          "Na aba Pendentes, marque os lançamentos a pagar.",
          "Use Aprovar Selecionados em Dinheiro para lote, ou Marcar Pago individualmente (informando forma e data).",
          "Os lançamentos pagos passam à seção Pagos recentes.",
        ],
      },
      {
        id: "faturamento", titulo: "Faturamento", rota: "/faturamento",
        papeis: ["admin", "gestor_financeiro"], icon: Banknote,
        finalidade: "Acompanhar lançamentos À Cobrar e marcá-los como faturados ao cliente.",
        passos: [
          "Acesse Faturamento.",
          "A lista A Faturar mostra lançamentos aprovados pelo Financeiro classificados como À Cobrar.",
          "Clique em Faturar para registrar a cobrança.",
          "Acompanhe os já emitidos em Faturados.",
        ],
      },
      {
        id: "fechamento", titulo: "Fechamento Semanal", rota: "/fechamento",
        papeis: ["admin", "gestor_operacional", "gestor_financeiro"], icon: CalendarCheck,
        finalidade: "Encerrar a semana operacional (quinta 19h → quinta 18h59) e o ciclo financeiro.",
        passos: [
          "Acesse Fechamento.",
          "Crie a semana informando a data de referência (quinta-feira).",
          "Use Fechar para encerrar operacionalmente.",
          "Para reverter, use Reabrir e informe o motivo (auditado).",
          "Quando o financeiro for concluído, use Encerrar Fin. para travar definitivamente.",
        ],
      },
      {
        id: "recibos", titulo: "Recibos", rota: "/recibos",
        papeis: ["admin", "gestor_financeiro"], icon: Receipt,
        finalidade: "Gerar, visualizar e imprimir recibos dos pagamentos.",
        passos: [
          "Acesse Recibos.",
          "Localize o recibo desejado pelos filtros.",
          "Use Imprimir para abrir o layout A4 pronto para impressão ou PDF.",
        ],
      },
      {
        id: "advertencias", titulo: "Medidas Disciplinares", rota: "/advertencias",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: AlertTriangle,
        finalidade: "Registrar advertências e suspensões aplicadas a colaboradores.",
        passos: [
          "Acesse Medidas Disciplinares.",
          "Clique em Nova, selecione o colaborador, tipo, data, descrição e anexe evidências quando houver.",
          "Salve — o registro fica vinculado à ficha do colaborador.",
        ],
      },
      {
        id: "processos", titulo: "Processos Disciplinares", rota: "/processos",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: ShieldCheck,
        finalidade: "Abrir e acompanhar processos de apuração e justa causa.",
        passos: [
          "Acesse Processos.",
          "Inicie um novo processo informando colaborador, motivo e evidências.",
          "Acompanhe o status e gere os documentos (advertência, justa causa, dossiê) no momento adequado.",
        ],
      },
      {
        id: "almoxarifado", titulo: "Almoxarifado", rota: "/almoxarifado",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: Package,
        finalidade: "Controlar uniformes, EPIs e equipamentos: estoque, entregas e devoluções por colaborador.",
        passos: [
          "Acesse Almoxarifado.",
          "Em Estoque consulte saldos por item/tamanho.",
          "Em Movimentações registre entradas (compra, devolução) e saídas (entrega ao colaborador) — selecione o colaborador quando exigido.",
          "Use Entregas para iniciar uma nova entrega e Devoluções para baixar itens devolvidos.",
          "Importe estoque inicial por planilha Excel quando disponível.",
          "Gere relatórios em PDF do estoque e movimentações.",
        ],
        dicas: ["O desligamento do colaborador alerta sobre itens em aberto."],
      },
    ],
  },
  {
    grupo: "Relatórios",
    itens: [
      {
        id: "rel-op", titulo: "Relatório Operacional", rota: "/relatorios/operacional",
        papeis: ["admin", "gestor_operacional", "gestor_financeiro", "supervisor"], icon: BarChart3,
        finalidade: "Visão consolidada dos lançamentos operacionais.",
        passos: ["Acesse Relatórios > Operacional.", "Defina filtros e gere.", "Exporte em PDF/Excel se disponível."],
      },
      {
        id: "rel-fin", titulo: "Relatório Financeiro", rota: "/relatorios/financeiro",
        papeis: ["admin", "gestor_financeiro"], icon: FileBarChart,
        finalidade: "Posição financeira de pagamentos.",
        passos: ["Acesse Relatórios > Financeiro.", "Filtre por período e status.", "Exporte o resultado."],
      },
      {
        id: "rel-fat", titulo: "Relatório de Faturamento", rota: "/relatorios/faturamento",
        papeis: ["admin", "gestor_financeiro"], icon: FileSpreadsheet,
        finalidade: "Acompanhar o que foi e o que está a faturar por cliente.",
        passos: ["Acesse Relatórios > Faturamento.", "Filtre por cliente e período.", "Exporte conforme necessidade."],
      },
      {
        id: "rel-rec", titulo: "Relatório de Recibos", rota: "/relatorios/recibos",
        papeis: ["admin", "gestor_financeiro"], icon: Receipt,
        finalidade: "Consultar recibos gerados em massa.",
        passos: ["Acesse Relatórios > Recibos.", "Filtre por período e colaborador.", "Imprima ou exporte."],
      },
      {
        id: "rel-disc", titulo: "Relatório Disciplinar", rota: "/relatorios-disciplinares",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: ShieldCheck,
        finalidade: "Dashboard e exportação de medidas disciplinares.",
        passos: ["Acesse Rel. Disciplinar.", "Analise os indicadores.", "Exporte os dados filtrados."],
      },
      {
        id: "pesq-disc", titulo: "Pesquisa Disciplinar", rota: "/pesquisa-disciplinar",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: AlertTriangle,
        finalidade: "Buscar por CPF, número de processo ou testemunha.",
        passos: ["Acesse Pesquisa Disciplinar.", "Informe o critério.", "Abra o registro encontrado."],
      },
      {
        id: "intel-disc", titulo: "Inteligência Disciplinar", rota: "/inteligencia-disciplinar",
        papeis: ["admin", "gestor_operacional", "supervisor"], icon: ShieldCheck,
        finalidade: "Indicadores e padrões de reincidência para apoio à decisão.",
        passos: ["Acesse Inteligência Disciplinar.", "Explore os painéis e alertas de reincidência."],
      },
    ],
  },
  {
    grupo: "Cadastros",
    itens: [
      { id: "empresas", titulo: "Empresas", rota: "/empresas", papeis: ["admin"], icon: Building2,
        finalidade: "Cadastrar empresas do grupo.",
        passos: ["Acesse Empresas.", "Inclua/edite registros (CNPJ, razão, dados fiscais)."] },
      { id: "funcoes", titulo: "Funções", rota: "/funcoes", papeis: ["admin"], icon: Briefcase,
        finalidade: "Manter as funções utilizadas em colaboradores e escalas.",
        passos: ["Acesse Funções.", "Inclua/edite descrições."] },
      { id: "clientes", titulo: "Clientes", rota: "/clientes", papeis: ["admin"], icon: Users,
        finalidade: "Cadastrar clientes e suas unidades/empresas vinculadas.",
        passos: ["Acesse Clientes.", "Inclua o cliente e, na ficha, configure as empresas vinculadas."] },
      { id: "colaboradores", titulo: "Colaboradores", rota: "/colaboradores", papeis: ["admin"], icon: Users,
        finalidade: "Cadastrar e manter colaboradores.",
        passos: ["Acesse Colaboradores.", "Inclua/edite (nome, matrícula, CPF, função, empresa).", "Use Desligar para encerrar com auditoria."] },
      { id: "usuarios", titulo: "Usuários", rota: "/usuarios", papeis: ["admin"], icon: UserCog,
        finalidade: "Gerenciar usuários e papéis (RBAC).",
        passos: ["Acesse Usuários.", "Convide novos usuários e atribua papéis (admin, gestor, supervisor, etc.)."] },
      { id: "motivos", titulo: "Motivos de Rejeição", rota: "/motivos-rejeicao", papeis: ["admin"], icon: ListChecks,
        finalidade: "Catálogo de motivos usados nas rejeições de aprovações.",
        passos: ["Acesse Motivos de Rejeição.", "Inclua/edite os textos padronizados."] },
    ],
  },
  {
    grupo: "Sistema",
    itens: [
      { id: "perfil", titulo: "Meu Perfil", rota: "/perfil", icon: UserCircle,
        finalidade: "Consultar seus dados e alterar a senha.",
        passos: ["Acesse Perfil.", "Confira dados e papéis.", "Para trocar a senha, informe a nova (mín. 6 caracteres) e confirme."] },
      { id: "importar", titulo: "Importar Lotação", rota: "/admin/importar-lotacao", papeis: ["admin"], icon: Upload,
        finalidade: "Importar lotações de colaboradores em lote a partir de planilha.",
        passos: ["Acesse Importar Lotação.", "Baixe o modelo, preencha e faça upload.", "Confira o resumo de validações antes de confirmar."] },
      { id: "auditoria", titulo: "Auditoria", rota: "/auditoria", papeis: ["admin"], icon: ShieldCheck,
        finalidade: "Consultar histórico de ações sensíveis no sistema.",
        passos: ["Acesse Auditoria.", "Filtre por usuário, módulo e período."] },
    ],
  },
];

const FLUXO = [
  "1. Lançamento em Extras (operador/supervisor).",
  "2. Aprovação Operacional valida execução.",
  "3. Aprovação Financeira libera para pagamento.",
  "4. Pagamentos registra forma e data.",
  "5. Faturamento marca o que é cobrado do cliente.",
  "6. Fechamento Semanal encerra o ciclo (quinta 19h → quinta 18h59).",
  "7. Recibos e Relatórios consolidam o resultado.",
];

function Page() {
  return (
    <div>
      <PageHeader
        title="Ajuda / Manual do Usuário"
        description="Guia rápido das funcionalidades do App Extras. Cada seção descreve finalidade e passos."
      />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Fluxo geral</CardTitle>
          </div>
          <CardDescription>Como um lançamento percorre o sistema do registro à cobrança.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-1 list-decimal pl-5">
            {FLUXO.map((f) => <li key={f}>{f.replace(/^\d+\.\s*/, "")}</li>)}
          </ol>
        </CardContent>
      </Card>

      {SECOES.map((g) => (
        <div key={g.grupo} className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g.grupo}</h2>
          <Accordion type="multiple" className="rounded-md border bg-card">
            {g.itens.map((s) => {
              const Icon = s.icon;
              return (
                <AccordionItem key={s.id} value={s.id} className="px-3">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-left">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium">{s.titulo}</span>
                      {s.rota && <code className="text-xs text-muted-foreground hidden sm:inline">{s.rota}</code>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    {s.papeis && (
                      <div className="flex flex-wrap gap-1">
                        {s.papeis.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                      </div>
                    )}
                    <p className="text-sm"><span className="font-semibold">Finalidade: </span>{s.finalidade}</p>
                    <div>
                      <p className="text-sm font-semibold mb-1">Procedimento</p>
                      <ol className="text-sm list-decimal pl-5 space-y-1">
                        {s.passos.map((p, i) => <li key={i}>{p}</li>)}
                      </ol>
                    </div>
                    {s.dicas?.length ? (
                      <div>
                        <p className="text-sm font-semibold mb-1">Dicas</p>
                        <ul className="text-sm list-disc pl-5 space-y-1">
                          {s.dicas.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      ))}

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Boas práticas</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>Use filtros antes de gerar relatórios extensos.</li>
            <li>Revise valores e classificação comercial antes de aprovar.</li>
            <li>Confira recibos e documentos gerados antes do envio.</li>
            <li>Encerre as pendências antes do fechamento semanal.</li>
            <li>Anexe evidências em medidas e processos disciplinares.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Perguntas frequentes</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">Não consigo acessar.</p>
            <p className="text-muted-foreground">Confira usuário e senha. Se persistir, peça reset ao administrador.</p>
          </div>
          <div>
            <p className="font-semibold">Não vejo um módulo no menu.</p>
            <p className="text-muted-foreground">O menu obedece aos seus papéis (RBAC). Solicite o papel adequado ao administrador.</p>
          </div>
          <div>
            <p className="font-semibold">Como reabrir uma semana fechada?</p>
            <p className="text-muted-foreground">Em Fechamento, use Reabrir e informe o motivo (ação auditada).</p>
          </div>
          <div>
            <p className="font-semibold">Como gerar um relatório?</p>
            <p className="text-muted-foreground">Acesse o relatório no menu Relatórios, aplique filtros e exporte quando disponível.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
