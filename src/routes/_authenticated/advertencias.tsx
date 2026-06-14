import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Eye, FileText, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { gerarAdvertenciaPdf } from "@/lib/advertencia-pdf";

export const Route = createFileRoute("/_authenticated/advertencias")({ component: Page });

interface Empresa { id: string; nome: string; razao_social: string | null; cnpj: string | null }
interface Colab { id: string; nome: string; cpf: string | null; empresa_id: string; funcao_id: string | null }
interface Funcao { id: string; nome: string }
interface Reason { id: string; nome: string; clt_article: string; clt_subsections: string[]; descricao_padrao: string }
interface Warning {
  id: string; warning_date: string; city: string; employee_name: string; employee_cpf: string | null;
  employee_role: string | null; empresa_razao_social: string | null; empresa_cnpj: string | null;
  empresa_id: string; colaborador_id: string; warning_reason_id: string | null;
  conduct_description: string; observacoes: string | null; clt_article: string; clt_subsections: string[];
  created_by: string | null; created_at: string;
}

function fmtDateBR(iso: string) {
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
    queryFn: async () => ((await supabase.from("colaboradores").select("id,nome,cpf,empresa_id,funcao_id").eq("situacao", "ativo").order("nome")).data ?? []) as Colab[],
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
    queryFn: async () => ((await supabase.from("disciplinary_warnings").select("*").order("created_at", { ascending: false }).limit(500)).data ?? []) as Warning[],
  });

  const funMap = useMemo(() => new Map((funcoes.data ?? []).map((f) => [f.id, f.nome])), [funcoes.data]);
  const empMap = useMemo(() => new Map((empresas.data ?? []).map((e) => [e.id, e])), [empresas.data]);
  const colabMap = useMemo(() => new Map((colabs.data ?? []).map((c) => [c.id, c])), [colabs.data]);

  // Form state
  const [empresaId, setEmpresaId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [warningDate, setWarningDate] = useState(todayISO());
  const [city, setCity] = useState("Londrina");
  const [reasonId, setReasonId] = useState("");
  const [conduct, setConduct] = useState("");
  const [obs, setObs] = useState("");

  const colab = colaboradorId ? colabMap.get(colaboradorId) : undefined;
  const empresa = empresaId ? empMap.get(empresaId) : undefined;
  const reason = reasonId ? reasons.data?.find((r) => r.id === reasonId) : undefined;
  const cargo = colab?.funcao_id ? funMap.get(colab.funcao_id) ?? "" : "";

  const colabOptions = useMemo(
    () => (colabs.data ?? []).map((c) => ({ value: c.id, label: c.nome, keywords: `${c.cpf ?? ""} ${empMap.get(c.empresa_id)?.nome ?? ""}` })),
    [colabs.data, empMap]
  );

  function onPickColab(id: string) {
    setColaboradorId(id);
    const c = colabMap.get(id);
    if (c && !empresaId) setEmpresaId(c.empresa_id);
  }

  function onPickReason(id: string) {
    setReasonId(id);
    const r = reasons.data?.find((x) => x.id === id);
    if (r && !conduct.trim()) setConduct(r.descricao_padrao);
  }

  function buildPdfData() {
    if (!empresa || !colab || !reason) return null;
    return {
      city, date: fmtDateBR(warningDate),
      employeeName: colab.nome,
      employeeCpf: colab.cpf ?? "",
      conductDescription: conduct.trim(),
      cltArticle: reason.clt_article,
      cltSubsections: reason.clt_subsections,
      empresaRazaoSocial: empresa.razao_social ?? empresa.nome,
      empresaCnpj: empresa.cnpj ?? "",
      observacoes: obs.trim() || undefined,
    };
  }

  async function handlePreview() {
    const d = buildPdfData();
    if (!d) return toast.error("Preencha empresa, colaborador e motivo.");
    if (!d.conductDescription) return toast.error("Descrição da conduta é obrigatória.");
    await gerarAdvertenciaPdf(d, `advertencia-${colab?.nome ?? "preview"}.pdf`, { autoPrint: false });
  }

  async function handleGenerate() {
    if (!user) return;
    const d = buildPdfData();
    if (!d) return toast.error("Preencha empresa, colaborador e motivo.");
    if (!d.conductDescription) return toast.error("Descrição da conduta é obrigatória.");
    if (!canManage) return toast.error("Sem permissão.");

    const filename = `advertencia-${(colab?.nome ?? "").replace(/\s+/g, "_")}-${warningDate}.pdf`;

    const { error } = await supabase.from("disciplinary_warnings").insert({
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
      created_by: user.id,
    });
    if (error) return toast.error(error.message);

    await gerarAdvertenciaPdf(d, filename);
    toast.success("Advertência registrada.");
    setConduct(""); setObs(""); setReasonId("");
    qc.invalidateQueries({ queryKey: ["adv-warnings"] });
  }

  async function reimprimir(w: Warning, autoPrint: boolean) {
    await gerarAdvertenciaPdf(
      {
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
      },
      `advertencia-${w.employee_name.replace(/\s+/g, "_")}-${w.warning_date}.pdf`,
      { autoPrint }
    );
  }

  return (
    <>
      <PageHeader
        title="Advertências Disciplinares"
        description="Geração e histórico de advertências formais."
      />

      <Tabs defaultValue="nova">
        <TabsList>
          <TabsTrigger value="nova"><FileText className="h-4 w-4 mr-2" />Nova Advertência</TabsTrigger>
          <TabsTrigger value="historico"><HistoryIcon className="h-4 w-4 mr-2" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="nova">
          <Card>
            <CardHeader><CardTitle>Dados da Advertência</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Empresa *</Label>
                <Select value={empresaId} onValueChange={setEmpresaId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                  <SelectContent>
                    {(empresas.data ?? []).map((e) => (
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
                  placeholder="Buscar colaborador..."
                  searchPlaceholder="Nome ou CPF..."
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
                <Label>Data da advertência *</Label>
                <Input type="date" value={warningDate} onChange={(e) => setWarningDate(e.target.value)} />
              </div>

              <div>
                <Label>Cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>

              <div className="md:col-span-2">
                <Label>Motivo da advertência *</Label>
                <Select value={reasonId} onValueChange={onPickReason}>
                  <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
                  <SelectContent>
                    {(reasons.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Enquadramento CLT</Label>
                <Input
                  readOnly
                  value={reason ? `${reason.clt_article} — alínea(s) ${reason.clt_subsections.map((s) => s.toUpperCase()).join(", ")}` : ""}
                  placeholder="—"
                />
              </div>

              <div /> {/* spacer */}

              <div className="md:col-span-2">
                <Label>Descrição da conduta *</Label>
                <Textarea rows={4} value={conduct} onChange={(e) => setConduct(e.target.value)} placeholder="Descreva a conduta do colaborador..." />
              </div>

              <div className="md:col-span-2">
                <Label>Observações adicionais</Label>
                <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
              </div>

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
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader><CardTitle>Histórico de Advertências</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>CLT</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(warnings.data ?? []).map((w) => {
                      const reasonName = reasons.data?.find((r) => r.id === w.warning_reason_id)?.nome ?? "—";
                      return (
                        <TableRow key={w.id}>
                          <TableCell>{fmtDateBR(w.warning_date)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{w.empresa_razao_social ?? empMap.get(w.empresa_id)?.nome ?? "—"}</TableCell>
                          <TableCell>{w.employee_name}</TableCell>
                          <TableCell>{w.employee_cpf ?? "—"}</TableCell>
                          <TableCell>{reasonName}</TableCell>
                          <TableCell>{w.clt_article} {w.clt_subsections.map((s) => s.toUpperCase()).join("/")}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => reimprimir(w, false)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => reimprimir(w, true)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!warnings.isLoading && (warnings.data ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhuma advertência registrada.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
