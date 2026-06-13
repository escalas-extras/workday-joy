# Importação de Planilha de Lotação

Nova tela `Admin → Importar Lotação` que recebe um Excel (.xlsx) com as colunas **Empresa, Cliente, Colaborador, Matrícula, CPF, Cargo**, mostra pré-visualização e relatório de inconsistências, e só executa após confirmação. Acesso restrito a `admin`.

## Ajustes de schema (migração)

A planilha não traz CNPJ do cliente nem CPF do colaborador, e hoje não existe vínculo colaborador↔cliente. Migração:

1. `colaboradores.cpf TEXT` (nullable, UNIQUE quando preenchido — `CREATE UNIQUE INDEX ... WHERE cpf IS NOT NULL`).
2. `clientes.cnpj` → tornar **NULLABLE** (mantendo unique parcial quando preenchido). Hoje é `NOT NULL UNIQUE`, o que impede criar cliente só pelo nome.
3. Nova tabela `colaborador_clientes (id, colaborador_id, cliente_id, situacao, created_at, updated_at)` com unique `(colaborador_id, cliente_id)`, RLS (select autenticado, ins/upd/del admin), GRANTs e trigger de `updated_at`.
4. Nova tabela `importacoes_lotacao (id, usuario_id, arquivo_nome, total_linhas, criadas, atualizadas, ignoradas, erros, resumo jsonb, created_at)` para auditoria das execuções.

## Fluxo na UI

`src/routes/_authenticated/admin.importar-lotacao.tsx`:

1. Upload do arquivo (sheetjs `XLSX.read` no cliente) → normaliza cabeçalhos (case/acentos) e gera array tipado.
2. Chama `previewImportacaoLotacao` (server fn) que retorna, **sem gravar**:
   - linhas válidas
   - linhas com erro (matrícula vazia, nome vazio, empresa/cliente/cargo vazios, matrícula duplicada na planilha, conflito de CPF com outro colaborador, etc.)
   - resumo: quantas empresas/clientes/funções/colaboradores serão **criados** vs **atualizados** vs **vínculos** novos
3. Tabela de pré-visualização com filtros (todas / só erros / só novos / só atualizados) e badges por status.
4. Botão **Importar** → `executarImportacaoLotacao` (server fn) processa em transação lógica e devolve o relatório final; grava 1 linha em `importacoes_lotacao`.

## Server functions (`src/lib/lotacao.functions.ts`)

Ambas com `requireSupabaseAuth` + checagem `has_role(admin)`. Lógica:

- Normalização: `trim`, colapsar espaços, uppercase para chaves de comparação (`norm()`).
- Para cada linha:
  - **Empresa**: busca por nome (case-insensitive). Cria se não existir.
  - **Função (cargo)**: idem.
  - **Cliente**: busca por `nome_fantasia` (case-insensitive). Cria com `razao_social = nome` e `cnpj = NULL` se não existir.
  - **Colaborador**: upsert por `matricula`. Se existir, atualiza `nome`, `empresa_id`, `funcao_id`, `cpf` (quando vier). Se CPF informado e já pertencer a outra matrícula → erro na linha.
  - **Vínculo colaborador↔cliente**: insere em `colaborador_clientes` se ainda não existir.
- Executa criações em lotes (`upsert`/`insert ... on conflict do nothing`) usando `supabaseAdmin` (carregado dentro do handler).
- Retorna contadores + linhas com erro.

## Detalhes técnicos

- Parsing Excel no browser via `xlsx` (já instalado — usado nos relatórios).
- Importação roda no servidor (server fn) com `supabaseAdmin` para contornar triggers/RLS de inserção em massa.
- Auditoria: além do `importacoes_lotacao`, registra entrada manual em `auditoria` (`tabela='importacoes_lotacao'`, `acao='INSERT'`) com `usuario_id` e resumo JSON na `justificativa`.
- Item de menu **"Importar Lotação"** no `app-shell.tsx` dentro do grupo Administração, visível só para `admin`.
- Rota `_authenticated/admin.importar-lotacao.tsx` (o gate `_authenticated` cobre auth; o componente checa `roles.includes('admin')` e exibe `403` caso contrário).

## Arquivos a criar/editar

- **Migração** (nova): colunas/tabelas acima
- `src/lib/lotacao.functions.ts` (novo)
- `src/routes/_authenticated/admin.importar-lotacao.tsx` (novo)
- `src/components/app-shell.tsx` (link no menu)

Aprova para eu seguir?
