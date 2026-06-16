import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, SITUACAO_SERVICO_OPTS, SITUACAO_SERVICO_LABEL, SITUACOES_REQUEREM_COBERTO, labelColaboradorCoberto, CLASSIFICACAO_COMERCIAL_OPTS, CLASSIFICACAO_COMERCIAL_LABEL, CancelarExtraDialog } from "@/components/extras-helpers";
import { SearchableSelect } from "@/components/searchable-select";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/extras")({ component: Page });

interface Extra {
  id: string; data: string; colaborador_id: string; cliente_id: string; empresa_id: string | null; funcao_id: string;
  hora_inicio: string; hora_termino: string; valor: number; motivo?: string; observacoes?: string;
  status: string; situacao_financeira: string | null; situacao_servico: string;
  emitente_id: string; semana_ref: string;
}

function Page() {
  const qc = useQueryClient();
  const { user, isAdmin, isSupervisor } = useAuth();
  const podeLancar = isAdmin || isSupervisor;

  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroSemana, setFiltroSemana] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Extra | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [vals, setVals] = useState<any>(empty());

  function empty() {
    return { data: new Date().toISOString().slice(0, 10), colaborador_id: "", cliente_id: "", funcao_id: "",
      hora_inicio: "19:00", hora_termino: "07:00", valor: "", situacao_servico: "extra_normal", classificacao_comercial: "contrato", motivo: "", observacoes: "", colaborador_coberto_id: "",
      avulso: false, avulso_nome: "", avulso_cpf: "" };
  }

  const colabs = useQuery({ enabled: !!user, queryKey: ["colaboradores", user?.id], queryFn: async () => { const { data, error } = await supabase.from("colaboradores").select("*").eq("situacao", "ativo").order("nome"); if (error) throw error; return data ?? []; } });
  const clientes = useQuery({ enabled: !!user, queryKey: ["clientes", user?.id], queryFn: async () => { const { data, error } = await supabase.from("clientes").select("*").eq("situacao", "ativo").order("nome_fantasia"); if (error) throw error; return data ?? []; } });
  const funcoes = useQuery({ enabled: !!user, queryKey: ["funcoes", user?.id], queryFn: async () => { const { data, error } = await supabase.from("funcoes").select("*").eq("situacao", "ativo").order("nome"); if (error) throw error; return data ?? []; } });

  const extras = useQuery({
    queryKey: ["extras", filtroStatus, filtroSemana],
    queryFn: async () => {
      const q = supabase.from("extras").select("*, colaboradores!colaborador_id(nome,matricula), coberto:colaboradores!colaborador_coberto_id(nome,matricula), clientes(nome_fantasia), empresas(nome), funcoes(nome)").order("data", { ascending: false });
      if (filtroStatus !== "todos") q.eq("status", filtroStatus as any);
      if (filtroSemana) q.eq("semana_ref", filtroSemana);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });


  const save = useMutation({
    mutationFn: async () => {
      const requerCoberto = SITUACOES_REQUEREM_COBERTO.has(vals.situacao_servico);
      if (requerCoberto && !vals.colaborador_coberto_id) {
        throw new Error("Selecione o colaborador coberto");
      }

      let colaboradorId = vals.colaborador_id;

      // Cria colaborador avulso na hora
      if (!editing && vals.avulso) {
        const nome = (vals.avulso_nome || "").trim();
        if (!nome) throw new Error("Informe o nome do colaborador avulso");
        if (!vals.funcao_id) throw new Error("Selecione a função antes de criar o avulso");
        const { data: emp, error: empErr } = await supabase.from("empresas").select("id").eq("nome", "AVULSO").maybeSingle();
        if (empErr) throw empErr;
        if (!emp) throw new Error("Empresa AVULSO não encontrada");
        const matricula = `AVU-${Date.now()}`;
        const { data: novo, error: cErr } = await supabase.from("colaboradores").insert({
          nome: nome.toUpperCase(),
          matricula,
          empresa_id: emp.id,
          funcao_id: vals.funcao_id,
          cpf: vals.avulso_cpf ? vals.avulso_cpf.replace(/\D/g, "") : null,
          situacao: "ativo",
        }).select("id").single();
        if (cErr) throw cErr;
        colaboradorId = novo.id;
      }

      if (!colaboradorId) throw new Error("Selecione um colaborador");

      const { avulso, avulso_nome, avulso_cpf, ...rest } = vals;
      const payload: any = {
        ...rest,
        colaborador_id: colaboradorId,
        valor: parseFloat(vals.valor),
        semana_ref: vals.data, // será sobrescrito pelo trigger
        emitente_id: user!.id,
        colaborador_coberto_id: requerCoberto ? vals.colaborador_coberto_id : null,
      };

      if (editing) {
        const { error } = await supabase.from("extras").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("extras").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Salvo"); setOpen(false); setEditing(null); setVals(empty()); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setVals(empty()); setOpen(true); };
  const openEdit = (e: any) => {
    setEditing(e);
    const { colaboradores, coberto, clientes, empresas, funcoes, ...rest } = e;
    setVals({ ...rest, valor: String(e.valor), colaborador_coberto_id: e.colaborador_coberto_id ?? "" });
    setOpen(true);
  };

  const podeEditar = (e: any) => isAdmin || (isSupervisor && e.emitente_id === user?.id && e.status === "pendente");

  return (
    <div>
      <PageHeader title="Extras" description="Lançamentos de horas extras" actions={
        podeLancar && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Novo Extra</Button>
      } />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado_operacional">Aprov. Operacional</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
            <SelectItem value="aprovado_financeiro">Aprov. Financeiro</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" placeholder="Semana ref" value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)} className="w-48" />
        {filtroSemana && <Button variant="outline" size="sm" onClick={() => setFiltroSemana("")}>Limpar</Button>}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Colaborador</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Class.</TableHead>
              <TableHead>Horário</TableHead><TableHead>Valor</TableHead><TableHead>Situação Serv.</TableHead>
              <TableHead>Status / Situação</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(extras.data ?? []).map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{e.data}</TableCell>
                <TableCell>{e.colaboradores?.nome}<div className="text-xs text-muted-foreground">{e.colaboradores?.matricula}</div></TableCell>
                <TableCell>{e.clientes?.nome_fantasia}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded ${e.classificacao_comercial === 'a_cobrar' ? 'bg-purple-500/15 text-purple-700' : 'bg-slate-500/15 text-slate-700'}`}>{CLASSIFICACAO_COMERCIAL_LABEL[e.classificacao_comercial]}</span></TableCell>
                <TableCell className="whitespace-nowrap">{e.hora_inicio} → {e.hora_termino}</TableCell>
                <TableCell>R$ {Number(e.valor).toFixed(2)}</TableCell>
                <TableCell>
                  <div>{SITUACAO_SERVICO_LABEL[e.situacao_servico] ?? e.situacao_servico}</div>
                  {e.coberto && <div className="text-xs text-muted-foreground">Cobre: {e.coberto.nome}</div>}
                </TableCell>
                <TableCell><StatusBadge status={e.status} sit={e.situacao_financeira} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {podeEditar(e) && <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>}
                    {isAdmin && e.situacao_financeira !== "cancelado" && (
                      <Button size="icon" variant="ghost" onClick={() => setCancelarId(e.id)}><Ban className="h-3 w-3" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(extras.data ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum extra</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Extra</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={vals.data} onChange={(e) => setVals({ ...vals, data: e.target.value })} required /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Colaborador</Label>
                {!editing && (
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <Checkbox checked={!!vals.avulso} onCheckedChange={(c) => setVals({ ...vals, avulso: !!c, colaborador_id: "" })} />
                    Avulso (não cadastrado)
                  </label>
                )}
              </div>
              {vals.avulso ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input className="sm:col-span-2" placeholder="Nome completo *" value={vals.avulso_nome} onChange={(e) => setVals({ ...vals, avulso_nome: e.target.value })} maxLength={120} required />
                  <Input placeholder="CPF (opcional)" value={vals.avulso_cpf} onChange={(e) => setVals({ ...vals, avulso_cpf: e.target.value })} maxLength={14} />
                </div>
              ) : (
                <SearchableSelect
                  placeholder="Selecionar"
                  searchPlaceholder="Digite nome ou matrícula..."
                  options={(colabs.data ?? []).map((c: any) => ({
                    value: c.id,
                    label: `${c.matricula} - ${c.nome}`,
                    keywords: `${c.nome} ${c.matricula}`,
                  }))}
                  value={vals.colaborador_id}
                  onChange={(v) => {
                    const c: any = (colabs.data ?? []).find((x: any) => x.id === v);
                    setVals({ ...vals, colaborador_id: v, funcao_id: c?.funcao_id ?? vals.funcao_id });
                  }}
                />
              )}
            </div>
            <div>
              <Label>Cliente</Label>
              <SearchableSelect
                placeholder="Selecionar"
                searchPlaceholder="Digite o nome do cliente..."
                options={(clientes.data ?? []).map((c: any) => ({
                  value: c.id,
                  label: c.nome_fantasia,
                  keywords: `${c.nome_fantasia} ${c.razao_social ?? ""}`,
                }))}
                value={vals.cliente_id}
                onChange={(v) => setVals({ ...vals, cliente_id: v })}
              />
            </div>
            <div>
              <Label>Função</Label>
              <Select value={vals.funcao_id} onValueChange={(v) => setVals({ ...vals, funcao_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{(funcoes.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação do Serviço</Label>
              <Select value={vals.situacao_servico} onValueChange={(v) => setVals({ ...vals, situacao_servico: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SITUACAO_SERVICO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {SITUACOES_REQUEREM_COBERTO.has(vals.situacao_servico) && (
              <div className="md:col-span-2">
                <Label>{labelColaboradorCoberto(vals.situacao_servico)}</Label>
                <SearchableSelect
                  placeholder="Pesquisar colaborador coberto"
                  searchPlaceholder="Digite nome ou matrícula..."
                  options={(colabs.data ?? []).filter((c: any) => c.id !== vals.colaborador_id).map((c: any) => ({
                    value: c.id,
                    label: `${c.matricula} - ${c.nome}`,
                    keywords: `${c.nome} ${c.matricula}`,
                  }))}
                  value={vals.colaborador_coberto_id}
                  onChange={(v) => setVals({ ...vals, colaborador_coberto_id: v })}
                />
              </div>
            )}
            <div>
              <Label>Classificação Comercial *</Label>
              <Select value={vals.classificacao_comercial} onValueChange={(v) => setVals({ ...vals, classificacao_comercial: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSIFICACAO_COMERCIAL_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Hora Início</Label><Input type="time" value={vals.hora_inicio} onChange={(e) => setVals({ ...vals, hora_inicio: e.target.value })} required /></div>
            <div><Label>Hora Término</Label><Input type="time" value={vals.hora_termino} onChange={(e) => setVals({ ...vals, hora_termino: e.target.value })} required /></div>
            <div><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0" value={vals.valor} onChange={(e) => setVals({ ...vals, valor: e.target.value })} required /></div>
            <div className="md:col-span-2"><Label>Motivo</Label><Input value={vals.motivo ?? ""} onChange={(e) => setVals({ ...vals, motivo: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={vals.observacoes ?? ""} onChange={(e) => setVals({ ...vals, observacoes: e.target.value })} /></div>
            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {cancelarId && <CancelarExtraDialog extraId={cancelarId} open={!!cancelarId} onOpenChange={(o) => !o && setCancelarId(null)} />}
    </div>
  );
}
