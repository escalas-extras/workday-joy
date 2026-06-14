# Fase Final — Plano de Implementação

Escopo amplo dividido em 3 partes. Antes de codificar, alinhar premissas e dependências.

---

## PARTE 1 — Evidências Visuais no Dossiê

**Alterar apenas** `src/lib/dossie.functions.ts` e `src/lib/dossie-pdf.ts`.

- No server function, para cada evidência com `mime_type` de imagem, gerar **signed URL** do bucket privado (`createSignedUrl`, ~5 min), baixar via fetch no servidor, converter para base64 e devolver junto do registro.
- No PDF, novo ANEXO I — EVIDÊNCIAS VISUAIS:
  - Para cada imagem: miniatura grande (largura ~400pt), descrição, local, data ocorrência, observações (decodificados via `decodeMeta`).
  - Quebra de página automática quando faltar espaço.
  - Vídeos/áudios continuam apenas listados (tabela já existente).
- Advertência/Suspensão/Justa Causa PDF: **não tocar**.

---

## PARTE 2 — Módulo Almoxarifado

### 2.1 Schema (migration única, com GRANTs)

Tabelas em `public`:

1. `almoxarifado_categorias` — `id`, `nome` (Vestuário, Calça, Calçado, Boné, Sem Tamanho), `tipo_tamanho` enum.
2. `almoxarifado_itens` — `id`, `categoria_id`, `nome` (Camisa, Coturno…), `ativo`.
3. `almoxarifado_estoque` — `id`, `empresa_id`, `item_id`, `tamanho` (text, nullable), `quantidade_atual`, `quantidade_minima`, `ativo`, `unique(empresa_id,item_id,tamanho)`.
4. `almoxarifado_movimentacoes` — `id`, `empresa_id`, `item_id`, `tamanho`, `tipo` enum (entrada/saida), `motivo` enum (compra, devolucao, ajuste, transferencia_recebida, entrega_colaborador, perda, descarte, transferencia_enviada), `quantidade`, `colaborador_id` (nullable), `observacao`, `user_id`, `created_at`.
5. `almoxarifado_entregas_colaborador` — `id`, `colaborador_id`, `empresa_id`, `item_id`, `tamanho`, `quantidade`, `quantidade_devolvida` (default 0), `data_entrega`, `responsavel_id`, `observacao`, `status` (em_uso, devolvido_total, devolvido_parcial).
6. `almoxarifado_devolucoes` — `id`, `entrega_id`, `quantidade`, `condicao` enum (novo, bom, regular, danificado, inservivel), `retorna_estoque` (bool), `data`, `responsavel_id`, `observacao`.

Seed: categorias + 19 itens padrão + tamanhos.

RLS: políticas idênticas às de `colaboradores`/`empresas` (authenticated CRUD, gestor/admin). Não alterar RLS de tabelas existentes.

### 2.2 Server functions (`src/lib/almoxarifado.functions.ts`)

- `listEstoque({empresaId?, abaixoMinimo?})`
- `upsertEstoqueItem(...)` (ajuste quantidade mínima)
- `registrarMovimentacao(...)` — atualiza estoque + grava movimentação em transação RPC.
- `entregarItem({colaboradorId, itemId, tamanho, quantidade, ...})` — baixa estoque + cria entrega + movimentação.
- `devolverItem({entregaId, quantidade, condicao, ...})` — devolve estoque se condição ≠ danificado/inservivel.
- `listEntregasColaborador(colaboradorId)`
- `listPendenciasDevolucao()`
- `listEstoqueBaixo()`
- Relatórios: `relatorioEstoque`, `relatorioMovimentacoes`, `relatorioEntregas`, `relatorioPendencias`.

### 2.3 Rotas/UI

- `src/routes/_authenticated/almoxarifado.tsx` — layout com Tabs: **Estoque**, **Movimentações**, **Entregas**, **Pendências**, **Relatórios**.
- Aba **UNIFORMES E EQUIPAMENTOS** em `colaboradores.tsx` (dialog do colaborador) — entrega + histórico + devolução.
- Item de menu novo "Almoxarifado" em `app-shell.tsx`.

### 2.4 Integração com Desligamento

- Em `processos.tsx` → `JustaCausaTab` (e fluxo de desligamento existente), buscar entregas em aberto do colaborador e exibir checklist: Devolvido / Não devolvido / Perda justificada — reutilizando `equipment-checklist.tsx` adaptado para receber lista dinâmica.

### 2.5 Relatórios PDF/Excel

`src/lib/almoxarifado-export.ts` com jsPDF/autoTable e XLSX (já no projeto).

---

## PARTE 3 — Navegação Inteligente

Tornar cards clicáveis (envolver em `<Link>` com `params`/`search`):

- **Dashboard** (`inicio.tsx`): Advertências → `/advertencias`, Suspensões → `/advertencias?tab=suspensoes`, Justas Causas → `/advertencias?tab=historico&actionType=justa_causa`, Processos → `/processos`, Relatórios → `/relatorios-disciplinares`.
- **Inteligência Disciplinar** (`inteligencia-disciplinar.tsx`):
  - Top Reincidentes → `/colaboradores?id={id}&tab=painel-disciplinar`
  - Top Motivos → `/relatorios-disciplinares?motivo={id}`
  - Top Empresas → `/relatorios-disciplinares?empresa={id}`
- **Almoxarifado dashboard**:
  - Estoque Baixo → aba Estoque com filtro `abaixoMinimo=true`
  - Pendências → aba Pendências.

Implementar via `useSearch` nas rotas alvo e aplicar filtros iniciais.

---

## Premissas / Confirmações antes de codificar

1. **Tamanho do PR**: isto é uma fase muito grande. Sugiro implementar em ordem: Parte 1 → Parte 3 → Parte 2 (almoxarifado é o maior). Posso entregar tudo em sequência num único turno, mas o resultado terá ~15 arquivos novos e ~10 modificados.
2. **Categoria "Boné — Único"**: tratado como tamanho text livre (não enum).
3. **Permissões Almoxarifado**: assumir que `admin`, `gestor_operacional` e `rh` podem movimentar estoque; supervisor apenas visualiza. Confirmar.
4. **Checklist de desligamento existente**: reutilizar `equipment-checklist.tsx` adicionando prop `items` dinâmica (atualmente é estático). Confirmar OK.
5. **Imagens no dossiê**: limite prático de ~20 imagens por dossiê (mais que isso o PDF fica > 30MB). OK fixar esse teto?

Confirmados estes 5 pontos, começo a implementar na sequência acima.
