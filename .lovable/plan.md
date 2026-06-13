## Escopo

Transformar os recibos do banco em recibos imprimíveis (A4, 3 por página), com PDF e impressão direta, e criar três relatórios (Operacional, Financeiro, Faturamento). Tudo gerado dinamicamente a partir do banco — sem XLSX externo.

## 1. Componente `src/components/recibos/ReciboA4.tsx`

Layout A4 retrato print-ready (CSS `@media print` + classes `print:*` do Tailwind). Cada folha agrupa até 3 recibos. Cada recibo:

```
┌─────────────────────────────┬──────────────────────────────┐
│ RECIBO Nº 000123            │ DATA       CLIENTE     VALOR │
│ Valor: R$ 300,00            │ 20/03/2026 AFONSO F.  150,00 │
│ (trezentos reais)           │ 22/03/2026 AFONSO F.  150,00 │
│ Ref: EXTRAS SEM 23/MAR/2026 │ ─────────────────────────────│
│ Colaborador: Fulano         │ TOTAL                 300,00 │
│ Pagamento: 13/06/2026       │                              │
│ Londrina/PR                 │                              │
│ ____________________        │                              │
│ Assinatura                  │                              │
└─────────────────────────────┴──────────────────────────────┘
```

- Borda azul arredondada (`border-2 border-blue-600 rounded-lg`).
- Numeração: `recibos.numero` já existe.
- Valor por extenso: helper `numeroPorExtenso(valor)` em `src/lib/extenso.ts` (implementação local em pt-BR).
- Quebra de página automática: `print:break-after-page` a cada 3 recibos.

## 2. Tela `/recibos` — ações por linha

Adicionar 3 botões em cada linha da tabela:
- **Visualizar** → abre `Dialog` grande com `<ReciboA4 recibos={[r]} />`.
- **Imprimir** → abre rota `/recibos/imprimir?ids=...` em nova aba e chama `window.print()` no `useEffect`.
- **PDF** → mesma rota, mas usa `html2pdf.js` (ou `jspdf + html2canvas`) para baixar `.pdf`.

## 3. Impressão em lote

Acima da tabela de `/recibos`, adicionar barra de filtros (URL search params via `validateSearch`):
- Semana (date), Colaborador (select), Cliente (select), Empresa (select), Status (Ativo/Cancelado).
- Checkbox por linha + checkbox "selecionar todos".
- Botões: **Imprimir Selecionados** e **PDF Selecionados** → abrem `/recibos/imprimir?ids=a,b,c` agrupando 3 por página.

## 4. Rota `/recibos/imprimir`

`src/routes/_authenticated/recibos.imprimir.tsx` — carrega recibos + itens pelos IDs e renderiza `<ReciboA4 recibos={...} />`. Mode `print` (sem chrome do app-shell). Suporta `?action=pdf` para gatilho automático.

## 5. Critério de elegibilidade (já correto no backend)

`gerarRecibosSemana` já filtra `status='aprovado_financeiro' AND situacao_financeira='pago'`. Inclui Contrato e À Cobrar (não filtra `classificacao_comercial`). **Sem mudança no backend.**

## 6. Relatórios

Três novas rotas em `src/routes/_authenticated/`:

### a) `relatorios.operacional.tsx`
Filtros: período (data início/fim), cliente, empresa, colaborador, função.
Colunas: Data | Cliente | Colaborador | Função | Horário (início→fim) | Valor | Classificação (Contrato/À Cobrar).
Exporta **Excel** (`xlsx` lib) e **PDF** (`jspdf-autotable`).

### b) `relatorios.financeiro.tsx`
Filtros por período. Cards com totais: Pago / Pendente / Cancelado / Faturado, separados em duas colunas (Contrato vs À Cobrar). Tabela detalhada exportável.

### c) `relatorios.faturamento.tsx`
Mesma estrutura mas com `WHERE classificacao_comercial='a_cobrar'`. Exporta Excel + PDF.

## 7. Menu (`src/components/app-shell.tsx`)

Adicionar grupo "Relatórios" com:
- Relatório Operacional
- Relatório Financeiro
- Relatório Faturamento

Roles: `admin`, `gestor_financeiro` (faturamento e financeiro); `admin`, `gestor_operacional`, `supervisor` (operacional).

## 8. Dependências novas

- `jspdf` + `jspdf-autotable` (PDF tabular dos relatórios)
- `html2canvas` (PDF do recibo a partir do DOM)
- `xlsx` (export Excel dos relatórios) — substitui geração server-side de XLSX.

Todas funcionam no browser; nenhuma toca o servidor (compatível com Cloudflare Worker).

## 9. Arquivos novos / alterados

Novos:
- `src/components/recibos/ReciboA4.tsx`
- `src/components/recibos/print-styles.css` (ou estilos no styles.css com `@media print`)
- `src/lib/extenso.ts`
- `src/lib/recibos-export.ts` (helpers PDF/print)
- `src/lib/relatorios-export.ts` (helpers xlsx + jspdf)
- `src/routes/_authenticated/recibos.imprimir.tsx`
- `src/routes/_authenticated/relatorios.operacional.tsx`
- `src/routes/_authenticated/relatorios.financeiro.tsx`
- `src/routes/_authenticated/relatorios.faturamento.tsx`

Alterados:
- `src/routes/_authenticated/recibos.tsx` (filtros, seleção, botões Ver/Imprimir/PDF)
- `src/components/app-shell.tsx` (entradas de menu)

## Pontos de confirmação antes de eu começar

1. **Bibliotecas**: ok adicionar `jspdf`, `jspdf-autotable`, `html2canvas`, `xlsx`? (todas client-side, sem segredo)
2. **Roles do menu Relatórios**: o critério proposto acima está bom?
3. **"Valor por extenso"**: implementação simples local em pt-BR está ok (sem depender de pacote externo)?
4. **Selo "Cancelado" nos recibos impressos**: se um recibo cancelado for selecionado, imprimir mesmo assim com marca d'água "CANCELADO", ou bloquear?

Confirmado isso eu implemento tudo em sequência.
