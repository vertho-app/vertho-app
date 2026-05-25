# Papéis e permissões

## Objetivo

Centralizar a autorização do Vertho em uma matriz auditável, evitando regras
espalhadas em botões, páginas e server actions.

## Papéis atuais

- `platform_admin`: admin master Vertho, derivado da tabela `platform_admins`.
- `rh`: admin da empresa, derivado de `colaboradores.role`.
- `gestor`: liderança com escopo de equipe/área.
- `tutor`: tutor com escopo de `tutorados_ids`.
- `colaborador`: usuário final com acesso individual.

## Fonte de verdade

- Matriz base: `lib/permissions.ts`.
- Overrides auditáveis: `permission_overrides` (`migrations/117-permission-overrides.sql`).
- Guards de server action/API:
  - `requirePermissionAction(permission)`
  - `requirePermission(req, permission)`

## Fluxo de decisão

1. Resolve contexto do usuário por e-mail e tenant.
2. Calcula papel efetivo (`platform_admin` tem prioridade).
3. Carrega permissões base do papel.
4. Aplica overrides por papel e por usuário:
   - `allow` adiciona permissão.
   - `deny` remove permissão.
5. A decisão final deve ser aplicada no servidor.

## Tela administrativa

Rota: `/admin/permissoes`

Funções:

- Matriz por papel.
- Busca por permissão/domínio.
- Risco por permissão.
- Diagnóstico por usuário.
- Edição de overrides com motivo obrigatório.
- Bloqueio contra remoção de permissões críticas do próprio admin master.

## Mapa inicial de permissões críticas

| Área | Permissão | Proteção inicial |
| --- | --- | --- |
| Admin | `admin.access` | layout/admin access |
| Governança | `permissions.view` | tela `/admin/permissoes` |
| Governança | `permissions.manage` | overrides |
| Governança | `platform_admins.manage` | actions de `/admin/platform-admins` |
| IA | `ai.audit.regenerate` | matriz pronta para integração granular |
| Radar | `radar.admin.access` | matriz pronta para integração granular |
| Dados | `exports.run` | matriz pronta para integração granular |

## Próximas integrações recomendadas

- Trocar chamadas críticas de `requireAdminAction()` por
  `requirePermissionAction(...)` em ações de IA, exportação, Radar e lixeira.
- Adicionar testes unitários para `lib/permissions.ts`.
- Criar auditoria automatizada que liste actions admin sem guard explícito.
