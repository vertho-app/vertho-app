# Turmas (coortes) — arquitetura

> **Status: IMPLEMENTADO em 13/08/2026** (fundação, config, escopo, painel e
> turmas de Macaé). O desenho abaixo descreve o sistema como ele é; o que ficou
> de fora está marcado como **pendente** e listado em "O que NÃO entrou".
>
> Schema: `migrations/210-turmas.sql`. Código: `lib/turmas/`, `actions/turmas.ts`.
> A **UI do portfólio está atrás de flag desligada** (`TURMAS_UI` ou
> `sys_config.turmas_ui`) — ligar para Macaé depois de 20/08, pelo
> sequenciamento do CONARH.

## O problema

A plataforma tem **dois relógios**, e só um existe de verdade:

1. **Relógio do participante** — funciona. `semanaLiberadaPorData`
   (`lib/season-engine/week-gating.ts:29`) libera a semana N em
   `trilhas.data_inicio + (N-1)*7`, **por trilha**. Pessoas em semanas diferentes
   já convivem sem conflito.
2. **Relógio do operador** — não existe. Painel, ações em lote, flags de
   liberação de etapa, cadência de envio e alarmes tomam **`empresa_id` como
   unidade**. O pressuposto embutido é "empresa = uma coorte, numa fase".

Enquanto o cliente tinha uma turma só, os dois relógios coincidiam. Macaé quebra
a coincidência: dois públicos, em estágios diferentes, no mesmo tenant.

## Estado medido (13/08/2026)

### Macaé

| | Diretor(a) Escolar | Professor(a) |
|---|---|---|
| Pessoas | 127 | 156 |
| Com resposta de assessment | 38 (30%) | 10 (6%) |
| Avaliadas pela IA4 | 38 (todas) | 0 |
| Primeira resposta | 23/07 | 11/08 |
| Trilhas | 0 | 0 |

Ibipeba, para contraste: 36 trilhas ativas, todas com `data_inicio = 2026-07-13`
(semana 5) — **uma coorte só**, o caso que a arquitetura atual suporta.

### O que o painel mostra para Macaé

`carregarClienteWorkspace` (`app/admin-v2/actions.ts:213-276`) monta 5 fases com
**um estado por empresa**:

> **F2 · Diagnóstico** — 82 respostas · 72 avaliadas pela IA
> estado: `revisao` — "10 resposta(s) sem avaliação"

- **Sem denominador de gente**: 82 linhas = 48 pessoas de 283.
- **A única "próxima ação" é a da turma nova** — as 10 sem IA4 são todas de
  professores; os 38 diretores prontos para gerar trilha somem da tela.
- **Um semáforo para dois grupos em fases diferentes** só pode estar errado para
  um deles. E a distorção cresce sozinha: cada professor novo que responde
  aumenta a "pendência" da empresa sem que nada tenha piorado nos diretores.

Mesmo defeito em `GestorKpi.em_andamento.semana_media`
(`app/dashboard/gestor/actions.ts`): a média entre semana 1 e semana 5 é 3, que
não descreve ninguém.

### O alcance das decisões de hoje

`empresas.sys_config` (JSONB por empresa) é lido em **169 pontos de 43 arquivos**
e concentra o que "afeta a todos": `perfil_comportamental_liberado`,
`mapeamento_cenarios_liberado`, `votacao_ativa`, `programa_modo`,
`competencias_regular_duo`, `blueprint_drives_trilha`, `cadencia.*`. Há ainda
**63 varreduras** `from('colaboradores').eq('empresa_id', …)` que operam em lote
sobre a empresa inteira.

## O que já está certo — e não deve ser refeito

A proposta estende decisões existentes; não troca nenhuma.

- **Gating de semana por trilha** — `week-gating.ts`.
- **Precedência de config em 2 níveis** — `resolverModoColab`
  (`lib/season-engine/programa-config.ts`) já resolve colaborador → empresa →
  default. A turma entra no meio.
- **Carimbo que congela regras** — `trilhas.programa_modo` + `programa_config`:
  mudar a config da empresa não altera trilha em andamento.
- **Reentrada já tem mecanismo** — `numero_temporada`. `trilha-core.ts:737`
  **incrementa** (nunca reinicia em 1); a UNIQUE virou
  `(empresa_id, colaborador_id, numero_temporada)` na mig 199. Hoje: **0 trilhas**
  com temporada ≥ 2 — o encadeamento nunca rodou.
- **Log de decisão** — `admin_audit_log` já tem `acao`, `empresa_id`, `alvo`
  ("53 colaboradores"), `detalhes` JSONB, `resultado`. Só falta `turma_id`.
- **Piso de anonimato** — `PULSE_MIN_N = 7` (`lib/pulse/anonymity.ts`).
- **Gates de etapa centralizados** — `lib/access-gates/`, com 6 consumidores
  reais. Injeção barata.

---

## 1. Modelo

```sql
-- pré-requisito das FKs compostas: alvo (id, empresa_id) em quem já existe
alter table colaboradores add constraint colaboradores_id_empresa_ux
  unique (id, empresa_id);

create table turmas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  nome         text not null,                  -- "Diretores escolares — 2026.2"
  status       text not null default 'planejada'
    check (status in ('planejada','diagnostico','trilhas_em_geracao','em_jornada','concluida','arquivada')),
  data_inicio  date,
  sys_config   jsonb not null default '{}',    -- override tipado (§3)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, empresa_id)                      -- alvo da FK composta
);

create table turma_membros (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null,
  turma_id        uuid not null,
  colaborador_id  uuid not null,
  status          text not null default 'ativo'
    check (status in ('ativo','removido','concluido')),
  entrou_em       date not null default current_date,
  saiu_em         date,
  config_override jsonb not null default '{}', -- exceção da PARTICIPAÇÃO (§3)
  foreign key (turma_id, empresa_id)       references turmas(id, empresa_id),
  foreign key (colaborador_id, empresa_id) references colaboradores(id, empresa_id),
  unique (id, empresa_id)                      -- alvo da FK composta de trilhas
);

-- Uma participação ATIVA por pessoa. Reentrada (mesma turma ou outra) é linha
-- nova com entrou_em próprio; a anterior fica 'concluido'/'removido' com
-- saiu_em preenchido. Por isso NÃO há unique total em (turma_id, colaborador_id):
-- ele proibiria justamente o histórico de quem sai e volta.
create unique index turma_membros_ativo_unico_ux
  on turma_membros (empresa_id, colaborador_id) where status = 'ativo';

alter table trilhas add column turma_membro_id uuid;
alter table trilhas add constraint trilhas_turma_membro_empresa_fk
  foreign key (turma_membro_id, empresa_id) references turma_membros(id, empresa_id);
```

**FK composta em todo vínculo, sem exceção.** O app roda em `service_role`
(BYPASSRLS): a única garantia real de que turma, membro, colaborador e trilha são
do mesmo tenant é a que o Postgres impõe. FK por UUID solto (`references
colaboradores(id)`) **não** valida `empresa_id` — parece isolamento e não é. O
mesmo princípio vale para `pulse_ciclos` e `pulse_assignments` (§2).

**Turma ≠ jornada.** Com jornadas sequenciais (DUO = duas trilhas), a pessoa
segue na **mesma** turma nas duas — não se cria uma turma por jornada. A turma é
a safra de entrada; a jornada é o ciclo de conteúdo dentro dela.

**O vínculo é tabela, não campo no colaborador.** Três razões:

- **Existe estado de turma antes de existir trilha.** Macaé tem 283 pessoas e 0
  trilhas: durante todo o diagnóstico, o vínculo só pode viver fora da trilha.
- **A composição é decisão do operador, não consulta.** Quem entra na safra
  2026.2 é escolha — não é `where cargo = 'Diretor'`. Um campo guarda "turma
  atual"; não guarda quem foi selecionado, quando e por quem.
- **Etapa precisa de um conjunto para ser subconjunto de** (§2).

Simetria: o Pulso já faz exatamente isso com `pulse_assignments`.

**`turma_membro_id` na trilha é carimbo**, ao lado de `programa_modo`/
`programa_config`. Mover alguém de turma não muda trilha em andamento.

**Não mexer na UNIQUE de `trilhas`.** Trocá-la por
`(turma_membro_id, numero_temporada)` quebra duas coisas: `trilha-core.ts:772`
faz `upsert(..., { onConflict: 'empresa_id,colaborador_id,numero_temporada' })` —
o upsert atômico do header (F-C1 do FMEA); e `turma_membro_id` é NULL em trilha
legada, e **UNIQUE não deduplica NULL no Postgres** — a atomicidade morreria
exatamente no caminho de compatibilidade.

### ⚠️ A reentrada não está pronta só porque `numero_temporada` existe

`trilha-core.ts:730` busca a trilha de maior temporada **do colaborador**, sem
saber de turma. Sem `novaJornada: true`, `numeroTemporada` **reusa** o número
existente e o upsert bate na **mesma linha** — gerar a primeira trilha de alguém
numa turma nova **sobrescreveria a trilha da turma anterior**. E `data_inicio`
resolve para `nextMondayISO()`, nunca para a data da turma:

```ts
data_inicio: novaJornada ? nextMondayISO() : (existente?.data_inicio || nextMondayISO())
```

Portanto a geração no contexto de turma tem que, obrigatoriamente: receber
`turmaMembroId`; passar `novaJornada: true` quando já houver trilha anterior;
carimbar `turma_membro_id` no payload; e usar `turma.data_inicio` no lugar de
`nextMondayISO()`. Vira critério de aceite.

**Turma não é cargo.** Em Macaé os eixos coincidem hoje; coincidência não é
modelo — a safra 2026.2 pode ter professores e diretores juntos. E não é
`escola_id` (mig 126), que é eixo organizacional, não temporal: em Macaé os dois
cargos estão nas mesmas escolas. Os eixos convivem.

## 2. Módulos opcionais: o Pulso é uma etapa da turma

O Pulso é **contratado à parte**. Quando contratado, é **uma etapa da turma** —
logo a turma não pode ser o `pulse_ciclos`: empresa sem Pulso ficaria sem turma.

Mas `pulse_ciclos` (mig 096) **acumulou o papel de turma**, na falta de um
container: nome com safra ("Piloto Macaé — 1º Semestre 2026"), lista explícita de
membros, calendário próprio e status operacional. É o conjunto que denuncia, não
um campo isolado.

Sobre o `em_jornada` do enum: ele **é** um estado legítimo do Pulso — "T0
encerrado, aguardando a janela do T2" — só está com o nome emprestado da turma.
Renomear para **`aguardando_t2`**, não remover. O estado da turma
(`em_jornada`) passa a viver em `turmas.status` (§1), e os dois deixam de
competir pelo mesmo vocabulário.

```sql
alter table pulse_ciclos      add column turma_id        uuid;  -- etapa, não container
alter table pulse_assignments add column turma_membro_id uuid;  -- participação, não pessoa
alter table pulse_assignments add constraint pulse_assign_membro_empresa_fk
  foreign key (turma_membro_id, empresa_id) references turma_membros(id, empresa_id);
```

**Regra geral que fica:** os participantes de uma etapa são **subconjunto** dos
membros da turma, nunca uma lista paralela — e isso é **constraint**, não
convenção. Ligar o assignment à *participação* (e não à pessoa) tem um segundo
efeito: trocar alguém de turma não reinterpreta o Pulso antigo dele.

### Contratação: disponível ≠ instanciado

Não existe registro de contratação hoje. `pulse_stage` foi citado na mig 096
("fica em `sys_config`, não precisa de DDL") e **nunca foi implementado** — zero
ocorrências no código. Qualquer admin cria ciclo para qualquer empresa, e o
colaborador vê o Pulso pela simples existência de um `pulse_assignment`
(`lib/home/loaders.ts:498` → card em `app/dashboard/page.tsx:377`).

| | Onde mora | Exemplo |
|---|---|---|
| **Disponível** — a empresa contratou | `empresas.sys_config.modulos` | Macaé contratou Pulso |
| **Instanciado** — esta safra usa | etapa da turma | só a turma de diretores tem T0/T2 |

Sem essa separação, "contratou" e "está rodando" viram a mesma flag — e não há
como instanciar o módulo na turma nova sem religar a anterior.

**O gate de módulo é o pedágio que falta**: sem `sys_config.modulos.pulso`, não
se cria ciclo nem assignment.

> **Custo já cobrado pela ausência desse gate.** Um ciclo rascunho de Macaé
> (14/05, nunca executado) tinha 40 assignments com `due_date = NULL`; o filtro
> de pendentes deixa NULL passar e a home renderiza sem outra condição — **40
> diretores receberam um card "Pulso T0" durante 3 meses**, de um módulo que
> ninguém contratou. Excluído em 12/08 com backup em `admin_audit_log`
> (`pulse.rascunho.excluir`). Rascunho sem gate chega ao usuário como entrega
> real.

⚠️ **O módulo nunca rodou em lugar nenhum**: `pulse_responses` = 0,
`pulse_mv_aggregates` = 0. São 51 referências em 22 arquivos — MV de agregados,
dual-AI, triangulação, piso de anonimato — tudo escrito, nada exercitado com dado
real. Quando for vendido, a primeira execução real cai num cliente pagante:
rodar um ciclo inteiro em tenant de demo antes. É a mesma classe do health-check,
cujos 4 modos nasceram sem nunca ter rodado.

### Etapas como entidade — e o freio

As três flags de hoje (`perfil_comportamental_liberado`,
`mapeamento_cenarios_liberado`, `votacao_ativa`) **já são etapas**, disfarçadas
de booleano solto. O destino natural é uma tabela:

```sql
create table turma_etapas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  turma_id   uuid not null,
  tipo       text not null,   -- perfil|diagnostico|votacao|pulso_t0|jornada|pulso_t2|fechamento
  ordem      smallint not null,
  status     text not null default 'planejada',  -- planejada|aberta|encerrada
  abre_em    date,
  fecha_em   date,
  ref_id     uuid,            -- id do objeto da etapa (ex.: pulse_ciclos.id)
  foreign key (turma_id, empresa_id) references turmas(id, empresa_id),
  unique (turma_id, tipo, ordem)
);
```

**Mas não agora.** Enquanto o Pulso for a única etapa contratável, o resolvedor
tipado (§3) resolve o caso com as flags por turma. Roteiro configurável é o tipo
de coisa que começa com um caso real e termina como builder que ninguém fecha —
por isso `tipo` é **enum fechado em código**, e a tabela só entra quando existir
a segunda etapa opcional.

## 3. Config: resolvedor tipado por nível

```
resolverConfigEfetiva(trilha, turmaMembro, turma, empresa) -> ConfigEfetiva
// precedência: snapshot da trilha → override da participação → turma → empresa → default
```

**A exceção individual pertence à participação, não à pessoa.**
`colaboradores.programa_modo` é global e vaza para a safra seguinte: quem
recebeu override `piloto` numa turma continuaria em `piloto` meses depois, em
outra, sem ninguém perceber. Por isso `turma_membros.config_override` (§1), e
`colaboradores.programa_modo` passa a **legado** — lido na migração, não como
fonte definitiva.

**Regra de desempate, para não nascerem dez cópias divergentes.** O resolvedor
recebe a participação por parâmetro, então quem escolhe *qual* turma resolve é o
chamador. A régua é única:

> A config efetiva é a da **turma da trilha em andamento**. Antes de existir
> trilha, é a da turma do **contexto da tela ou da ação**. Nunca inferida do
> colaborador sozinho.

Como só há **uma participação ativa por pessoa** (índice parcial, §1), o caso
ambíguo é fechado no banco, não na convenção.

**O snapshot vence o override depois que a trilha existe.** Editar
`config_override` não regenera trilha — a trilha serve o que foi carimbado. A UI
tem que dizer isso, senão o campo de tela e a régua do servidor divergem em
silêncio, que é uma classe de bug que este projeto já pagou.

**Tipado chave a chave, nunca merge genérico.** As flags são booleanas, e um
merge com `||` perde `false` — a turma nunca conseguiria *desligar* o que a
empresa ligou, que é metade do caso de uso. Arrays
(`competencias_regular_duo`) substituem, não concatenam. `cadencia` precisa de
sobrescrita parcial por chave.

| Escopo | Chaves |
|---|---|
| **Empresa** | `ai.*`, `perfil_externo_fonte`, `is_demo`, `default_locale`, branding, `envios.*`, **`modulos`** (o que está disponível), **`votacao_ativa`** |
| **Turma** | `perfil_comportamental_liberado`, `mapeamento_cenarios_liberado`, `programa_modo`, `competencias_regular_duo`, calendário, cadência **planejada**, etapas instanciadas |
| **Participação** | `config_override` — exceção daquela entrada, não da pessoa |
| **Trilha** | `data_inicio` real, snapshot congelado (vence tudo acima) |
| **Remetente/fila** | throughput, saúde do número, prioridade — não é da empresa (§7) |

**`votacao_ativa` fica na empresa, de propósito.** O resultado da votação grava
em `cargos_empresa.top5_workshop` — por **cargo**, sem versão por turma. Duas
turmas do mesmo cargo votando disputariam o mesmo registro. Votação por turma
exigiria versionar o perfil ideal, e isso é F1 — que continua institucional
(§4). Decisão do MVP, não omissão.

> **Nenhum consumidor lê `empresas.sys_config` direto** para uma chave de nível
> turma. Um guard de teste varre os 43 arquivos e falha fora da allowlist.
> Precedente: `nivelDaNota` esteve em 10 cópias e a divergência vazou para o
> documento final do cliente.

## 4. Painel: lista de turmas, workspace por turma

- `/admin-v2/cliente?empresa=X` lista as turmas como linhas; operar exige entrar
  numa (`&turma=Y`), com faixa fixa de escopo no topo.
- **Nenhum agregado sem denominador da turma.**

| Turma | Pessoas | Estado | Distribuição | Próxima ação |
|---|---|---|---|---|
| Diretores 2026.2 | 127 | diagnóstico aberto | 38 responderam · 38/38 avaliados | gerar trilha para 38 elegíveis |
| Professores 2026.2 | 156 | diagnóstico inicial | 10 responderam · 0/10 avaliados | avaliar respostas · seguir mobilização |

**Nem a turma tem fase única.** Os diretores podem começar a jornada enquanto os
atrasados ainda respondem o diagnóstico: o estado operacional
(`diagnóstico aberto`, `trilhas em geração`, `jornada ativa`) vem **acompanhado
da distribuição**, nunca a substituindo. E o roteiro varia por turma — a turma
com Pulso contratado tem T0/T2 no calendário; a sem Pulso não os tem.

**F0/F1 continuam por empresa.** Base, cargos, Top 10, gabarito e cenários vivem
em `cargos_empresa` — já são por cargo, e duas safras do mesmo cargo devem
compartilhar o perfil ideal. Só **F2/F3/F4** viram por turma. O painel fica:
régua institucional no topo, lista de turmas abaixo.

**No gestor**, `semana_media` morre e vira distribuição, com coluna de turma. O
escopo do gestor (`gestor_email`) é ortogonal: as duas réguas se compõem.

**Piso de N ao segmentar — só onde ele cabe.** Segmentar por turma pode reduzir
um agregado seguro a 2–3 pessoas: *todo indicador anônimo ou comportamental
segmentado por turma respeita a política canônica de anonimato* (`PULSE_MIN_N`,
não uma régua nova). Isso **não** se aplica a contagem operacional nominal —
"127 pessoas", "38 responderam", "89 sem diagnóstico", filas de trabalho que o
operador já tem direito de ver pessoa a pessoa. Aplicar o piso indiscriminadamente
apagaria o próprio painel. Precedente do estrago do outro lado: a demo
UniAnchieta, com N=2.

## 5. Ações em lote: escopo explícito, validado em runtime

Toda ação mutativa recebe escopo declarado — `turma`, `selecionados` ou
`empresa_inteira` (esta, escolha consciente e auditada, nunca default).

> Com **duas ou mais turmas ativas**, ação de lote sem escopo é **erro**.

Com prévia antes de executar — *"38 elegíveis · 89 sem diagnóstico concluído · 0
professores incluídos"* — e registro em `admin_audit_log` com `turma_id` e
contagem do alvo.

**A garantia vem de Zod.** O motivo primário não é o `strict: false` do
`tsconfig` — é que **todo export `'use server'` é endpoint HTTP** e o escopo
chega do cliente: tipo TypeScript não existe em runtime e não defende endpoint
nenhum. A validação vive no schema dentro de `protectedAction`, que já é o
pedágio de toda action. O `strict: false` (e a decisão registrada em
`lib/access-gates/types.ts` de evitar union discriminada) é razão adicional para
não *confiar* na exaustividade do tipo — mas nada impede ter os dois: o `type`
ajuda quem escreve, o `z.discriminatedUnion` protege quem recebe.

## 6. Importação: "Sem turma", nunca turma default

- empresa com **uma** turma (todos os clientes de hoje): backfill automático,
  compatibilidade total;
- empresa **multiturma**: importação aceita, pessoas ficam em **"Sem turma"**;
- pessoa sem turma **não recebe ação em lote nem comunicação**;
- **"Sem turma: 156" é um contador visível na tela.**

Mandar importado para uma turma default enfiaria a leva nova de professores
dentro da turma antiga de diretores — decisão errada, silenciosa. E bloqueio
silencioso é o mesmo defeito do `adiadosPorTeto`: proteção que ninguém vê vira
gente sem conteúdo sem ninguém saber.

## 7. WhatsApp: a capacidade é do remetente

O próprio código já registra (`lib/fase4/trigger-diario-empresa.ts:118-121`):

> *"com o fan-out, cada empresa é uma lambda, e o espaçamento é POR EMPRESA —
> duas empresas em paralelo somam taxa no MESMO número. O intervalo por empresa
> é, portanto, um teto otimista."*

E turmas **agravam** isso: se a cadência virar unidade de fan-out por turma, duas
turmas da mesma empresa passam a somar taxa no mesmo número — o defeito que hoje
existe entre empresas, multiplicado. O incidente de 11/08 (155 mensagens a
2s/msg derrubaram o número em 1min47) mostra que não há folga para absorver.

**Cadência planejada por turma; execução serializada por remetente.** A fila do
número aplicaria prioridade por SLA (pílula de jornada tem data contratada;
convite de onboarding é campanha recuperável), reserva para entregas de jornada e
justiça entre turmas para evitar starvation — "jornada antes de onboarding" é
padrão inicial, não prioridade absoluta permanente.

> ⛔ **Isto é um projeto à parte, e não entra na fatia vertical — nem como
> follow-up automático.** Uma fila por remetente com prioridade e reserva exige
> um coordenador *cross-lambda* com estado compartilhado (provavelmente
> Trigger.dev): é a mudança mais cara deste documento inteiro. Merece desenho
> próprio, e o gatilho natural é o segundo número/remetente entrar em operação.

O que **entra** agora é o mínimo que torna o problema visível, e é barato:
`adiadosPorTeto` reportado **por turma**, e `notification_deliveries` (mig 198)
com `turma_id` **na entrega** — join com o vínculo vivo faria quem muda de turma
reescrever o próprio passado.

## 8. Kits e alarmes

`levantarPlanoKitsCoorte(sb, empresaId, opts)` recebe `turmaId`. Hoje "coorte" =
empresa: `inicioMaisCedo` mistura turmas e o horizonte soma semana 5 de uma com
semana 1 da outra — e como as janelas são `semanas: number[]`, **"semana 5" de
duas turmas são datas diferentes**. `pulse_mv_aggregates` ganha
`group_type: 'turma'` (extensão natural de `company|area|cargo`).

Vocabulário: `coorte` no código significa "empresa". Ao introduzir turma, ou vira
sinônimo ou é renomeado — sem meio-termo. "Turma" é a palavra da Secretaria.

---

## Rollout: fatia vertical para Macaé

Fundação, painel e ações críticas **na mesma entrega**, atrás de feature flag só
para Macaé. Publicar o painel antes dos botões seria pior que o estado atual:
hoje o operador desconfia do número; com escopo aparente e botão empresa-wide,
ele confia. Painel que promete escopo sem entregá-lo é armadilha.

1. `turmas` + `turma_membros` + **FKs compostas completas** + índice parcial de
   participação ativa (**migration 210** — 200 a 209 já existem, e há um arquivo
   com nomenclatura `supabase-cli` no meio da série
   (`20260807130321-…`): conferir `ls migrations/` no instante de criar);
2. backfill de uma turma legada por empresa (Ibipeba: 36 trilhas, nada muda);
3. resolvedor tipado com os 5 níveis + `config_override` da participação, com
   guard;
4. criação explícita de "Diretores escolares — 2026.2" e "Professores — 2026.2";
5. dashboard por turma;
6. escopo obrigatório nos **três fluxos críticos**: IA4, geração de trilhas,
   convites — incluindo `novaJornada`/`turma.data_inicio` na geração (§1);
7. `admin_audit_log` com `turma_id` e contagem do alvo;
8. E2E no `acme-demo` + `npm run smoke` **antes** de ligar a flag para Macaé.

**O Pulso sai da fatia vertical.** Nenhum cliente o usa e Macaé não o contratou:
refatorar ciclo, enum, assignments e MV na primeira entrega adiciona risco sem
tocar a dor urgente. Vira frente própria — `pulse_ciclos.turma_id`,
`pulse_assignments.turma_membro_id`, `aguardando_t2`, e `pulse_mv_aggregates` com
`group_type: 'turma'` (que é **DROP/CREATE da MV + refresh**, não `ALTER`).

**Exceção:** o **gate de contratação** (`sys_config.modulos`) pode e deve entrar
já, como correção independente — é o que impede outro rascunho virar entrega
real. Não bloqueia a fundação de turmas nem depende dela.

Depois: kits e health por turma, cadência e entregas tagueadas, dashboard do
gestor, relatórios históricos, e o resto das 63 varreduras — com guard +
allowlist, para que o pendente seja **visível**. E, em frente separada com
desenho próprio, a fila por remetente (§7).

**Higiene de documentação, no mesmo lote:** `docs/ARQUITETURA.md:1551` e
`docs/FEATURES-E-BENEFICIOS.md:233` descrevem `sys_config.pulse_stage`
(`experimental|calibrating|production`) como funcionalidade existente — e o
código tem **zero ocorrências**. Enquanto os dois ficarem de pé, ensinam o
errado sobre exatamente a área que esta proposta mexe.

### Sequenciamento

**A feira do CONARH é 18–20/08** (janela do sprint: 29/07 → 17/08). Os passos 1–3
são neutros em comportamento e podem entrar agora. A **fatia visível** (painel +
botões com escopo), mesmo atrás de flag, fica para **depois de 20/08** — o
admin-v2 está sendo construído nesta mesma semana e as superfícies colidem.

**Janela de ouro:** Macaé segue com **0 trilhas**. Se a fundação entrar antes da
primeira geração, as trilhas nascem já carimbadas — zero retrabalho. Os 38
diretores estão prontos desde 11/08; o custo de esperar é menor que o de estampar
turma depois.

### Critérios de aceite

- Liberar o diagnóstico dos professores não altera gate nenhum dos diretores.
- Gerar trilhas para diretores nunca lista professor como candidato.
- Empresa com uma turma se comporta exatamente como hoje.
- **Trilha sem carimbo de turma (`turma_membro_id` NULL) resolve config
  exatamente como hoje — empresa → default —, sem erro e sem mudança de
  comportamento.** É o que protege Ibipeba e o `acme-demo` na transição.
- **Gerar a primeira trilha de uma nova participação incrementa a temporada, usa
  `turma.data_inicio` e não modifica nenhuma trilha anterior.**
- A mesma pessoa entra numa turma posterior sem perder histórico, e nenhuma
  exceção da participação antiga vaza para a nova.
- Indicador anônimo segmentado por turma respeita `PULSE_MIN_N`; contagem
  operacional nominal não é suprimida.
- Importado sem turma não recebe comunicação — e aparece como pendência contada.
- Sem módulo contratado, não se cria ciclo nem assignment.
- Fluxo ponta a ponta validado no `acme-demo` + `npm run smoke` verde antes de a
  flag ligar para Macaé.

## O que NÃO entrou (pendente, de propósito)

| Item | Por quê |
|---|---|
| **Fila por remetente** (§7) | Projeto à parte: exige coordenador *cross-lambda* com estado compartilhado. O que entrou foi o mínimo — escopo obrigatório no disparo em lote. `adiadosPorTeto` por turma e `notification_deliveries.turma_id` ficam para a mesma frente. |
| **Pulso ↔ turma** (`pulse_ciclos.turma_id`, `pulse_assignments.turma_membro_id`, `aguardando_t2`, `group_type: 'turma'`) | Nenhum cliente usa o módulo; refatorar ciclo, enum e MV junto com a fundação adicionaria risco sem tocar a dor. O **gate de contratação** entrou (era o que impedia rascunho virar entrega real). |
| **`turma_etapas`** | Enquanto o Pulso for a única etapa contratável, o resolvedor tipado resolve. Motor de roteiro antes de dois clientes com roteiros diferentes vira builder que não fecha. |
| **Kits e health por turma** (§8) | `levantarPlanoKitsCoorte` segue por empresa. Com uma turma por cliente em jornada (só Ibipeba hoje), não há mistura de horizonte ainda. |
| **Cadência por turma** | Depende da fila por remetente — cadência por turma como unidade de fan-out multiplicaria o problema de 11/08. Allowlist declarada no guard. |
| **As 63 varreduras restantes** | Os 3 fluxos críticos foram escopados. O resto precisa de guard com allowlist para ser **visível**. |

## Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| **Um tenant por turma** | Duplica cargos/competências, quebra DNA Organizacional e Ranking (que são por empresa), a secretaria vira dois clientes, e o repo já pagou por "158 pessoas no tenant errado". |
| **Só filtro de turma na UI** | Não toca flags de etapa nem lotes — onde a dor está. Maquiagem. |
| **Turma implícita por `data_inicio`** | A turma precisa existir **antes** da trilha: 283 pessoas, 0 trilhas. E não tem onde pendurar override de config. |
| **Turma = `pulse_ciclos`** | O Pulso é módulo opcional; empresa que não o contrata ficaria sem turma. |
| **`escola_id`** (mig 126) | Eixo organizacional, não temporal. Ortogonal — convivem. |

## Riscos

- **Deixar `pulse_ciclos` fazendo papel de turma.** Enquanto `em_jornada` viver
  no ciclo, há dois donos do estado da turma — e o cliente sem Pulso não tem
  nenhum. Risco nº 1.
- **Construir o motor de roteiro cedo demais.** `turma_etapas` com tipo aberto
  vira builder e nunca fecha.
- **Cadência por turma multiplicando o fan-out** no mesmo número (§7).
- **Turma tratada como cargo** — campo próprio; sugestão por cargo só como atalho
  de importação.
- **As 63 varreduras**: a fatia vertical fecha 3 fluxos; o resto precisa de guard
  com allowlist (precedente: `docs/service-role-allowlist.md`).
- **Fonte única sem guard não sobrevive** — `nivelDaNota`.

## Decisões pendentes

1. Nome da entidade: **turma** (recomendado — é a palavra da Secretaria) ou
   coorte.
2. Turmas de Macaé: "Diretores escolares — 2026.2" / "Professores — 2026.2"?
3. Gestor: visão consolidada com coluna de turma (recomendado) ou uma por vez.
4. Prioridade de fila: jornada antes de onboarding como padrão inicial.

### Já decididas

| Decisão | Resolução |
|---|---|
| Turma absorve `pulse_ciclos`? | **Não.** O Pulso é opcional; quando contratado, é etapa da turma (12/08) |
| Onde registrar "contratado" | **`empresas.sys_config.modulos`** — sem tabela nova (12/08) |
| Pulso contratado em Macaé? | **Em lugar nenhum.** O ciclo existente era rascunho; excluído em 12/08 |

---

<details>
<summary>Histórico de revisões</summary>

- **v1** (12/08) — proposta inicial: turma como entidade, `colaboradores.turma_id`,
  precedência de 3 níveis, fail-closed em lote.
- **v2** — revisão crítica externa: capacidade de WhatsApp é do remetente (não da
  empresa); "Sem turma" no lugar de default silenciosa; rollout em fatia vertical;
  `turma_membros` como tabela; escopo por Zod; FK composta.
- **v3** — o Pulso é módulo opcional, logo é **etapa** da turma e não a turma.
  Cai o argumento "40 de 127" (era recorte da etapa, não da turma).
- **v4** — contratação em `sys_config.modulos`; nenhum cliente tem Pulso; o ciclo
  rascunho de Macaé foi excluído.
- **v5** (13/08) — consolidação: texto reescrito sem as camadas de correção,
  números remedidos.
- **v7** (13/08) — **implementado**: mig 210, `lib/turmas/`, gate de módulo,
  escopo fail-closed nos 3 fluxos, painel atrás de flag, gestor sem
  `semana_media`, turmas de Macaé criadas. Ver "O que NÃO entrou".
- **v6** (13/08) — segunda revisão externa. FKs compostas em **todos** os
  vínculos (o SQL da v5 prometia isolamento que não entregava); uma participação
  ativa por pessoa via índice parcial; reentrada exige `novaJornada` +
  `turma.data_inicio` (senão sobrescreve a trilha anterior);
  `turma_membros.config_override`; `pulse_assignments.turma_membro_id`;
  `em_jornada` → `aguardando_t2` (era estado legítimo com nome emprestado);
  `votacao_ativa` fica na empresa (o resultado é por cargo); piso de N só para
  indicador anônimo; §7 explicitamente fora da fatia; Pulso sai da entrega
  inicial; sequenciamento pós-CONARH.

Detalhe de cada rodada no histórico do git (`git log -- docs/TURMAS.md`).
</details>
