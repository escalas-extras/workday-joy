import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  previewImportacaoLotacao,
  executarImportacaoLotacao,
  type LinhaLotacao,
  type LinhaProcessada,
  type PreviewResult,
} from "@/lib/lotacao.functions";

export const Route = createFileRoute("/_authenticated/admin/importar-lotacao")({ component: Page });

const ALIASES: Record<string, keyof LinhaLotacao> = {
  empresa: "empresa",
  cliente: "cliente",
  colaborador: "colaborador",
  nome: "colaborador",
  "nome colaborador": "colaborador",
  matricula: "matricula",
  matrícula: "matricula",
  cpf: "cpf",
  cargo: "cargo",
  funcao: "cargo",
  função: "cargo",
};

const norm = (s: string) =>
  s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function parsearArquivo(file: File): Promise<{ linhas: LinhaLotacao[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
        const linhas: LinhaLotacao[] = raw.map((row, i) => {
          const out: any = { linha: i + 2, empresa: "", cliente: "", colaborador: "", matricula: "", cpf: "", cargo: "" };
          for (const k of Object.keys(row)) {
            const key = ALIASES[norm(k)];
            if (key) out[key] = String(row[k] ?? "");
          }
          return out;
        });
        resolve({ linhas });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function Page() {
  const { isAdmin } = useAuth();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhasArquivo, setLinhasArquivo] = useState<LinhaLotacao[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [filtro, setFiltro] = useState<string>("todas");

  const prevMut = useMutation({
    mutationFn: (linhas: LinhaLotacao[]) => previewImportacaoLotacao({ data: { linhas } }),
    onSuccess: (data) => {
      setPreview(data);
      setResultado(null);
      toast.success(`Pré-visualização: ${data.resumo.total} linhas`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no preview"),
  });
  const execMut = useMutation({
    mutationFn: () =>
      executarImportacaoLotacao({ data: { linhas: linhasArquivo, arquivo_nome: arquivo?.name } }),
    onSuccess: (res) => {
      setResultado(res);
      toast.success(`Importação concluída: ${res.criadas} criados, ${res.atualizadas} atualizados, ${res.erros} erros`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha na importação"),
  });

  if (!isAdmin) return <p className="text-sm text-destructive">Apenas administradores.</p>;

  const handleFile = async (f: File | null) => {
    setArquivo(f);
    setPreview(null);
    setResultado(null);
    setLinhasArquivo([]);
    if (!f) return;
    try {
      const { linhas } = await parsearArquivo(f);
      if (!linhas.length) { toast.error("Planilha vazia"); return; }
      setLinhasArquivo(linhas);
      prevMut.mutate(linhas);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler planilha");
    }
  };

  const linhasFiltradas = (preview?.linhas ?? []).filter((l) => {
    if (filtro === "todas") return true;
    return l.acao === filtro;
  });

  const badgeAcao = (l: LinhaProcessada) => {
    const map: Record<string, { v: any; label: string }> = {
      criar: { v: "default", label: "Novo" },
      atualizar: { v: "secondary", label: "Atualizar" },
      ignorar: { v: "outline", label: "Sem alteração" },
      erro: { v: "destructive", label: "Erro" },
    };
    const c = map[l.acao];
    return <Badge variant={c.v}>{c.label}</Badge>;
  };

  return (
    <div>
      <PageHeader
        title="Importar Lotação"
        description="Planilha Excel com Empresa, Cliente, Colaborador, Matrícula, CPF, Cargo"
      />

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">1. Arquivo</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Planilha (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>
          {arquivo && <span className="text-sm text-muted-foreground">{arquivo.name} • {linhasArquivo.length} linhas</span>}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">2. Pré-visualização</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4 text-sm">
                <Stat label="Total" v={preview.resumo.total} />
                <Stat label="Novos" v={preview.resumo.criar} color="text-emerald-600" />
                <Stat label="Atualizar" v={preview.resumo.atualizar} color="text-blue-600" />
                <Stat label="Ignorar" v={preview.resumo.ignorar} />
                <Stat label="Erros" v={preview.resumo.erros} color="text-destructive" />
                <Stat label="Empresas novas" v={preview.resumo.empresas_novas} />
                <Stat label="Clientes novos" v={preview.resumo.clientes_novos} />
                <Stat label="Funções novas" v={preview.resumo.funcoes_novas} />
              </div>
              <div className="flex flex-wrap items-end gap-2 mb-3">
                <div>
                  <Label>Filtro</Label>
                  <Select value={filtro} onValueChange={setFiltro}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="criar">Apenas novos</SelectItem>
                      <SelectItem value="atualizar">Apenas atualizar</SelectItem>
                      <SelectItem value="ignorar">Sem alteração</SelectItem>
                      <SelectItem value="erro">Apenas erros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => execMut.mutate()}
                  disabled={execMut.isPending || preview.resumo.total - preview.resumo.erros === 0}
                  className="ml-auto"
                >
                  {execMut.isPending ? "Importando..." : `Importar ${preview.resumo.total - preview.resumo.erros} linhas válidas`}
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Observação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasFiltradas.map((l) => (
                      <TableRow key={l.linha}>
                        <TableCell className="text-xs">{l.linha}</TableCell>
                        <TableCell>{badgeAcao(l)}</TableCell>
                        <TableCell className="text-xs">{l.empresa}{l.empresa_nova && <Badge variant="outline" className="ml-1 text-[10px]">novo</Badge>}</TableCell>
                        <TableCell className="text-xs">{l.cliente}{l.cliente_novo && <Badge variant="outline" className="ml-1 text-[10px]">novo</Badge>}</TableCell>
                        <TableCell className="text-xs font-mono">{l.matricula}</TableCell>
                        <TableCell className="text-xs">{l.colaborador}</TableCell>
                        <TableCell className="text-xs font-mono">{l.cpf}</TableCell>
                        <TableCell className="text-xs">{l.cargo}{l.funcao_nova && <Badge variant="outline" className="ml-1 text-[10px]">novo</Badge>}</TableCell>
                        <TableCell className="text-xs text-destructive">{l.motivo ?? ""}</TableCell>
                      </TableRow>
                    ))}
                    {linhasFiltradas.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sem linhas</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {resultado && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Resultado</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-4">
              <Stat label="Criados" v={resultado.criadas} color="text-emerald-600" />
              <Stat label="Atualizados" v={resultado.atualizadas} color="text-blue-600" />
              <Stat label="Ignorados" v={resultado.ignoradas} />
              <Stat label="Erros" v={resultado.erros} color="text-destructive" />
            </div>
            {resultado.erros_detalhe?.length > 0 && (
              <div className="rounded-md border max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Matrícula</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {resultado.erros_detalhe.map((e: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{e.linha}</TableCell>
                        <TableCell className="text-xs font-mono">{e.matricula}</TableCell>
                        <TableCell className="text-xs text-destructive">{e.motivo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, v, color }: { label: string; v: number; color?: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color ?? ""}`}>{v}</p>
    </div>
  );
}
