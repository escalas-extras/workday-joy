import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { Filter, X } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SITUACAO_SERVICO_OPTS, STATUS_LABEL, SIT_FIN_LABEL } from "@/components/extras-helpers";

export type ExtrasFilterState = {
  empresa_id?: string;
  cliente_id?: string;
  colaborador_id?: string;
  matricula?: string;
  nome?: string;
  funcao_id?: string;
  emitente_id?: string;
  situacao_servico?: string;
  status?: string;
  situacao_financeira?: string;
  semana_ref?: string;
  data_ini?: string;
  data_fim?: string;
};

export const EMPTY_FILTERS: ExtrasFilterState = {};

export function hasAnyFilter(f: ExtrasFilterState): boolean {
  return Object.values(f).some((v) => v != null && v !== "");
}

/** Server-side filters applied to a Supabase query. */
export function applyServerFilters<T>(q: T, f: ExtrasFilterState): T {
  let qq: any = q;
  if (f.empresa_id) qq = qq.eq("empresa_id", f.empresa_id);
  if (f.cliente_id) qq = qq.eq("cliente_id", f.cliente_id);
  if (f.colaborador_id) qq = qq.eq("colaborador_id", f.colaborador_id);
  if (f.funcao_id) qq = qq.eq("funcao_id", f.funcao_id);
  if (f.emitente_id) qq = qq.eq("emitente_id", f.emitente_id);
  if (f.situacao_servico) qq = qq.eq("situacao_servico", f.situacao_servico);
  if (f.status) qq = qq.eq("status", f.status);
  if (f.situacao_financeira) qq = qq.eq("situacao_financeira", f.situacao_financeira);
  if (f.semana_ref) qq = qq.eq("semana_ref", f.semana_ref);
  if (f.data_ini) qq = qq.gte("data", f.data_ini);
  if (f.data_fim) qq = qq.lte("data", f.data_fim);
  return qq;
}

/** Client-side text filters (matricula/nome partial) on already-fetched rows. */
export function applyClientFilters<R extends { colaboradores?: { nome?: string | null; matricula?: string | null } | null }>(
  rows: R[],
  f: ExtrasFilterState,
): R[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return rows.filter((r) => {
    if (f.matricula) {
      const m = (r.colaboradores?.matricula ?? "").toLowerCase();
      if (!m.includes(f.matricula.toLowerCase())) return false;
    }
    if (f.nome) {
      const n = norm(r.colaboradores?.nome ?? "");
      if (!n.includes(norm(f.nome))) return false;
    }
    return true;
  });
}

interface Props {
  value: ExtrasFilterState;
  onChange: (next: ExtrasFilterState) => void;
  /** Show situacao_financeira filter (relevant in financeiro screen). */
  showSitFin?: boolean;
}

export function ExtrasFilters({ value, onChange, showSitFin }: Props) {
  const [open, setOpen] = useState(true);

  const empresas = useQuery({
    queryKey: ["filters", "empresas"],
    queryFn: async () => (await supabase.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia")).data ?? [],
  });
  const clientes = useQuery({
    queryKey: ["filters", "clientes"],
    queryFn: async () => (await supabase.from("clientes").select("id,nome_fantasia").order("nome_fantasia")).data ?? [],
  });
  const colaboradores = useQuery({
    queryKey: ["filters", "colaboradores"],
    queryFn: async () => (await supabase.from("colaboradores").select("id,nome,matricula").order("nome")).data ?? [],
  });
  const funcoes = useQuery({
    queryKey: ["filters", "funcoes"],
    queryFn: async () => (await supabase.from("funcoes").select("id,nome").order("nome")).data ?? [],
  });
  const emitentes = useQuery({
    queryKey: ["filters", "profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,nome").order("nome")).data ?? [],
  });

  const set = (patch: Partial<ExtrasFilterState>) => onChange({ ...value, ...patch });
  const limpar = () => onChange({});
  const ativos = hasAnyFilter(value);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-card mb-3">
      <div className="flex items-center justify-between px-3 py-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros {ativos && <span className="text-xs rounded bg-primary/15 text-primary px-1.5 py-0.5">ativos</span>}
          </Button>
        </CollapsibleTrigger>
        {ativos && (
          <Button variant="ghost" size="sm" onClick={limpar} className="gap-1 text-muted-foreground">
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="grid gap-3 p-3 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Empresa">
            <SearchableSelect
              allowClear
              value={value.empresa_id ?? ""}
              onChange={(v) => set({ empresa_id: v || undefined })}
              options={(empresas.data ?? []).map((e: any) => ({ value: e.id, label: e.nome_fantasia ?? e.razao_social, keywords: e.razao_social }))}
              placeholder="Todas"
            />
          </Field>
          <Field label="Cliente">
            <SearchableSelect
              allowClear
              value={value.cliente_id ?? ""}
              onChange={(v) => set({ cliente_id: v || undefined })}
              options={(clientes.data ?? []).map((c: any) => ({ value: c.id, label: c.nome_fantasia }))}
              placeholder="Todos"
            />
          </Field>
          <Field label="Colaborador">
            <SearchableSelect
              allowClear
              value={value.colaborador_id ?? ""}
              onChange={(v) => set({ colaborador_id: v || undefined })}
              options={(colaboradores.data ?? []).map((c: any) => ({ value: c.id, label: `${c.matricula} — ${c.nome}`, keywords: c.matricula }))}
              placeholder="Todos"
            />
          </Field>
          <Field label="Matrícula (contém)">
            <Input value={value.matricula ?? ""} onChange={(e) => set({ matricula: e.target.value || undefined })} placeholder="ex: 0111" />
          </Field>
          <Field label="Nome (contém)">
            <Input value={value.nome ?? ""} onChange={(e) => set({ nome: e.target.value || undefined })} placeholder="ex: reinaldo" />
          </Field>
          <Field label="Função">
            <SearchableSelect
              allowClear
              value={value.funcao_id ?? ""}
              onChange={(v) => set({ funcao_id: v || undefined })}
              options={(funcoes.data ?? []).map((f: any) => ({ value: f.id, label: f.nome }))}
              placeholder="Todas"
            />
          </Field>
          <Field label="Emitente">
            <SearchableSelect
              allowClear
              value={value.emitente_id ?? ""}
              onChange={(v) => set({ emitente_id: v || undefined })}
              options={(emitentes.data ?? []).map((p: any) => ({ value: p.id, label: p.nome ?? "—" }))}
              placeholder="Todos"
            />
          </Field>
          <Field label="Situação do Serviço">
            <Select value={value.situacao_servico ?? "__all"} onValueChange={(v) => set({ situacao_servico: v === "__all" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas</SelectItem>
                {SITUACAO_SERVICO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={value.status ?? "__all"} onValueChange={(v) => set({ status: v === "__all" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {showSitFin && (
            <Field label="Situação Financeira">
              <Select value={value.situacao_financeira ?? "__all"} onValueChange={(v) => set({ situacao_financeira: v === "__all" ? undefined : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {Object.entries(SIT_FIN_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Semana de Referência (sexta)">
            <Input type="date" value={value.semana_ref ?? ""} onChange={(e) => set({ semana_ref: e.target.value || undefined })} />
          </Field>
          <Field label="Data Inicial">
            <Input type="date" value={value.data_ini ?? ""} onChange={(e) => set({ data_ini: e.target.value || undefined })} />
          </Field>
          <Field label="Data Final">
            <Input type="date" value={value.data_fim ?? ""} onChange={(e) => set({ data_fim: e.target.value || undefined })} />
          </Field>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
