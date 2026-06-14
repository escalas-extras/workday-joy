import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { disciplinaryGlobalSearch } from "@/lib/disciplinary-audit.functions";

export const Route = createFileRoute("/_authenticated/pesquisa-disciplinar")({ component: Page });

function Page() {
  const fn = useServerFn(disciplinaryGlobalSearch);
  const [term, setTerm] = useState("");
  const { data } = useQuery({
    queryKey: ["disc-search", term],
    queryFn: () => fn({ data: { term } }),
    enabled: term.length >= 2,
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Pesquisa Disciplinar" description="Busque por CPF, nome, processo, testemunha, empresa ou cliente" />
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
        <Input className="pl-9" placeholder="Digite ao menos 2 caracteres…" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Colaboradores <Badge variant="secondary">{data.colaboradores.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.colaboradores.map((c) => (
                <div key={c.id} className="border-b py-1"><strong>{c.nome}</strong> — CPF {c.cpf ?? "—"} — Mat. {c.matricula ?? "—"}</div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Processos <Badge variant="secondary">{data.processos.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.processos.map((p) => (
                <div key={p.id} className="border-b py-1"><strong>#{p.id.slice(0, 8)}</strong> — {p.status} — {(p.description ?? "").slice(0, 70)}</div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Testemunhas <Badge variant="secondary">{data.testemunhas.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.testemunhas.map((w) => (
                <div key={w.id} className="border-b py-1">{w.nome} — CPF {w.cpf ?? "—"}</div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Empresas <Badge variant="secondary">{data.empresas.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.empresas.map((e) => (
                <div key={e.id} className="border-b py-1">{e.nome} — CNPJ {e.cnpj ?? "—"}</div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Clientes <Badge variant="secondary">{data.clientes.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.clientes.map((c) => (<div key={c.id} className="border-b py-1">{c.nome_fantasia} — {c.razao_social}</div>))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
