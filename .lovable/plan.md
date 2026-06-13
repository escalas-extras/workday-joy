
# MVP — Gestão de Horas Extras (Baseline Definitiva)

Projeto novo, do zero. Toda modelagem anterior é descartada.

Stack: TanStack Start + React + TypeScript + Tailwind + shadcn/ui + Lovable Cloud (Supabase). PDF `pdf-lib` / Excel `exceljs`. Responsivo mobile-first.

> **Fase autorizada agora**: §0 (modelagem). **Suspenso até aprovação explícita**: telas React, dashboards, server functions, geração de PDF/Excel.

## 0. Entregáveis para validação (antes de qualquer código de app)

1. **ERD completo** em Mermaid (`.mmd`).
2. **SQL completo das migrations** (enums, tabelas, GRANTs, constraints, índices, triggers, funções, RLS, seeds).
3. **Enums** listados.
4. **Constraints** (PK/FK/UNIQUE/CHECK/NOT NULL).
5. **Índices**.
6. **Triggers**.
7. **Funções SQL** (`SECURITY DEFINER` quando necessário).
8. **Políticas RLS** por tabela.
9. **Matriz de permissões por perfil** (Admin, Gestor Operacional, Gestor Financeiro, Supervisor) × tabela/ação/transição.
10. **Fluxograma de Status e Situação Financeira**.

## 1. Enums

- `app_role`: `admin`, `gestor_operacional`, `gestor_financeiro`, `supervisor`
- `entity_status`: `ativo`, `inativo`
- `extra_status`: `pendente`, `aprovado_operacional`, `rejeitado`, `aprovado_financeiro`
- `situacao_financeira`: `pendente_pagamento`, `pago`, `faturado`, `cancelado`
- `forma_pagamento`: `pix`, `dinheiro`, `transferencia`, `conta_corrente`
- `situacao_servico`: `contrato`, `cobertura_ferias`, `cobertura_atestado`, `evento`, `apoio_operacional`, `outro`

## 2. Tabelas (todas em `public`, com GRANTs + RLS + triggers)

- `user_roles(user_id, role)` — UNIQUE(user_id, role).
- `profiles(id→auth.users, nome, email, ativo)`
- `empresas(id, nome, situacao)`
- `funcoes(id, nome, situacao)`
- `clientes(id, nome_fantasia, razao_social, cnpj UNIQUE, situacao, observacoes)` — **sem `empresa_id`**.
- **`cliente_empresas(id, cliente_id, empresa_id, situacao default 'ativo', created_at, updated_at)`** — UNIQUE(cliente_id, empresa_id). Relacionamento N:N obrigatório.
- `colaboradores(id, matricula, nome, empresa_id, funcao_id, situacao, codigo_ponto, ultima_sincronizacao_ponto)` — últimos dois reservados para integração futura.
- `motivos_rejeicao(id, descricao, ativo)` — seed: Horário divergente, Cliente incorreto, Valor incorreto, Extra não autorizada, Colaborador incorreto, Duplicidade, Outros.
- `extras`:
  - identificação: `id, data, colaborador_id, cliente_id, empresa_id, funcao_id, hora_inicio, hora_termino, valor, valor_faturamento NULL, motivo, situacao_servico, observacoes, emitente_id NOT NULL`
  - fluxo operacional: `status extra_status`, `semana_ref`, `fechado_em`
  - fluxo financeiro: `situacao_financeira NULL` (preenchido ao atingir `aprovado_financeiro`)
  - rejeição: `motivo_rejeicao_id, motivo_rejeicao_descricao`
  - aprovações: `aprovado_operacional_por, aprovado_operacional_em, aprovado_financeiro_por, aprovado_financeiro_em`
  - pagamento: `forma_pagamento, data_pagamento, comprovante_url, pago_por, pago_em`
  - faturamento: `faturado_por, faturado_em`
  - lote (reservado, sem tabela): `lote_pagamento_id uuid NULL`
  - cancelamento: `cancelado_em, cancelado_por, justificativa_cancelamento`
  - alteração pós-fechamento: `justificativa_alteracao`
  - base: `created_by, updated_by, created_at, updated_at`
- `fechamentos_semanais(id, semana_ref UNIQUE, status, fechado_por, fechado_em, reaberto_por, reaberto_em, motivo_reabertura, encerrado_financeiro bool default false, encerrado_financeiro_por, encerrado_financeiro_em)`
- `recibos(id, numero SERIAL UNIQUE, colaborador_id, semana_ref, gerado_por, gerado_em, data_pagamento, valor_total numeric NOT NULL, assinatura_url, ativo bool default true, cancelado_em, cancelado_por, motivo_cancelamento)` — `valor_total` congelado na geração; índice único parcial `(colaborador_id, semana_ref) WHERE ativo`.
- `recibos_itens(recibo_id, extra_id, valor_snapshot numeric)` — `valor_snapshot` congelado.
- `auditoria(id, tabela, registro_id, usuario_id, acao, campo, valor_anterior, valor_novo, justificativa, criado_em)`

## 3. Constraints

- FKs com `ON DELETE RESTRICT`.
- CHECKs: `valor >= 0`, `valor_faturamento IS NULL OR valor_faturamento >= 0`, `hora_inicio <> hora_termino`.
- UNIQUE: `clientes.cnpj`, `cliente_empresas(cliente_id, empresa_id)`, `recibos.numero`, parcial `recibos(colaborador_id, semana_ref) WHERE ativo`, `user_roles(user_id, role)`.
- NOT NULL: `extras.emitente_id`, `recibos.valor_total`.

## 4. Índices

- `extras`: `(status)`, `(situacao_financeira)`, `(semana_ref)`, `(colaborador_id)`, `(cliente_id)`, `(empresa_id)`, `(data)`, `(lote_pagamento_id)`
- `cliente_empresas`: `(cliente_id)`, `(empresa_id)`
- `auditoria`: `(registro_id)`, `(usuario_id)`, `(criado_em)`
- `recibos`: `(colaborador_id)`, `(semana_ref)`, `(data_pagamento)` + único parcial `(colaborador_id, semana_ref) WHERE ativo`

## 5. Funções SQL (`SECURITY DEFINER` quando aplicável) e Triggers

- `has_role(_user_id uuid, _role app_role) → boolean`
- `is_admin_or_gestor(_user_id uuid) → boolean`
- **`semana_ref_de(ts timestamptz) → date`** — período **quinta 19:00 → quinta seguinte 18:59**; retorna a quinta-feira de início.
- `normalize_text(text) → text` — lower + unaccent + collapse spaces (buscas e UNIQUE).
- **`check_cliente_empresa_valida()`** — trigger BEFORE INSERT/UPDATE em `extras`: exige `(cliente_id, empresa_id)` ativo em `cliente_empresas`.
- **`check_conflito_horario()`** — turnos cruzando meia-noite normalizados para `tstzrange` `[data + hora_inicio, data + 1d + hora_termino)` quando `hora_termino <= hora_inicio`; conflito = `&&` com outros intervalos do mesmo colaborador (ignora `rejeitado` e `situacao_financeira = cancelado`).
- `check_entidades_ativas()` — bloqueia lançamento com empresa/cliente/função/colaborador inativos.
- `check_fechamento_semana()` — Supervisor bloqueado após fechamento; Gestor/Admin exigem `justificativa_alteracao`; `encerrado_financeiro = true` bloqueia qualquer alteração (somente Admin via reabertura).
- `check_reabertura_semana()` — sem pagamento/faturamento: Admin/Gestor Op/Gestor Fin; com pagamento ou faturamento: somente Admin; sempre exige `motivo_reabertura` (auditado).
- `check_rejeicao()` — exige `motivo_rejeicao_id`; "Outros" exige `motivo_rejeicao_descricao`.
- `set_aprovacao_timestamps()` — preenche `aprovado_*_por/em`, `pago_por/em`, `faturado_por/em` conforme transições.
- `set_situacao_financeira_inicial()` — define `pendente_pagamento` ao atingir `aprovado_financeiro`.
- `bloqueio_exclusao_extras()` — BEFORE DELETE: bloqueia qualquer DELETE; operação equivalente = `situacao_financeira = cancelado` + `justificativa_cancelamento`.
- `check_recibo_unico()` — bloqueia recibo ativo duplicado para `(colaborador_id, semana_ref)`.
- `check_recibo_elegivel()` — só gera recibo para extras com `status = aprovado_financeiro` **e** `situacao_financeira = pago`.
- `audit_trigger()` — diff campo a campo em `extras`, `fechamentos_semanais`, `recibos`, capturando `auth.uid()` e `justificativa`.
- `proximo_numero_recibo()` — sequencial.

## 6. RLS

- Cadastros (`empresas`, `funcoes`, `clientes`, `cliente_empresas`, `colaboradores`, `motivos_rejeicao`): SELECT autenticado; INSERT/UPDATE/DELETE só `admin`.
- `extras`: SELECT autenticado; INSERT `supervisor`/`admin`; transições de `status` op./fin. conforme papel; mudanças em `situacao_financeira` (pago/faturado/cancelado) só Gestor Financeiro/Admin; DELETE negado a todos.
- `fechamentos_semanais`: fechar/`encerrado_financeiro` só `admin`/`gestor_financeiro`; reabrir conforme `check_reabertura_semana`.
- `recibos`: SELECT autenticado; INSERT Gestor/Admin; cancelar (preencher `cancelado_em/por/motivo_cancelamento` e `ativo=false`) só Gestor Financeiro/Admin.
- `user_roles`: SELECT autenticado; escrita só `admin`.
- `auditoria`: SELECT só `admin`; INSERT via trigger.

## 7. Seeds
- Admin inicial (`auth.users` + `user_roles`).
- `motivos_rejeicao` populada.

## 8. Matriz de permissões (resumo a detalhar no entregável)

| Ação | Admin | Gestor Op | Gestor Fin | Supervisor |
|---|---|---|---|---|
| Cadastros (CRUD) | ✅ | ❌ | ❌ | ❌ |
| Lançar extra | ✅ | ❌ | ❌ | ✅ |
| Aprovar/Rejeitar operacional | ✅ | ✅ | ❌ | ❌ |
| Aprovar financeiro | ✅ | ❌ | ✅ | ❌ |
| Marcar pago/faturado/cancelado | ✅ | ❌ | ✅ | ❌ |
| Fechar semana | ✅ | ✅ | ✅ | ❌ |
| Encerrar financeiro | ✅ | ❌ | ✅ | ❌ |
| Reabrir (sem pgto/fat.) | ✅ | ✅ | ✅ | ❌ |
| Reabrir (com pgto/fat.) | ✅ | ❌ | ❌ | ❌ |
| Gerar/cancelar recibo | ✅ | ❌ | ✅ | ❌ |
| Ver auditoria | ✅ | ❌ | ❌ | ❌ |
| Gerenciar usuários e roles | ✅ | ❌ | ❌ | ❌ |

## 9. Fluxograma de Status e Situação Financeira (resumo)

```text
STATUS (operacional):
pendente ──► aprovado_operacional ──► aprovado_financeiro
   └──► rejeitado

SITUAÇÃO FINANCEIRA (ao atingir aprovado_financeiro):
pendente_pagamento ──► pago ──► faturado
                  └──► cancelado
```

## 10. Frontend (suspenso até aprovação)

Rotas previstas: `/auth`, `/_authenticated/`, `/empresas | funcoes | clientes (com vínculos de empresa) | colaboradores | usuarios | motivos-rejeicao`, `/extras` + `/novo` + `/$id`, `/aprovacoes/operacional | financeiro`, `/pagamentos | faturamento`, `/fechamento`, `/recibos`, `/relatorios`, `/auditoria`.

Modais obrigatórios: rejeição (motivo + textarea se "Outros"), cancelamento de extra, cancelamento de recibo, alteração pós-fechamento, reabertura de semana, encerramento financeiro definitivo. Lista de Extras com colunas separadas Status e Situação Financeira. Busca normalizada (acento/caixa/espaços). Mobile-first.

## 11. Server Functions (suspenso até aprovação)

- `extras.functions.ts` — CRUD, transições, cancelamento.
- `pagamentos.functions.ts` — `forma_pagamento`, `data_pagamento`, `comprovante_url`.
- `faturamento.functions.ts` — `faturado_por/em`.
- `fechamento.functions.ts` — fechar/encerrar/reabrir conforme regras.
- `recibos.functions.ts` — `gerarRecibosSemana(semana_ref)`: unicidade + elegibilidade; congela `valor_total` e `valor_snapshot`; PDF com **Empresa Responsável**, **Matrícula**, **Função**, **Nome do Colaborador**, itens, total, assinatura.
- `relatorios.functions.ts` — Extras (inclui coluna **Situação do Serviço**), Faturamento semanal por cliente, Pagamento (Matrícula/Colaborador/Empresa/Função/Cliente/Qtde/Valor/Forma/Data/Situação; filtros Semana/Empresa/Forma de Pagamento).
- `usuarios.functions.ts` — admin gerencia usuários e roles.

Arquivos em bucket privado `documentos`; download via signed URL.

## 12. Implantação Vercel
README com variáveis (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), preset TanStack Start, troca de senha do admin inicial.

## Sequência de execução
1. **Agora**: entregar §0 (ERD, SQL, enums, constraints, índices, triggers, funções, RLS, seeds, matriz de permissões, fluxograma).
2. **Aguardar aprovação explícita** antes de iniciar telas, dashboards, server functions e geração de PDF/Excel.

## Fora de escopo
Tabela de Postos, Lotes de Pagamento, Tabela de Preços de Faturamento, Integração com Sistema de Ponto, SSO, Multi-tenant, Notificações por e-mail. Campos reservados (`valor_faturamento`, `lote_pagamento_id`, `codigo_ponto`, `ultima_sincronizacao_ponto`) existem na modelagem, sem funcionalidade nesta entrega.
