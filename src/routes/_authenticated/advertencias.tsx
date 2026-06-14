import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Eye, FileText, History as HistoryIcon, Ban, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gerarAdvertenciaPdf, type DisciplinaryActionType } from "@/lib/advertencia-pdf";
import { RecidivismAlert } from "@/components/disciplinary/recidivism-alert";
import { InactivateButton } from "@/components/disciplinary/inactivate-button";
import { useServerFn } from "@tanstack/react-start";
import { logPrintAction } from "@/lib/disciplinary-audit.functions";

type PrintEntity = "advertencia" | "suspensao" | "orientacao" | "justa_causa" | "warning";
function entityFor(a: DisciplinaryActionType): PrintEntity {
  if (a === "advertencia_escrita") return "advertencia";
  if (a === "suspensao") return "suspensao";
  if (a === "orientacao_verbal") return "orientacao";
  if (a === "justa_causa") return "justa_causa";
  return "warning";
}

export const Route = createFileRoute("/_authenticated/advertencias")({ component: Page });

interface Empresa { id: string; nome: string; razao_social: string | null; cnpj: string | null }
interface Colab { id: string; nome: string; matricula: string | null; cpf: string | null; empresa_id: string; funcao_id: string | null }
interface Funcao { id: string; nome: string }
interface Reason { id: string; nome: string; clt_article: string; clt_subsections: string[]; descricao_padrao: string }
interface Warning {
  id: string; warning_date: string; city: string; employee_name: string; employee_cpf: string | null;
  employee_role: string | null; empresa_razao_social: string | null; empresa_cnpj: string | null;
  empresa_id: string; colaborador_id: string; warning_reason_id: string | null;
  conduct_description: string; observacoes: string | null; clt_article: string; clt_subsections: string[];
  created_by: string | null; created_at: string;
  action_type: DisciplinaryActionType;
  suspension_days: number | null;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
}

const ACTION_LABEL: Record<DisciplinaryActionType, string> = {
  orientacao_verbal: "Orientação Verbal",
  advertencia_escrita: "Advertência Escrita",
  suspensao: "Suspensão",
  justa_causa: "Justa Causa",
};

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Page() {
  const { user, isAdmin, isGestorOp, isSupervisor } = useAuth();
  const canManage = isAdmin || isGestorOp || isSupervisor;
  const qc = useQueryClient();

  const empresas = useQuery({
    queryKey: ["adv-empresas"],
    queryFn: async () => ((await supabase.from("empresas").select("id,nome,razao_social,cnpj").eq("situacao", "ativo").order("nome")).data ?? []) as Empresa[],
  });
  const colabs = useQuery({
    queryKey: ["adv-colabs"],
    queryFn: async () => ((await supabase.from("colaboradores").select("id,nome,matricula,cpf,empresa_id,funcao_id").eq("situacao", "ativo").order("nome")).data ?? []) as Colab[],
  });
  const funcoes = useQuery({
    queryKey: ["adv-funcoes"],
    queryFn: async () => ((await supabase.from("funcoes").select("id,nome")).data ?? []) as Funcao[],
  });
  const reasons = useQuery({
    queryKey: ["adv-reasons"],
    queryFn: async () => ((await supabase.from("warning_reasons").select("id,nome,clt_article,clt_subsections,descricao_padrao").eq("ativo", true).order("nome")).data ?? []) as Reason[],
  });
  const warnings = useQuery({
    queryKey: ["adv-warnings"],
    queryFn: async () => ((await supabase.from("disciplinary_warnings").select("*").eq("active", true).order("created_at", { ascending: false }).limit(500)).data ?? []) as Warning[],
  });

  const funMap = useMemo(() => new Map((funcoes.data ?? []).map((f) => [f.id, f.nome])), [funcoes.data]);
  const empMap = useMemo(() => new Map((empresas.data ?? []).map((e) => [e.id, e])), [empresas.data]);
  const colabMap = useMemo(() => new Map((colabs.data ?? []).map((c) => [c.id, c])), [colabs.data]);

  return (
    <>
      <PageHeader
        title="Medidas Disciplinares"
        description="Geração e histórico de orientações verbais, advertências e suspensões."
      />

      <Tabs defaultValue="advertencia">
        <TabsList>
          <TabsTrigger value="advertencia"><FileText className="h-4 w-4 mr-2" />Advertência Escrita</TabsTrigger>
          <TabsTrigger value="suspensao"><Ban className="h-4 w-4 mr-2" />Suspensão</TabsTrigger>
          <TabsTrigger value="historico"><HistoryIcon className="h-4 w-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="advertencia">
          <MedidaForm
            actionType="advertencia_escrita"
            canManage={canManage}
            userId={user?.id}
            empresas={empresas.data ?? []}
            colabs={colabs.data ?? []}
            reasons={reasons.data ?? []}
            empMap={empMap}
            colabMap={colabMap}
            funMap={funMap}
            warnings={warnings.data ?? []}
            onSaved={() => qc.invalidateQueries({ queryKey: ["adv-warnings"] })}
          />
        </TabsContent>

        <TabsContent value="suspensao">
          <MedidaForm
            actionType="suspensao"
            canManage={canManage}
            userId={user?.id}
            empresas={empresas.data ?? []}
            colabs={colabs.data ?? []}
            reasons={reasons.data ?? []}
            empMap={empMap}
            colabMap={colabMap}
            funMap={funMap}
            warnings={warnings.data ?? []}
            onSaved={() => qc.invalidateQueries({ queryKey: ["adv-warnings"] })}
          />
        </TabsContent>

        <TabsContent value="historico">
          <Historico
            warnings={warnings.data ?? []}
            reasons={reasons.data ?? []}
            empMap={empMap}
            isLoading={warnings.isLoading}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

interface MedidaFormProps {
  actionType: DisciplinaryActionType;
  canManage: boolean;
  userId?: string;
  empresas: Empresa[];
  colabs: Colab[];
  reasons: Reason[];
  empMap: Map<string, Empresa>;
  colabMap: Map<string, Colab>;
  funMap: Map<string, string>;
  warnings: Warning[];
  onSaved: () => void;
}

function MedidaForm({ actionType, canManage, userId, empresas, colabs, reasons, empMap, colabMap, funMap, warnings, onSaved }: MedidaFormProps) {
  const isSusp = actionType === "suspensao";
  const log = useServerFn(logPrintAction);
  const [empresaId, setEmpresaId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [warningDate, setWarningDate] = useState(todayISO());
  const [city, setCity] = useState("Londrina");
  const [reasonId, setReasonId] = useState("");
  const [conduct, setConduct] = useState("");
  const [obs, setObs] = useState("");
  const [suspDays, setSuspDays] = useState<number>(1);
  const [suspStart, setSuspStart] = useState("");

  const colab = colaboradorId ? colabMap.get(colaboradorId) : undefined;
  const empresa = empresaId ? empMap.get(empresaId) : undefined;
  const reason = reasonId ? reasons.find((r) => r.id === reasonId) : undefined;
  const cargo = colab?.funcao_id ? funMap.get(colab.funcao_id) ?? "" : "";

  const historico = useMemo(
    () => warnings.filter((w) => w.colaborador_id === colaboradorId),
    [warnings, colaboradorId]
  );

  const colabOptions = useMemo(
    () => colabs.map((c) => ({
      value: c.id,
      label: c.matricula ? `${c.matricula} - ${c.nome}` : c.nome,
      keywords: `${c.nome} ${c.matricula ?? ""} ${c.cpf ?? ""} ${empMap.get(c.empresa_id)?.nome ?? ""}`,
    })),
    [colabs, empMap]
  );

  function onPickColab(id: string) {
    setColaboradorId(id);
    const c = colabMap.get(id);
    if (c && !empresaId) setEmpresaId(c.empresa_id);
  }

  function onPickReason(id: string) {
    setReasonId(id);
    const r = reasons.find((x) => x.id === id);
    if (r && !conduct.trim()) setConduct(r.descricao_padrao);
  }

  function addDaysISO(iso: string, days: number) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function buildPdfData() {
    if (!empresa || !colab || !reason) return null;
    const suspEnd = isSusp && suspStart ? addDaysISO(suspStart, Math.max(0, suspDays - 1)) : "";
    return {
      actionType,
      city, date: fmtDateBR(warningDate),
      employeeName: colab.nome,
      employeeCpf: colab.cpf ?? "",
      conductDescription: conduct.trim(),
      cltArticle: reason.clt_article,
      cltSubsections: reason.clt_subsections,
      empresaRazaoSocial: empresa.razao_social ?? empresa.nome,
      empresaCnpj: empresa.cnpj ?? "",
      observacoes: obs.trim() || undefined,
      suspensionDays: isSusp ? suspDays : null,
      suspensionStart: isSusp && suspStart ? fmtDateBR(suspStart) : null,
      suspensionEnd: isSusp && suspEnd ? fmtDateBR(suspEnd) : null,
    };
  }

  async function handlePreview() {
    const d = buildPdfData();
    if (!d) return toast.error("Preencha empresa, colaborador e motivo.");
    if (!d.conductDescription) return toast.error("Descrição da conduta é obrigatória.");
    if (isSusp && (!suspDays || suspDays < 1)) return toast.error("Informe os dias de suspensão.");
    await gerarAdvertenciaPdf(d, `${isSusp ? "suspensao" : "advertencia"}-${colab?.nome ?? "preview"}.pdf`, { autoPrint: false });
  }

  async function handleGenerate() {
    if (!userId) return;
    const d = buildPdfData();
    if (!d) return toast.error("Preencha empresa, colaborador e motivo.");
    if (!d.conductDescription) return toast.error("Descrição da conduta é obrigatória.");
    if (isSusp && (!suspDays || suspDays < 1)) return toast.error("Informe os dias de suspensão.");
    if (!canManage) return toast.error("Sem permissão.");

    const prefix = isSusp ? "suspensao" : "advertencia";
    const filename = `${prefix}-${(colab?.nome ?? "").replace(/\s+/g, "_")}-${warningDate}.pdf`;
    const suspEnd = isSusp && suspStart ? addDaysISO(suspStart, Math.max(0, suspDays - 1)) : null;

    const { data: ins, error } = await supabase.from("disciplinary_warnings").insert({
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      warning_date: warningDate,
      city,
      employee_name: d.employeeName,
      employee_cpf: d.employeeCpf || null,
      employee_role: cargo || null,
      empresa_razao_social: d.empresaRazaoSocial,
      empresa_cnpj: d.empresaCnpj || null,
      warning_reason_id: reasonId,
      conduct_description: d.conductDescription,
      observacoes: obs.trim() || null,
      clt_article: reason!.clt_article,
      clt_subsections: reason!.clt_subsections,
      created_by: userId,
      action_type: actionType,
      suspension_days: isSusp ? suspDays : null,
      suspension_start_date: isSusp ? (suspStart || null) : null,
      suspension_end_date: isSusp ? (suspEnd || null) : null,
    }).select("id").single();
    if (error) return toast.error(error.message);

    await gerarAdvertenciaPdf(d, filename);
    try {
      await log({ data: { entity_type: entityFor(actionType), entity_id: ins!.id, action: "download" } });
    } catch { /* não bloquear emissão por falha de log */ }
    toast.success(`${ACTION_LABEL[actionType]} registrada.`);
    setConduct(""); setObs(""); setReasonId("");
    if (isSusp) { setSuspStart(""); setSuspDays(1); }
    onSaved();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Dados da {ACTION_LABEL[actionType]}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {isSusp && (
          <Alert className="md:col-span-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>Verifique se existe histórico disciplinar anterior antes da aplicação da suspensão.</AlertDescription>
          </Alert>
        )}

        <div>
          <Label>Empresa *</Label>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social ?? e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Colaborador *</Label>
          <SearchableSelect
            options={colabOptions}
            value={colaboradorId}
            onChange={onPickColab}
            placeholder="Selecionar"
            searchPlaceholder="Digite nome, matrícula ou CPF..."
          />
        </div>

        <div>
          <Label>CPF</Label>
          <Input value={colab?.cpf ?? ""} readOnly placeholder="—" />
        </div>

        <div>
          <Label>Cargo</Label>
          <Input value={cargo} readOnly placeholder="—" />
        </div>

        <div>
          <Label>Data {isSusp ? "da suspensão" : "da advertência"} *</Label>
          <Input type="date" value={warningDate} onChange={(e) => setWarningDate(e.target.value)} />
        </div>

        <div>
          <Label>Cidade</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>

        {isSusp && (
          <>
            <div>
              <Label>Dias de suspensão *</Label>
              <Input type="number" min={1} max={30} value={suspDays} onChange={(e) => setSuspDays(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Início da suspensão</Label>
              <Input type="date" value={suspStart} onChange={(e) => setSuspStart(e.target.value)} />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <Label>Motivo *</Label>
          <Select value={reasonId} onValueChange={onPickReason}>
            <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label>Enquadramento CLT</Label>
          <Input
            readOnly
            value={reason ? `${reason.clt_article} — alínea(s) ${reason.clt_subsections.map((s) => s.toUpperCase()).join(", ")}` : ""}
            placeholder="—"
          />
        </div>

        <div className="md:col-span-2">
          <Label>Descrição da conduta *</Label>
          <Textarea rows={4} value={conduct} onChange={(e) => setConduct(e.target.value)} placeholder="Descreva a conduta do colaborador..." />
        </div>

        <div className="md:col-span-2">
          <Label>Observações adicionais</Label>
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </div>

        {colaboradorId && (
          <div className="md:col-span-2"><RecidivismAlert employeeId={colaboradorId} reasonId={reasonId || null} /></div>
        )}

        {colaboradorId && historico.length > 0 && (
          <div className="md:col-span-2">
            <Label>Histórico disciplinar do colaborador</Label>
            <div className="rounded-md border mt-1 max-h-48 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{fmtDateBR(h.warning_date)}</TableCell>
                      <TableCell><Badge variant="outline">{ACTION_LABEL[h.action_type]}{h.action_type === "suspensao" && h.suspension_days ? ` · ${h.suspension_days}d` : ""}</Badge></TableCell>
                      <TableCell className="max-w-[420px] truncate">{reasons.find((r) => r.id === h.warning_reason_id)?.nome ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-2" />Pré-visualizar PDF
          </Button>
          <Button onClick={handleGenerate} disabled={!canManage}>
            <Download className="h-4 w-4 mr-2" />Gerar e Registrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface HistoricoProps {
  warnings: Warning[];
  reasons: Reason[];
  empMap: Map<string, Empresa>;
  isLoading: boolean;
}

function Historico({ warnings, reasons, empMap, isLoading }: HistoricoProps) {
  const log = useServerFn(logPrintAction);
  const { isAdmin, isGestorOp } = useAuth();
  const canInactivate = isAdmin || isGestorOp;
  async function reimprimir(w: Warning, autoPrint: boolean) {
    if (w.action_type === "justa_causa") {
      const { gerarJustaCausaPdf } = await import("@/lib/justa-causa-pdf");
      await gerarJustaCausaPdf(
        {
          city: w.city,
          date: fmtDateBR(w.warning_date),
          employeeName: w.employee_name,
          employeeCpf: w.employee_cpf ?? "",
          description: w.conduct_description,
          cltSubsections: w.clt_subsections,
          empresaRazaoSocial: w.empresa_razao_social ?? "",
          empresaCnpj: w.empresa_cnpj ?? "",
        },
        `justa-causa-${w.employee_name.replace(/\s+/g, "_")}-${w.warning_date}.pdf`,
        { autoPrint }
      );
      try { await log({ data: { entity_type: "justa_causa", entity_id: w.id, action: autoPrint ? "reprint" : "download" } }); } catch { /* noop */ }
      return;
    }
    await gerarAdvertenciaPdf(
      {
        actionType: w.action_type,
        city: w.city,
        date: fmtDateBR(w.warning_date),
        employeeName: w.employee_name,
        employeeCpf: w.employee_cpf ?? "",
        conductDescription: w.conduct_description,
        cltArticle: w.clt_article,
        cltSubsections: w.clt_subsections,
        empresaRazaoSocial: w.empresa_razao_social ?? "",
        empresaCnpj: w.empresa_cnpj ?? "",
        observacoes: w.observacoes ?? undefined,
        suspensionDays: w.suspension_days,
        suspensionStart: w.suspension_start_date ? fmtDateBR(w.suspension_start_date) : null,
        suspensionEnd: w.suspension_end_date ? fmtDateBR(w.suspension_end_date) : null,
      },
      `${w.action_type === "suspensao" ? "suspensao" : "advertencia"}-${w.employee_name.replace(/\s+/g, "_")}-${w.warning_date}.pdf`,
      { autoPrint }
    );
    try { await log({ data: { entity_type: entityFor(w.action_type), entity_id: w.id, action: autoPrint ? "reprint" : "download" } }); } catch { /* noop */ }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Histórico Disciplinar</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>CLT</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warnings.map((w) => {
                const reasonName = reasons.find((r) => r.id === w.warning_reason_id)?.nome ?? "—";
                return (
                  <TableRow key={w.id}>
                    <TableCell>{fmtDateBR(w.warning_date)}</TableCell>
                    <TableCell>
                      <Badge variant={w.action_type === "suspensao" ? "destructive" : w.action_type === "advertencia_escrita" ? "default" : "secondary"}>
                        {ACTION_LABEL[w.action_type]}{w.action_type === "suspensao" && w.suspension_days ? ` · ${w.suspension_days}d` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{w.empresa_razao_social ?? empMap.get(w.empresa_id)?.nome ?? "—"}</TableCell>
                    <TableCell>{w.employee_name}</TableCell>
                    <TableCell>{w.employee_cpf ?? "—"}</TableCell>
                    <TableCell>{reasonName}</TableCell>
                    <TableCell>{w.clt_article} {w.clt_subsections.map((s) => s.toUpperCase()).join("/")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => reimprimir(w, false)} title="Baixar">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => reimprimir(w, true)} title="Reimprimir">
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canInactivate && (
                        <InactivateButton
                          table="disciplinary_warnings"
                          id={w.id}
                          invalidateKeys={[["adv-warnings"]]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && warnings.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhuma medida registrada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
