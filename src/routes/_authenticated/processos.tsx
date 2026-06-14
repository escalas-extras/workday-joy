import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Upload, FileText, Users as UsersIcon, ShieldCheck, Gavel, Download, Eye,
  CheckCircle2, XCircle, History as HistoryIcon, AlertCircle, ChevronLeft, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ART_482, buildBaseBody, gerarJustaCausaPdf } from "@/lib/justa-causa-pdf";

export const Route = createFileRoute("/_authenticated/processos")({ component: ProcessosPage });

const STATUS_OPTIONS = [
  { v: "aberto", l: "Aberto" },
  { v: "em_apuracao", l: "Em Apuração" },
  { v: "aguardando_rh", l: "Aguardando RH" },
  { v: "aguardando_diretoria", l: "Aguardando Diretoria" },
  { v: "aprovado", l: "Aprovado" },
  { v: "arquivado", l: "Arquivado" },
  { v: "convertido_justa_causa", l: "Convertido em Justa Causa" },
] as const;
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.v, s.l]));

type Status = (typeof STATUS_OPTIONS)[number]["v"];
type Step = "supervisor" | "rh" | "diretoria";

interface Empresa { id: string; nome: string; razao_social: string | null; cnpj: string | null }
interface Colab { id: string; nome: string; matricula: string | null; cpf: string | null; empresa_id: string; funcao_id: string | null }
interface Funcao { id: string; nome: string }
interface CaseRow {
  id: string; company_id: string; employee_id: string; opened_by: string | null;
  opened_at: string; status: Status; occurrence_date: string | null;
  description: string; legal_basis: string[]; final_decision: string | null;
  observations: string | null; warning_id: string | null; created_at: string; updated_at: string;
}
interface Evidence { id: string; case_id: string; file_path: string; file_name: string; mime_type: string; size_bytes: number | null; descricao: string | null; uploaded_by: string | null; created_at: string }
interface Witness { id: string; case_id: string; nome: string; cpf: string | null; cargo: string | null; telefone: string | null; relato: string | null; observacoes: string | null; created_at: string }
interface Approval { id: string; case_id: string; step: Step; approved_by: string; decision: "aprovado" | "rejeitado"; observacao: string | null; created_at: string }
interface HistWarning {
  id: string; warning_date: string; action_type: "orientacao_verbal" | "advertencia_escrita" | "suspensao" | "justa_causa";
  colaborador_id: string; conduct_description: string; suspension_days: number | null;
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusBadge(s: Status) {
  const variant: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
    aberto: "outline",
    em_apuracao: "secondary",
    aguardando_rh: "secondary",
    aguardando_diretoria: "secondary",
    aprovado: "default",
    arquivado: "outline",
    convertido_justa_causa: "destructive",
  };
  return <Badge variant={variant[s]}>{STATUS_LABEL[s]}</Badge>;
}

function ProcessosPage() {
  const { user, isAdmin, isGestorOp, isSupervisor } = useAuth();
  const canCreate = isAdmin || isGestorOp || isSupervisor;
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const empresas = useQuery({
    queryKey: ["proc-empresas"],
    queryFn: async () => ((await supabase.from("empresas").select("id,nome,razao_social,cnpj").eq("situacao", "ativo").order("nome")).data ?? []) as Empresa[],
  });
  const colabs = useQuery({
    queryKey: ["proc-colabs"],
    queryFn: async () => ((await supabase.from("colaboradores").select("id,nome,matricula,cpf,empresa_id,funcao_id").eq("situacao", "ativo").order("nome")).data ?? []) as Colab[],
  });
  const funcoes = useQuery({
    queryKey: ["proc-funcoes"],
    queryFn: async () => ((await supabase.from("funcoes").select("id,nome")).data ?? []) as Funcao[],
  });
  const cases = useQuery({
    queryKey: ["proc-cases"],
    queryFn: async () => ((await supabase.from("disciplinary_cases").select("*").order("opened_at", { ascending: false })).data ?? []) as CaseRow[],
  });

  const empMap = useMemo(() => new Map((empresas.data ?? []).map((e) => [e.id, e])), [empresas.data]);
  const colabMap = useMemo(() => new Map((colabs.data ?? []).map((c) => [c.id, c])), [colabs.data]);
  const funMap = useMemo(() => new Map((funcoes.data ?? []).map((f) => [f.id, f.nome])), [funcoes.data]);

  const selected = selectedId ? cases.data?.find((c) => c.id === selectedId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Processos Disciplinares"
        description="Apuração, evidências, testemunhas, aprovações e emissão de Justa Causa."
      />

      {selected ? (
        <CaseDetail
          caseRow={selected}
          empresa={empMap.get(selected.company_id) ?? null}
          colab={colabMap.get(selected.employee_id) ?? null}
          cargo={(colabMap.get(selected.employee_id)?.funcao_id && funMap.get(colabMap.get(selected.employee_id)!.funcao_id!)) || ""}
          userId={user?.id}
          isAdmin={isAdmin}
          isGestorOp={isGestorOp}
          isSupervisor={isSupervisor}
          onBack={() => setSelectedId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["proc-cases"] })}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <NewCaseForm
              canCreate={canCreate}
              userId={user?.id}
              empresas={empresas.data ?? []}
              colabs={colabs.data ?? []}
              empMap={empMap}
              colabMap={colabMap}
              onCreated={(id) => {
                qc.invalidateQueries({ queryKey: ["proc-cases"] });
                setSelectedId(id);
              }}
            />
          </div>
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Processos</CardTitle>
                <CardDescription>Clique em um processo para abrir os detalhes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aberto em</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cases.data ?? []).map((c) => (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedId(c.id)}>
                          <TableCell>{fmtDateBR(c.opened_at)}</TableCell>
                          <TableCell>{empMap.get(c.company_id)?.razao_social ?? empMap.get(c.company_id)?.nome ?? "—"}</TableCell>
                          <TableCell>{colabMap.get(c.employee_id)?.nome ?? "—"}</TableCell>
                          <TableCell>{statusBadge(c.status)}</TableCell>
                        </TableRow>
                      ))}
                      {!cases.isLoading && (cases.data ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum processo registrado.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------- NEW CASE ------------------------- */
function NewCaseForm({
  canCreate, userId, empresas, colabs, empMap, colabMap, onCreated,
}: {
  canCreate: boolean; userId?: string;
  empresas: Empresa[]; colabs: Colab[];
  empMap: Map<string, Empresa>; colabMap: Map<string, Colab>;
  onCreated: (id: string) => void;
}) {
  const [empresaId, setEmpresaId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState(todayISO());
  const [description, setDescription] = useState("");

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

  async function handleCreate() {
    if (!userId) return;
    if (!empresaId || !colaboradorId) return toast.error("Selecione empresa e colaborador.");
    if (!description.trim()) return toast.error("Descreva o fato.");
    const { data, error } = await supabase
      .from("disciplinary_cases")
      .insert({
        company_id: empresaId,
        employee_id: colaboradorId,
        opened_by: userId,
        occurrence_date: occurrenceDate,
        description: description.trim(),
        status: "aberto",
        legal_basis: [],
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Processo aberto.");
    setDescription(""); setColaboradorId("");
    onCreated(data!.id);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Abrir novo processo</CardTitle></CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <Label>Empresa *</Label>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.razao_social ?? e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Colaborador *</Label>
          <SearchableSelect options={colabOptions} value={colaboradorId} onChange={onPickColab}
            placeholder="Selecionar" searchPlaceholder="Nome, matrícula ou CPF..." />
        </div>
        <div>
          <Label>Data da ocorrência</Label>
          <Input type="date" value={occurrenceDate} onChange={(e) => setOccurrenceDate(e.target.value)} />
        </div>
        <div>
          <Label>Descrição do fato *</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva detalhadamente o ocorrido..." />
        </div>
        <Button onClick={handleCreate} disabled={!canCreate}>
          <Plus className="h-4 w-4 mr-2" />Abrir processo
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------- DETAIL ------------------------- */
function CaseDetail({
  caseRow, empresa, colab, cargo, userId, isAdmin, isGestorOp, isSupervisor, onBack, onChanged,
}: {
  caseRow: CaseRow; empresa: Empresa | null; colab: Colab | null; cargo: string;
  userId?: string; isAdmin: boolean; isGestorOp: boolean; isSupervisor: boolean;
  onBack: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const evidences = useQuery({
    queryKey: ["proc-evid", caseRow.id],
    queryFn: async () => ((await supabase.from("disciplinary_case_evidences").select("*").eq("case_id", caseRow.id).order("created_at", { ascending: false })).data ?? []) as Evidence[],
  });
  const witnesses = useQuery({
    queryKey: ["proc-wit", caseRow.id],
    queryFn: async () => ((await supabase.from("disciplinary_case_witnesses").select("*").eq("case_id", caseRow.id).order("created_at")).data ?? []) as Witness[],
  });
  const approvals = useQuery({
    queryKey: ["proc-appr", caseRow.id],
    queryFn: async () => ((await supabase.from("disciplinary_case_approvals").select("*").eq("case_id", caseRow.id)).data ?? []) as Approval[],
  });
  const histWarnings = useQuery({
    queryKey: ["proc-hist", caseRow.employee_id],
    queryFn: async () => ((await supabase.from("disciplinary_warnings").select("id,warning_date,action_type,colaborador_id,conduct_description,suspension_days").eq("colaborador_id", caseRow.employee_id).order("warning_date", { ascending: false })).data ?? []) as HistWarning[],
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["proc-evid", caseRow.id] });
    qc.invalidateQueries({ queryKey: ["proc-wit", caseRow.id] });
    qc.invalidateQueries({ queryKey: ["proc-appr", caseRow.id] });
    qc.invalidateQueries({ queryKey: ["proc-hist", caseRow.employee_id] });
    onChanged();
  };

  const apprByStep: Partial<Record<Step, Approval>> = {};
  for (const a of approvals.data ?? []) if (a.decision === "aprovado") apprByStep[a.step] = a;
  const rhOk = !!apprByStep.rh;
  const diretoriaOk = !!apprByStep.diretoria;
  const supervisorOk = !!apprByStep.supervisor;

  const canJC = useMemo(() => {
    return (
      !!caseRow.description.trim() &&
      (evidences.data?.length ?? 0) > 0 &&
      (witnesses.data?.length ?? 0) > 0 &&
      rhOk && diretoriaOk &&
      caseRow.legal_basis.length > 0 &&
      caseRow.status !== "convertido_justa_causa"
    );
  }, [caseRow, evidences.data, witnesses.data, rhOk, diretoriaOk]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Voltar</Button>
        <span className="font-medium">{colab?.nome ?? "—"}</span>
        <span className="text-muted-foreground text-sm">· {empresa?.razao_social ?? empresa?.nome ?? "—"}</span>
        {statusBadge(caseRow.status)}
        <span className="text-xs text-muted-foreground ml-auto">Aberto em {fmtDateBR(caseRow.opened_at)}</span>
      </div>

      <Tabs defaultValue="dados">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dados"><FileText className="h-4 w-4 mr-1" />Dados</TabsTrigger>
          <TabsTrigger value="evid"><Upload className="h-4 w-4 mr-1" />Evidências ({evidences.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="test"><UsersIcon className="h-4 w-4 mr-1" />Testemunhas ({witnesses.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="hist"><HistoryIcon className="h-4 w-4 mr-1" />Histórico ({histWarnings.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="aprov"><ShieldCheck className="h-4 w-4 mr-1" />Aprovações</TabsTrigger>
          <TabsTrigger value="jc"><Gavel className="h-4 w-4 mr-1" />Justa Causa</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <DadosTab caseRow={caseRow} isAdmin={isAdmin} isGestorOp={isGestorOp} isSupervisor={isSupervisor} onSaved={reload} />
        </TabsContent>

        <TabsContent value="evid">
          <EvidencesTab caseId={caseRow.id} list={evidences.data ?? []} loading={evidences.isLoading} userId={userId}
            canWrite={isAdmin || isGestorOp || isSupervisor} onChanged={reload} />
        </TabsContent>

        <TabsContent value="test">
          <WitnessesTab caseId={caseRow.id} list={witnesses.data ?? []} loading={witnesses.isLoading} userId={userId}
            canWrite={isAdmin || isGestorOp || isSupervisor} onChanged={reload} />
        </TabsContent>

        <TabsContent value="hist">
          <HistoryTab list={histWarnings.data ?? []} loading={histWarnings.isLoading} />
        </TabsContent>

        <TabsContent value="aprov">
          <ApprovalsTab
            caseRow={caseRow} list={approvals.data ?? []} userId={userId}
            isAdmin={isAdmin} isGestorOp={isGestorOp} isSupervisor={isSupervisor}
            onChanged={reload}
          />
        </TabsContent>

        <TabsContent value="jc">
          <JustaCausaTab
            caseRow={caseRow} empresa={empresa} colab={colab}
            witnesses={witnesses.data ?? []} evidences={evidences.data ?? []}
            checklist={{
              fato: !!caseRow.description.trim(),
              evid: (evidences.data?.length ?? 0) > 0,
              test: (witnesses.data?.length ?? 0) > 0,
              hist: (histWarnings.data?.length ?? 0) >= 0,
              rh: rhOk, diretoria: diretoriaOk, supervisor: supervisorOk,
              alineas: caseRow.legal_basis.length > 0,
            }}
            canJC={canJC}
            onGenerated={reload}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------- TABS ------------------------- */
function DadosTab({
  caseRow, isAdmin, isGestorOp, isSupervisor, onSaved,
}: {
  caseRow: CaseRow; isAdmin: boolean; isGestorOp: boolean; isSupervisor: boolean; onSaved: () => void;
}) {
  const canEdit = isAdmin || isGestorOp || isSupervisor;
  const [status, setStatus] = useState<Status>(caseRow.status);
  const [occurrenceDate, setOccurrenceDate] = useState(caseRow.occurrence_date ?? "");
  const [description, setDescription] = useState(caseRow.description);
  const [observations, setObservations] = useState(caseRow.observations ?? "");
  const [finalDecision, setFinalDecision] = useState(caseRow.final_decision ?? "");
  const [legal, setLegal] = useState<string[]>(caseRow.legal_basis ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (l: string) =>
    setLegal((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    const { error } = await supabase.from("disciplinary_cases").update({
      status, occurrence_date: occurrenceDate || null, description: description.trim(),
      observations: observations.trim() || null, final_decision: finalDecision.trim() || null,
      legal_basis: legal,
    }).eq("id", caseRow.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Processo atualizado.");
    onSaved();
  }

  return (
    <Card>
      <CardContent className="grid gap-4 md:grid-cols-2 pt-6">
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data da ocorrência</Label>
          <Input type="date" value={occurrenceDate} onChange={(e) => setOccurrenceDate(e.target.value)} disabled={!canEdit} />
        </div>

        <div className="md:col-span-2">
          <Label>Descrição do fato</Label>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} />
        </div>

        <div className="md:col-span-2">
          <Label className="mb-2 block">Alíneas do Art. 482 da CLT</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto rounded border p-3">
            {ART_482.map(([letra, texto]) => (
              <label key={letra} className="flex items-start gap-2 text-sm">
                <Checkbox checked={legal.includes(letra)} onCheckedChange={() => toggle(letra)} disabled={!canEdit} />
                <span><strong>{letra.toUpperCase()})</strong> {texto}.</span>
              </label>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <Label>Decisão final</Label>
          <Textarea rows={2} value={finalDecision} onChange={(e) => setFinalDecision(e.target.value)} disabled={!canEdit} />
        </div>

        <div className="md:col-span-2">
          <Label>Observações</Label>
          <Textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} disabled={!canEdit} />
        </div>

        <div className="md:col-span-2 flex justify-end">
          <Button onClick={save} disabled={!canEdit || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidencesTab({
  caseId, list, loading, userId, canWrite, onChanged,
}: {
  caseId: string; list: Evidence[]; loading: boolean; userId?: string; canWrite: boolean; onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [descricao, setDescricao] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!userId) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${caseId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("disciplinary-evidences").upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error: insErr } = await supabase.from("disciplinary_case_evidences").insert({
      case_id: caseId, file_path: path, file_name: file.name,
      mime_type: file.type || "application/octet-stream", size_bytes: file.size,
      descricao: descricao.trim() || null, uploaded_by: userId,
    });
    setUploading(false);
    if (insErr) return toast.error(insErr.message);
    toast.success("Evidência enviada.");
    setDescricao(""); if (fileRef.current) fileRef.current.value = "";
    onChanged();
  }

  async function baixar(ev: Evidence) {
    const { data, error } = await supabase.storage.from("disciplinary-evidences").createSignedUrl(ev.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function remover(ev: Evidence) {
    if (!confirm(`Remover ${ev.file_name}?`)) return;
    const { error: sErr } = await supabase.storage.from("disciplinary-evidences").remove([ev.file_path]);
    if (sErr) return toast.error(sErr.message);
    const { error } = await supabase.from("disciplinary_case_evidences").delete().eq("id", ev.id);
    if (error) return toast.error(error.message);
    toast.success("Removida.");
    onChanged();
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {canWrite && (
          <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto] items-end">
            <div>
              <Label>Arquivo</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.mp4,.mp3" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: vídeo da câmera 2" />
            </div>
            <Button disabled={uploading} onClick={() => {
              const f = fileRef.current?.files?.[0];
              if (!f) return toast.error("Selecione um arquivo.");
              void upload(f);
            }}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Enviar
            </Button>
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.file_name}</TableCell>
                  <TableCell className="text-xs">{e.mime_type}</TableCell>
                  <TableCell>{e.descricao ?? "—"}</TableCell>
                  <TableCell>{fmtDateBR(e.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => baixar(e)}><Download className="h-4 w-4" /></Button>
                    {canWrite && <Button variant="ghost" size="sm" onClick={() => remover(e)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhuma evidência.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function WitnessesTab({
  caseId, list, loading, userId, canWrite, onChanged,
}: {
  caseId: string; list: Witness[]; loading: boolean; userId?: string; canWrite: boolean; onChanged: () => void;
}) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [relato, setRelato] = useState("");

  async function add() {
    if (!userId || !nome.trim()) return toast.error("Nome é obrigatório.");
    const { error } = await supabase.from("disciplinary_case_witnesses").insert({
      case_id: caseId, nome: nome.trim(), cpf: cpf.trim() || null, cargo: cargo.trim() || null,
      telefone: telefone.trim() || null, relato: relato.trim() || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Testemunha adicionada.");
    setNome(""); setCpf(""); setCargo(""); setTelefone(""); setRelato("");
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("Remover testemunha?")) return;
    const { error } = await supabase.from("disciplinary_case_witnesses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {canWrite && (
          <div className="grid gap-2 md:grid-cols-4">
            <div><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div><Label>CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} /></div>
            <div><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} /></div>
            <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            <div className="md:col-span-4"><Label>Relato</Label><Textarea rows={2} value={relato} onChange={(e) => setRelato(e.target.value)} /></div>
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={add}><Plus className="h-4 w-4 mr-2" />Adicionar</Button>
            </div>
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Relato</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{w.nome}</TableCell>
                  <TableCell>{w.cpf ?? "—"}</TableCell>
                  <TableCell>{w.cargo ?? "—"}</TableCell>
                  <TableCell>{w.telefone ?? "—"}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{w.relato ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && <Button variant="ghost" size="sm" onClick={() => remove(w.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && list.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma testemunha.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTab({ list, loading }: { list: HistWarning[]; loading: boolean }) {
  const ACTION_LABEL: Record<HistWarning["action_type"], string> = {
    orientacao_verbal: "Orientação Verbal",
    advertencia_escrita: "Advertência Escrita",
    suspensao: "Suspensão",
    justa_causa: "Justa Causa",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <ol className="relative border-l ml-4 space-y-4">
          {list.map((h) => (
            <li key={h.id} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
              <div className="flex items-center gap-2">
                <span className="font-medium">{fmtDateBR(h.warning_date)}</span>
                <Badge variant={h.action_type === "justa_causa" ? "destructive" : h.action_type === "suspensao" ? "secondary" : "outline"}>
                  {ACTION_LABEL[h.action_type]}{h.action_type === "suspensao" && h.suspension_days ? ` · ${h.suspension_days}d` : ""}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{h.conduct_description}</p>
            </li>
          ))}
          {!loading && list.length === 0 && (
            <p className="text-muted-foreground text-sm">Sem registros disciplinares anteriores.</p>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}

function ApprovalsTab({
  caseRow, list, userId, isAdmin, isGestorOp, isSupervisor, onChanged,
}: {
  caseRow: CaseRow; list: Approval[]; userId?: string;
  isAdmin: boolean; isGestorOp: boolean; isSupervisor: boolean; onChanged: () => void;
}) {
  const byStep: Partial<Record<Step, Approval>> = {};
  for (const a of list) byStep[a.step] = a;

  async function decide(step: Step, decision: "aprovado" | "rejeitado", observacao: string) {
    if (!userId) return;
    const { error } = await supabase.from("disciplinary_case_approvals").insert({
      case_id: caseRow.id, step, approved_by: userId, decision, observacao: observacao.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Decisão registrada.");
    onChanged();
  }

  const can = {
    supervisor: isAdmin || isGestorOp || isSupervisor,
    rh: isAdmin || isGestorOp,
    diretoria: isAdmin,
  };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(["supervisor", "rh", "diretoria"] as Step[]).map((step) => (
        <ApprovalCard
          key={step} step={step} approval={byStep[step]}
          canDecide={can[step] && !byStep[step]}
          onDecide={(dec, obs) => decide(step, dec, obs)}
        />
      ))}
    </div>
  );
}

function ApprovalCard({
  step, approval, canDecide, onDecide,
}: { step: Step; approval?: Approval; canDecide: boolean; onDecide: (d: "aprovado" | "rejeitado", obs: string) => void }) {
  const title = step === "supervisor" ? "Supervisor" : step === "rh" ? "RH" : "Diretoria";
  const [obs, setObs] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {approval && (
          <CardDescription>
            {approval.decision === "aprovado"
              ? <span className="text-green-600 inline-flex items-center"><CheckCircle2 className="h-4 w-4 mr-1" />Aprovado</span>
              : <span className="text-destructive inline-flex items-center"><XCircle className="h-4 w-4 mr-1" />Rejeitado</span>}
            {" "}em {fmtDateBR(approval.created_at)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {approval?.observacao && <p className="text-sm text-muted-foreground">{approval.observacao}</p>}
        {!approval && canDecide && (
          <>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => onDecide("rejeitado", obs)}>Rejeitar</Button>
              <Button size="sm" onClick={() => onDecide("aprovado", obs)}>Aprovar</Button>
            </div>
          </>
        )}
        {!approval && !canDecide && <p className="text-xs text-muted-foreground">Aguardando responsável.</p>}
      </CardContent>
    </Card>
  );
}

function JustaCausaTab({
  caseRow, empresa, colab, witnesses, evidences, checklist, canJC, onGenerated,
}: {
  caseRow: CaseRow; empresa: Empresa | null; colab: Colab | null;
  witnesses: Witness[]; evidences: Evidence[];
  checklist: { fato: boolean; evid: boolean; test: boolean; hist: boolean; rh: boolean; diretoria: boolean; supervisor: boolean; alineas: boolean };
  canJC: boolean; onGenerated: () => void;
}) {
  const { user } = useAuth();
  const [city, setCity] = useState("Londrina");
  const [date, setDate] = useState(todayISO());
  const [customBody, setCustomBody] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const evidenceTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of evidences) {
      if (e.mime_type.startsWith("video/")) set.add("Vídeo");
      else if (e.mime_type.startsWith("audio/")) set.add("Áudio");
      else if (e.mime_type.startsWith("image/")) set.add("Foto");
      else if (e.mime_type.includes("pdf")) set.add("Documento PDF");
      else set.add("Documento");
    }
    return [...set];
  }, [evidences]);

  const data = useMemo(() => ({
    city, date: fmtDateBR(date),
    employeeName: colab?.nome ?? "",
    employeeCpf: colab?.cpf ?? "",
    description: caseRow.description,
    cltSubsections: caseRow.legal_basis,
    empresaRazaoSocial: empresa?.razao_social ?? empresa?.nome ?? "",
    empresaCnpj: empresa?.cnpj ?? "",
    evidenceTypes,
    witness1: witnesses[0] ? { nome: witnesses[0].nome, cpf: witnesses[0].cpf ?? "" } : undefined,
    witness2: witnesses[1] ? { nome: witnesses[1].nome, cpf: witnesses[1].cpf ?? "" } : undefined,
    customBody: customBody.trim() || undefined,
  }), [city, date, caseRow, empresa, colab, witnesses, evidenceTypes, customBody]);

  const suggested = useMemo(() => buildBaseBody({ ...data, customBody: undefined }), [data]);

  async function generate() {
    if (!user) return;
    if (!canJC) return toast.error("Checklist incompleto.");
    setGenerating(true);
    const filename = `justa-causa-${(colab?.nome ?? "").replace(/\s+/g, "_")}-${date}.pdf`;

    // Registra a Justa Causa no histórico unificado
    const { data: warn, error: warnErr } = await supabase.from("disciplinary_warnings").insert({
      empresa_id: caseRow.company_id,
      colaborador_id: caseRow.employee_id,
      warning_date: date,
      city,
      employee_name: colab?.nome ?? "",
      employee_cpf: colab?.cpf ?? null,
      empresa_razao_social: empresa?.razao_social ?? empresa?.nome ?? "",
      empresa_cnpj: empresa?.cnpj ?? null,
      conduct_description: caseRow.description,
      clt_article: "482",
      clt_subsections: caseRow.legal_basis,
      created_by: user.id,
      action_type: "justa_causa",
      observacoes: customBody.trim() || null,
    }).select("id").single();
    if (warnErr) { setGenerating(false); return toast.error(warnErr.message); }

    await supabase.from("disciplinary_cases")
      .update({ status: "convertido_justa_causa", warning_id: warn!.id })
      .eq("id", caseRow.id);

    await gerarJustaCausaPdf(data, filename);
    setGenerating(false);
    toast.success("Justa Causa emitida e registrada.");
    onGenerated();
  }

  const itens = [
    { ok: checklist.fato, label: "Fato registrado" },
    { ok: checklist.alineas, label: "Alíneas do Art. 482 selecionadas" },
    { ok: checklist.evid, label: "Evidências anexadas" },
    { ok: checklist.test, label: "Testemunhas registradas" },
    { ok: checklist.hist, label: "Histórico disciplinar consultado" },
    { ok: checklist.rh, label: "RH aprovou" },
    { ok: checklist.diretoria, label: "Diretoria aprovou" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Checklist obrigatório</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {itens.map((i) => (
            <div key={i.label} className="flex items-center gap-2 text-sm">
              {i.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
              <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
            </div>
          ))}
          {caseRow.status === "convertido_justa_causa" && (
            <Alert className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Já emitida</AlertTitle>
              <AlertDescription>Este processo já foi convertido em Justa Causa.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Emissão da Justa Causa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div><Label>Cidade</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label>Texto do comunicado</Label>
            <Textarea
              rows={10}
              value={customBody || suggested}
              onChange={(e) => setCustomBody(e.target.value)}
              placeholder="Edite o texto se necessário"
            />
            <p className="text-xs text-muted-foreground mt-1">Deixe em branco/sem edição para usar o texto padrão.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-2" />Pré-visualizar
            </Button>
            <Button disabled={!canJC || generating} onClick={generate}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gavel className="h-4 w-4 mr-2" />}
              Gerar Justa Causa
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Pré-visualização</DialogTitle></DialogHeader>
          <pre className="whitespace-pre-wrap text-sm">{data.customBody ?? suggested}</pre>
          <DialogFooter>
            <Button onClick={async () => {
              await gerarJustaCausaPdf(data, "preview-justa-causa.pdf", { autoPrint: false });
            }}>
              <Download className="h-4 w-4 mr-2" />Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
