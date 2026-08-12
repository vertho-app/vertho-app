# Turmas (coortes) — proposta de arquitetura

> **Status: PROPOSTA (12/08/2026) — nada implementado.** Este documento descreve
> um desenho e as medições que o justificam. Enquanto estiver com este cabeçalho,
> não é descrição do sistema: o sistema hoje é o que está na seção "Estado atual".

## O problema em uma frase

A plataforma tem **dois relógios**, e só um deles existe de verdade:

1. **Relógio do participante** — `trilhas.data_inicio` por pessoa. Já funciona:
   `semanaLiberadaPorData` (`lib/season-engine/week-gating.ts`) libera a semana N
   em `data_inicio + (N-1)*7` **por trilha**. Duas pessoas em semanas diferentes
   já convivem sem conflito.
2. **Relógio do operador** — não existe. Painel, ações em lote, flags de
   liberação de etapa, cadência de envio, tetos de WhatsApp e alarmes tomam
   **`empresa_id` como unidade**. O pressuposto embutido é "empresa = uma coorte,
   numa fase".

Enquanto o cliente tinha uma turma só, os dois relógios coincidiam. Macaé quebra
a coincidência.

## Estado atual (medido em 12/08/2026)

### Macaé — dois públicos, dois estágios

| | Diretor(a) Escolar | Professor(a) |
|---|---|---|
| Pessoas | 127 | 156 |
| Com resposta de assessment | 38 (30%) | 8 (5%) |
| Avaliadas pela IA4 | 38 (100% das respondidas) | 0 |
| Primeira resposta | 23/07 | 11/08 |
| Trilhas | 0 | 0 |

Os diretores estão prontos para gerar trilha; os professores abriram o
diagnóstico **ontem**. Em Ibipeba a jornada roda com 36 trilhas ativas, todas com
`data_inicio = 2026-07-13` (semana 5) — **uma coorte só**, que é o caso que a
arquitetura atual suporta.

### O que o painel mostra hoje para Macaé

`carregarClienteWorkspace` (`app/admin-v2/actions.ts:213-276`) monta 5 fases com
**um estado por empresa**. Para Macaé, a fase F2 renderiza:

> **F2 · Diagnóstico** — 80 respostas · 72 avaliadas pela IA
> estado: `revisao` — "8 resposta(s) sem avaliação"

Três defeitos, todos consequência do escopo errado:

- **Sem denominador de gente.** "80 respostas" não diz 80 de quantos. São 46
  pessoas de 283. O código conta linhas de `respostas`, não pessoas.
- **A única "próxima ação" oferecida é a da turma nova.** As 8 respostas sem IA4
  são todas de professores. A tela não tem como dizer "diretores: fechado, pode
  gerar trilha".
- **O semáforo mistura.** Um estado (`bloqueado`/`revisao`/`feito`) para dois
  grupos que estão em fases diferentes só pode estar errado para um deles.

O mesmo vale para `GestorKpi.em_andamento.semana_media`
(`app/dashboard/gestor/actions.ts:16`): a média entre semana 1 e semana 5 é 3,
que não descreve ninguém.

### As decisões que "afetam a todos"

Vivem em `empresas.sys_config` (JSONB por empresa), lido em **169 pontos de 43
arquivos**:

| Chave | O que faz | Por que dói com 2 turmas |
|---|---|---|
| `perfil_comportamental_liberado` | abre o DISC | uma turma precisa abrir, a outra já passou |
| `mapeamento_cenarios_liberado` | abre o assessment | idem |
| `votacao_ativa` | abre a votação de competências | idem |
| `programa_modo` | jornada / duo / piloto / onboarding | turmas podem ter desenhos diferentes |
| `competencias_regular_duo` | quais competências | diretor e professor não trabalham a mesma |
| `cadencia.fase4_dia_*` | dias de pílula e evidência | duas turmas competem pela mesma janela |
| `blueprint_drives_trilha` | origem da trilha | pode mudar entre safras |

E **63 varreduras** do tipo `from('colaboradores').eq('empresa_id', …)` operam em
lote sobre a empresa inteira — `gerarPDIs(empresaId)`,
`listarColabsParaTrilha(empresaId)`, `levantarPlanoKitsCoorte(sb, empresaId)`.
Apertar um botão para os diretores prontos varre também os 156 professores.

### O que **já** está certo e não deve ser refeito

- O gating de semana é por trilha (`week-gating.ts`).
- Já existe precedência de config em dois níveis: `resolverModoColab`
  (`lib/season-engine/programa-config.ts`) resolve
  `colab.programa_modo → empresa.sys_config.programa_modo → 'regular_duo'`.
- Já existe **carimbo que congela as regras**: `trilhas.programa_modo` +
  `trilhas.programa_config` (modo custom). Trilha em andamento não muda de regra
  quando a config da empresa muda.
- Os gates de etapa estão centralizados em `lib/access-gates/` com apenas **6
  consumidores reais** — ponto de injeção barato.

A proposta abaixo é uma **extensão dessas três decisões**, não uma troca.

---

## Proposta: turma como entidade de primeira classe

### 1. Modelo

```sql
create table turmas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  nome         text not null,                 -- "Diretores 2026.1"
  status       text not null default 'planejada',
                                              -- planejada|ativa|concluida|arquivada
  data_inicio  date,                          -- a segunda canônica da turma
  is_default   boolean not null default false,-- destino de import sem turma
  sys_config   jsonb not null default '{}',   -- OVERRIDE (ver §2)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index turmas_empresa_nome_ux on turmas(empresa_id, lower(nome));
create unique index turmas_default_ux on turmas(empresa_id) where is_default;

alter table colaboradores add column turma_id uuid references turmas(id);
alter table trilhas       add column turma_id uuid references turmas(id);
```

Duas decisões de desenho, ambas com precedente no repo:

- **`colaboradores.turma_id` é o vínculo vivo; `trilhas.turma_id` é carimbo.**
  Mover alguém de turma não muda a trilha em andamento — mesma disciplina de
  `getProgramaConfigDaTrilha`, que serve a config do carimbo e não da empresa.
- **Turma tem `sys_config` próprio**, com a mesma forma do da empresa, para que a
  resolução seja um merge e não um tipo novo.

**Turma não é cargo.** Em Macaé os dois eixos coincidem hoje, mas coincidência não
é modelo: no dia em que uma escola entrar em setembro com professores *e*
diretores juntos, derivar turma de cargo quebra. Turma é campo próprio, atribuído
na importação ou na tela.

### 2. Quais chaves são por turma (e quais não são)

Sem uma lista explícita, JSONB livre vira bagunça e nenhum guard consegue
verificar nada. A lista é código, em `lib/turmas/chaves.ts`:

```
POR TURMA (etapa e tempo):
  perfil_comportamental_liberado, mapeamento_cenarios_liberado, votacao_ativa,
  programa_modo, competencias_regular_duo, blueprint_drives_trilha, cadencia.*

DA EMPRESA (não faz sentido divergir):
  ai.*, perfil_externo_fonte, is_demo, default_locale, branding, envios.*
```

### 3. Fonte única de resolução

```ts
// lib/turmas/config-efetiva.ts
resolverConfigEfetiva(colab, turma, empresa) -> ConfigEfetiva
// precedência: colaborador → turma → empresa → default
```

Precedência de **três** níveis, estendendo a de dois que já existe. Regra dura,
com o precedente de `nivelDaNota` (que estava em 10 cópias e vazava divergência
para o documento final):

> **Nenhum consumidor lê `empresas.sys_config` direto** para uma chave da lista
> "por turma". Um guard de teste varre os 43 arquivos e falha se aparecer leitura
> fora de `config-efetiva.ts`, com allowlist explícita.

Sem o guard, a fonte única dura até o próximo commit distraído.

### 4. O painel: lista de turmas, workspace por turma

O dashboard **não** vira "um dashboard por turma" nem continua misturado:

- `/admin-v2/cliente?empresa=X` passa a listar as turmas como linhas — nome,
  pessoas, modo, etapa **daquela turma**, semana da jornada, próxima ação, alertas.
- Operar exige entrar numa turma: `?empresa=X&turma=Y`. Uma faixa fixa no topo
  ("operando **Diretores 2026.1** · 127 pessoas · semana 5 de 7") impede disparar
  um lote achando que é a outra.
- **Nenhum agregado sem denominador da turma.** "38 de 127 (30%)", nunca "80
  respostas".

Este é o momento certo: o admin-v2 tem 3 das 6 áreas escritas. As 3 restantes
nascem com o escopo certo em vez de herdarem o pressuposto errado.

No dashboard do gestor, `semana_media` sai e vira distribuição por turma. O
escopo do gestor (`gestor_email`) é **ortogonal** à turma: um gestor pode ter
liderados nas duas, e as duas réguas se compõem (gestor ∩ turma).

### 5. Ações em lote: fail-closed

As ações de lote ganham `turmaId`. O ponto que decide se isso funciona ou vira
maquiagem:

> Com **duas ou mais turmas ativas**, ação de lote **sem** `turmaId` é **erro**,
> não "faz para a empresa toda".

Default silencioso reintroduz o bug exatamente no dia em que alguém esquecer.
Mesmo padrão de `assertTenantAccessAction`, um nível abaixo. Com uma turma só
(todos os clientes de hoje), o comportamento é idêntico ao atual.

### 6. Envio: o teto é da empresa, a reserva é da turma

O teto de WhatsApp é por empresa (`maxPorDisparo`, `lib/whatsapp/cadencia.ts`), e
`adiadosPorTeto` **não é erro** — é a proteção funcionando. Com duas turmas isso
vira falha dirigida e silenciosa: a turma que está começando (156 professores,
convites) come a cota e a turma no meio da jornada perde a pílula da semana. O
incidente de 11/08 (155 mensagens a 2s/msg derrubaram o número em 1min47) mostra
que o teto não vai subir para acomodar as duas.

Proposta: **prioridade por natureza da mensagem**, não por ordem de varredura —
pílula de jornada (entrega contratada, tem data) antes de convite de onboarding
(pode esperar um dia). E `adiadosPorTeto` reportado **por turma**, senão o número
agregado esconde qual das duas ficou sem.

### 7. Alarmes e kits

`levantarPlanoKitsCoorte(sb, empresaId, opts)` recebe `turmaId`. Hoje "coorte"
significa "a empresa toda" — o `inicioMaisCedo` que ancora as datas de abertura
mistura duas turmas, e o horizonte de kits ("o que falta nas próximas semanas")
soma semana 5 de uma com semana 1 da outra. Como as janelas são
`semanas: number[]`, **"semana 5" de duas turmas são datas diferentes** e o
alarme perde a capacidade de dizer *quando*.

Vocabulário: hoje `coorte` no código = empresa. Ao introduzir turma, `coorte`
vira sinônimo de turma ou é renomeado — sem meio-termo, senão a palavra
significa duas coisas na mesma base.

### 8. Migração

Backfill de **uma turma por empresa** (`is_default = true`), com o `data_inicio`
predominante das trilhas ativas e todos os colaboradores dentro. Uma turma =
comportamento byte-igual ao de hoje. Depois, em Macaé, criam-se as duas turmas na
tela e move-se quem for.

`turma_id` fica **nullable** com a turma default como destino do import, em vez de
`NOT NULL`: import em massa que falha por falta de turma é pior do que import que
cai no default — e o default é auditável.

---

## Faseamento

| Fase | Entrega | Muda comportamento? |
|---|---|---|
| **1 — fundação** | tabela `turmas`, `turma_id` nos dois lados, backfill, `resolverConfigEfetiva` + guard, CRUD de turmas | não |
| **2 — painel** | lista de turmas no admin-v2, workspace com escopo, denominadores por turma, gestor sem `semana_media` | sim (só leitura) |
| **3 — lote** | `turmaId` nas ações de lote, fail-closed com 2+ turmas, guard de varredura | sim |
| **4 — envio e alarme** | cadência por turma, reserva de teto, kit/health por turma | sim |

Fases 1 e 2 já resolvem a dor descrita ("o dashboard é único"). As fases 3 e 4
resolvem a dor que vem depois — quando as duas turmas de Macaé estiverem **ambas
em jornada**, competindo por cota de envio e por kits.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Um tenant por turma** (`macae-diretores`, `macae-professores`) | Resolve hoje de graça — o isolamento já existe e é testado. Mas duplica cargos e competências, quebra os relatórios coletivos (DNA Organizacional, Ranking de Adequação são por empresa), o gestor da secretaria passa a ver dois clientes, e o repo já registra o custo de "158 pessoas no tenant errado". |
| **Só um filtro de turma na UI** | Barato, mas não toca as flags de etapa nem as ações em lote — que é exatamente onde "as decisões afetam a todos". Maquiagem. |
| **Turma implícita = quem começou na mesma segunda** (`data_inicio`) | Zero migração, mas a turma precisa existir **antes** da trilha: em Macaé são 283 pessoas sem trilha nenhuma, e é agora, no diagnóstico, que os dois grupos precisam se separar. Turma implícita também não tem onde pendurar override de config. |
| **Usar `escola_id`** (já existe, mig 126) | Eixo organizacional (onde a pessoa trabalha), não temporal (quando entrou). Em Macaé, professores e diretores estão nas **mesmas** escolas. Ortogonal — os dois eixos convivem. |

## Riscos

- **Turma tratada como cargo.** Mitigar no modelo (campo próprio) e na tela
  (atribuição explícita, com sugestão por cargo apenas como atalho de importação).
- **As 63 varreduras por empresa.** A Fase 3 não fecha todas; fecha as de lote e
  IA. O resto precisa de um guard com allowlist (precedente:
  `docs/service-role-allowlist.md`) para que o pendente seja **visível**, não
  esquecido.
- **Fonte única sem guard não sobrevive.** Ver `nivelDaNota`.
- **Vocabulário vazando para o cliente.** "Turma" é a palavra da Secretaria;
  "coorte" é jargão de código. O guard de copy já existe em
  `tests/unit/conarh-mensagens.test.ts` como precedente.

## Decisões pendentes

1. **Nome da entidade** — `turma` (recomendado: é a palavra do cliente) ou `coorte`.
2. **As turmas de Macaé** — "Diretores" e "Professores" confirma? Nomear com safra
   (`Diretores 2026.2`) já prevendo a segunda leva.
3. **Escopo do gestor** — o gestor com liderados nas duas turmas vê tudo junto
   (com coluna de turma) ou escolhe uma? Recomendo tudo junto com coluna: o gestor
   pensa em pessoas, não em safras.
4. **Prioridade de envio** — jornada antes de onboarding quando a cota apertar?
