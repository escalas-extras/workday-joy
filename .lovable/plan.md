# Fase 2.5 – Plano de Implementação

Entrega única cobrindo os 11 blocos. Toda ação auditável passa por Server Function que captura IP, User-Agent, usuário, data/hora, ação e registro afetado.

## 1. Banco de dados (migração única)

**Novas tabelas**
- `audit_trail` — auditoria avançada imutável: `id`, `user_id`, `user_email`, `ip_address`, `user_agent`, `action` (enum: create/update/delete/view/print/download/approve/generate_pdf), `entity_type`, `entity_id`, `old_value` jsonb, `new_value` jsonb, `reason`, `company_id`, `created_at`. RLS: admin/RH leem; insert via service_role apenas.
- `disciplinary_print_log` — `id`, `entity_type` (warning/case/justa_causa/dossie), `entity_id`, `action` (view/download/print/reprint), `user_id`, `ip`, `user_agent`, `created_at`.
- `equipment_return_checklist` — vinculado ao `disciplinary_case_id`: itens (uniforme, crachá, chaves, rádio HT, celular, notebook, veículo, outros como jsonb com `{item, returned, observation}`), `responsible_user_id`, `return_date`, `observations`.
- `digital_signatures` — estrutura preparatória: `id`, `entity_type`, `entity_id`, `signer_role` (empregado/testemunha/rh/diretoria), `signer_name`, `signer_cpf`, `signature_hash` (null por enquanto), `signed_at`, `provider` (null), `status` (pending/signed). Sem integração externa.

**Alterações**
- `disciplinary_cases`, `disciplinary_case_evidences`, `disciplinary_case_witnesses`, `disciplinary_case_approvals`: adicionar `active boolean default true` + `deactivated_at`, `deactivated_by`, `deactivation_reason`. Trigger `BEFORE DELETE` que bloqueia exclusão (raise exception → use inativação).
- Mesma proteção em `disciplinary_warnings`.

**Funções/Triggers**
- `tg_block_disciplinary_delete()` — impede DELETE.
- View `v_disciplinary_stats_by_employee` — agrega contagens por colaborador.
- View `v_disciplinary_dashboard` — agrega por empresa/supervisor/cliente/mês.

## 2. Server Functions auditadas

Arquivo `src/lib/disciplinary-audit.functions.ts` com helper `recordAudit({action, entity_type, entity_id, old_value, new_value, reason})` que captura IP via `getRequestIP({xForwardedFor:true})` e UA via `getRequestHeader('user-agent')`, grava em `audit_trail` + `disciplinary_print_log` quando aplicável.

Server fns criadas:
- `createDisciplinaryWarning`, `updateDisciplinaryWarning`
- `createDisciplinaryCase`, `updateDisciplinaryCase`, `deactivateCaseEntity`
- `uploadEvidenceMeta`, `approveCase`, `generateJustaCausaPDF`, `generateDossiePDF`
- `logPrintAction` (chamada antes de imprimir/baixar qualquer PDF)
- `getEmployeeDisciplinaryPanel(employee_id)` — retorna stats + últimas ocorrências
- `getRecidivismAlert(employee_id, reason_id)` — retorna contagens 30/90/180/365 dias
- `getDashboardData(filters)` — cards, séries para gráficos, lista detalhada
- `globalSearch(term)` — busca em CPF/nome/processo/testemunha/empresa/cliente

Todas usam `requireSupabaseAuth` + verificação de papel via `has_role`.

## 3. UI

**Página `/colaboradores/$id` — nova aba "Painel Disciplinar"**
- Cards: Orientações Verbais, Advertências, Suspensões, Processos, Justas Causas revertidas.
- Datas: última ocorrência, última suspensão, última advertência.
- Linha do tempo cronológica.

**Modal "Nova Medida" (advertências.tsx + processos.tsx)**
- Bloco "Alerta de Reincidência" no topo: contagens 30/90/180/365 dias; badge vermelho destacando mesmo motivo.

**Processo Disciplinar — nova aba "Devolução de Equipamentos"** (somente quando tipo = Justa Causa)
- Checklist com switches por item + campo observação por item.
- Data, responsável (autopreenchido), observações gerais.
- Bloqueia geração do PDF de Justa Causa se checklist não preenchido.

**Nova rota `/relatorios-disciplinares`**
- Filtros globais (período, empresa, supervisor, cliente, colaborador, tipo de medida) em sticky bar.
- Cards de indicadores (6 cards).
- Gráficos (recharts, padrão do projeto): barras (medidas por mês), pizza (motivos), barras horizontais (empresa/supervisor/cliente).
- Tabela detalhada paginada.
- Botões "Exportar PDF executivo" e "Exportar Excel analítico".

**Nova rota `/pesquisa-disciplinar`** (ou Command global `Ctrl+K`)
- Input único, busca em CPF, nome, número processo, testemunha, empresa, cliente.
- Resultados agrupados por tipo.

**Botão "Gerar Dossiê Disciplinar"** em cada processo
- Server fn `generateDossiePDF` unifica em PDF único: capa, dados do processo, evidências (lista + thumbnails), testemunhas, aprovações, histórico de advertências/suspensões do colaborador, Justa Causa (se houver), trilha de auditoria resumida.

**Controle de impressões** — todo botão de imprimir/baixar PDF chama `logPrintAction` antes de executar.

## 4. Bloqueios

- Trigger DB impede DELETE em processos, evidências, testemunhas, aprovações, advertências.
- UI substitui botão "Excluir" por "Inativar" com modal exigindo motivo.
- Server fn `deactivateCaseEntity` grava `active=false` + auditoria.

## 5. Estrutura de Assinatura Digital (preparatória)

- Tabela `digital_signatures` criada.
- Server fn `requestSignature(entity_type, entity_id, signers[])` cria registros `status='pending'`.
- UI mostra status na aba Aprovações ("Aguardando assinatura — provedor não configurado").
- Sem integração externa nesta fase.

## Detalhes técnicos

- Captura de IP: `getRequestIP({xForwardedFor: true})` + fallback para `cf-connecting-ip`.
- PDFs: reutilizar jsPDF já presente no projeto; novo `src/lib/dossie-pdf.ts`.
- Excel: usar SheetJS (`xlsx`) — adicionar dependência.
- Gráficos: recharts (já no projeto).
- Performance: dashboard usa views materializadas se necessário; queries com índices em `created_at`, `company_id`, `employee_id`.
- Toda mutação client → server fn → audit_trail. Nenhuma escrita direta de tabela disciplinar do cliente após esta fase.

## Arquivos previstos

**Migrações**: 1 arquivo SQL único (tabelas, triggers, views, índices, RLS, grants).

**Novos**:
- `src/lib/disciplinary-audit.functions.ts`
- `src/lib/disciplinary-reports.functions.ts`
- `src/lib/disciplinary-search.functions.ts`
- `src/lib/dossie-pdf.ts`
- `src/lib/excel-export.ts`
- `src/routes/_authenticated/relatorios-disciplinares.tsx`
- `src/routes/_authenticated/pesquisa-disciplinar.tsx`
- `src/components/disciplinary/employee-panel.tsx`
- `src/components/disciplinary/recidivism-alert.tsx`
- `src/components/disciplinary/equipment-checklist.tsx`
- `src/components/disciplinary/global-search-dialog.tsx`

**Editados**:
- `src/routes/_authenticated/advertencias.tsx` (alerta reincidência, audit, inativação)
- `src/routes/_authenticated/processos.tsx` (aba equipamentos, dossiê, audit, inativação)
- `src/routes/_authenticated/colaboradores.tsx` ou rota de detalhe (aba Painel)
- `src/components/app-shell.tsx` (links Relatórios, Pesquisa)
- `src/routes/_authenticated/inicio.tsx` (cards Relatórios)
- `src/lib/advertencia-pdf.ts`, `src/lib/justa-causa-pdf.ts` (chamar logPrintAction)
- `src/start.ts` (confirmar attachSupabaseAuth)

## Ordem de execução

1. Migração SQL única (aguarda aprovação).
2. Server functions de auditoria/relatórios/busca/dossiê.
3. Componentes compartilhados (painel, alerta reincidência, checklist, busca global).
4. Páginas (relatórios, pesquisa).
5. Integração nas páginas existentes (advertências, processos, colaboradores).
6. Bloqueios de exclusão e inativação na UI.
7. Verificação: invocação de server fns + leitura de logs.

Confirme para eu iniciar pela migração.