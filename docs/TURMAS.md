# Turmas (coortes) — proposta de arquitetura

> **Status: PROPOSTA (v3, 12/08/2026) — nada implementado.** Enquanto estiver com
> este cabeçalho, não é descrição do sistema.
>
> **v2** incorporou uma revisão crítica externa: teto de WhatsApp, importação sem
> turma e ordem de rollout estavam **errados** na v1.
> **v3** corrige a hierarquia de §0 — o Pulso é **módulo opcional** e, quando
> contratado, é **etapa de uma turma**; logo a turma não pode ser o
> `pulse_ciclos`, e o ciclo vira filho.
> **v4** fecha duas decisões (contratação em `sys_config`; nenhum cliente tem
> Pulso — o ciclo existente é rascunho, §0.1). Marcações `[v2]`…`[v4]` apontam o
> que mudou em cada rodada.

## O problema em uma frase

A plataforma tem **dois relógios**, e só um existe de verdade:

1. **Relógio do participante** — já funciona. `semanaLiberadaPorData`
   (`lib/season-engine/week-gating.ts:29`) libera a semana N em
   `trilhas.data_inicio + (N-1)*7`, **por trilha**. Pessoas em semanas diferentes
   já convivem sem conflito.
2. **Relógio do operador** — não existe. Painel, ações em lote, flags de
   liberação de etapa, cadência de envio e alarmes tomam **`empresa_id` como
   unidade**. O pressuposto embutido é "empresa = uma coorte, numa fase".

Enquanto o cliente tinha uma turma só, os dois relógios coincidiam. Macaé quebra
a coincidência.

---

## §0 `[v3]` `pulse_ciclos` foi esticado para fazer papel de turma

Medido em produção (12/08):

```
pulse_ciclos: "Piloto Macaé — 1º Semestre 2026"
  status      em_jornada          (draft|t0_aberto|em_jornada|t2_aberto|encerrado)
  t0_aberto   2026-05-14
  membros     40 pulse_assignments — 100% Diretor(a) Escolar
```

O ciclo de Pulso (mig 096) tem, hoje, quase tudo que se pediria de uma turma:
nome com safra, status operacional, calendário (T0/T2), lista explícita de
membros, agregados com `group_type` (`company|area|cargo`, mig 130) e piso de
anonimato (`PULSE_MIN_N = 7`). 51 referências em 22 arquivos, com CRUD em
`/admin/empresas/[id]/pulso`.

`[v3]` **Isso não faz dele a turma — faz dele um sintoma.** O Pulso é **módulo
opcional, contratado à parte**; quando contratado, é **uma etapa da turma**. Uma
empresa que não contrata Pulso não pode ficar sem turma, então a turma não pode
ser o ciclo.

A prova de que o ciclo foi esticado está no próprio enum: **`em_jornada` não é
estado do Pulso** — é estado da turma. Na falta de um container, o único objeto
que tinha nome, janela e membros virou o container. A migração tem que
**desfazer** esse esticamento, não preservá-lo:

| | Hoje (ciclo faz os dois papéis) | Depois |
|---|---|---|
| `draft`, `t0_aberto`, `t2_aberto`, `encerrado` | `pulse_ciclos.status` | continua no ciclo |
| `em_jornada` | `pulse_ciclos.status` | **vira estado da turma** |

**Direção:** `turmas` é o container primário e independente do Pulso;
`pulse_ciclos` ganha `turma_id` e passa a ser **uma etapa instanciada** da turma.

`[v3]` **Correção de um argumento da v2.** A v2 usou "40 de 127 diretores" como
prova de que o recorte da turma não é derivável de atributo. Com o Pulso sendo
etapa, esses 40 são o recorte **da etapa** — possivelmente uma amostra da turma —
e não dizem quem é da turma. O argumento cai; a conclusão (`turma_membros` como
tabela) sobrevive por outras razões, em §1.

Fica, no lugar, uma regra de desenho que os dados sustentam: **os participantes
de uma etapa são um subconjunto dos membros da turma**, nunca uma lista paralela.
`pulse_assignments` continua existindo, validado contra `turma_membros`.

### `[v4]` §0.1 O ciclo que existe é rascunho — o Pulso nunca rodou

Confirmado com o Rodrigo (12/08): **não há Pulso contratado em nenhum cliente.**
Os números batem:

```
pulse_responses          0
assignments não-pending  0    (os 40 seguem 'pending' desde 14/05 — 3 meses)
pulse_mv_aggregates      0
```

O ciclo "Piloto Macaé" era um **rascunho de 14/05 abandonado**, não uma edição
real — **excluído em 12/08** (autorizado pelo Rodrigo). O backup completo do
ciclo e dos 40 assignments está em `admin_audit_log`, ação
`pulse.rascunho.excluir`. Restou só "Ibipeba Ciclo1" (draft, 0 assignments).

Motivo de urgência da exclusão, achado no caminho: os 40 assignments tinham
`due_date = NULL`, o filtro de pendentes (`lib/home/loaders.ts:498`) deixa NULL
passar e a home (`app/dashboard/page.tsx:377`) renderiza o card sem outra
condição — **40 diretores recebiam um card "Pulso T0" havia 3 meses**, de um
módulo que ninguém contratou.

Consequências:

- **Nada a converter no backfill.** `pulse_ciclos.turma_id` nasce vazio, o que
  torna a mudança trivial.
- O esticamento do enum (§0) fica **ainda mais claro**: `em_jornada` foi marcado
  para refletir que a *turma* andou, com o Pulso parado desde o primeiro dia.
- ⚠️ **O módulo inteiro é código que nunca foi exercitado com dado real** — 51
  referências em 22 arquivos, MV de agregados, dual-AI, triangulação, piso de
  anonimato: tudo escrito, nada rodado. Quando for vendido, a primeira execução
  real será num cliente pagante. Mesma classe já registrada no health-check ("os
  4 modos nasceram sem nunca rodar"): rodar uma vez em tenant de demo antes de
  ligar em cliente.

### `[v3]` Contratação: não existe lugar para registrar

Achado ao verificar: **não há registro de módulo contratado**. `pulse_stage`
(`experimental|calibrating|production`) foi citado na mig 096 como "fica em
`empresas.sys_config`, não precisa de DDL" e **nunca foi implementado** — zero
ocorrências no código. Não existe `modulos_contratados` nem equivalente. O
colaborador vê o Pulso pela simples existência de um `pulse_assignment`
(`lib/home/loaders.ts:498`), e qualquer admin pode criar ciclo para qualquer
empresa.

Duas coisas diferentes precisam de lugar, e a distinção importa comercialmente:

- **Disponível** (a empresa contratou o módulo) → `[v4]` `empresas.sys_config.modulos`;
- **Instanciado** (esta safra vai usar) → etapa da turma.

A Secretaria pode contratar Pulso e aplicá-lo só na turma de diretores. Sem essa
separação, "contratou" e "está rodando" viram a mesma flag — e aí não há como
vender o módulo para a próxima turma sem religar a anterior.

`[v4]` **O gate de módulo é o pedágio que falta hoje**: sem ele, criar ciclo e
gerar assignment não têm régua nenhuma — foi assim que 40 pessoas ficaram com uma
etapa pendente de um módulo que ninguém contratou.

---

## Estado atual (medido em 12/08/2026)

### Macaé — dois públicos, dois estágios

| | Diretor(a) Escolar | Professor(a) |
|---|---|---|
| Pessoas | 127 | 156 |
| Com resposta de assessment | 38 (30%) | 8 (5%) |
| Avaliadas pela IA4 | 38 (todas) | 0 |
| Primeira resposta | 23/07 | 11/08 |
| Trilhas | 0 | 0 |
| Membros do ciclo de Pulso | 40 | 0 |

Ibipeba: 36 trilhas ativas, todas com `data_inicio = 2026-07-13` — **uma coorte
só**, que é o caso que a arquitetura atual suporta.

### O que o painel mostra hoje para Macaé

`carregarClienteWorkspace` (`app/admin-v2/actions.ts:213-276`) monta 5 fases com
**um estado por empresa**:

> **F2 · Diagnóstico** — 80 respostas · 72 avaliadas pela IA
> estado: `revisao` — "8 resposta(s) sem avaliação"

- **Sem denominador de gente**: 80 linhas de resposta = 46 pessoas de 283.
- **A única "próxima ação" é a da turma nova** — as 8 sem IA4 são todas de
  professores; os 38 diretores prontos para gerar trilha somem da tela.
- **Um semáforo para dois grupos em fases diferentes** só pode estar errado para
  um deles.

Mesmo defeito em `GestorKpi.em_andamento.semana_media`
(`app/dashboard/gestor/actions.ts`): a média entre semana 1 e semana 5 é 3, que
não descreve ninguém.

### As decisões que "afetam a todos"

`empresas.sys_config` (JSONB por empresa), lido em **169 pontos de 43 arquivos**:
`perfil_comportamental_liberado`, `mapeamento_cenarios_liberado`,
`votacao_ativa`, `programa_modo`, `competencias_regular_duo`,
`blueprint_drives_trilha`, `cadencia.*`. E **63 varreduras**
`from('colaboradores').eq('empresa_id', …)` operam em lote sobre a empresa
inteira.

### O que **já** está certo e não deve ser refeito

- Gating de semana por trilha (`week-gating.ts`).
- Precedência de config em 2 níveis: `resolverModoColab`
  (`lib/season-engine/programa-config.ts`).
- **Carimbo que congela regras**: `trilhas.programa_modo` + `programa_config`.
- Gates de etapa centralizados em `lib/access-gates/` — **6 consumidores reais**.
- `[v2]` **Reentrada já tem mecanismo**: `numero_temporada`.
  `trilha-core.ts:737` **incrementa** (nunca reinicia em 1) e a UNIQUE virou
  `(empresa_id, colaborador_id, numero_temporada)` na mig 199. Hoje há **0
  trilhas** com temporada ≥ 2 — o encadeamento nunca rodou em produção.
- `[v2]` **Log de decisão já existe**: `admin_audit_log` (baseline) tem
  `acao`, `empresa_id`, `alvo` ("53 colaboradores"), `detalhes` JSONB,
  `resultado`. Não criar tabela nova — acrescentar `turma_id`.
- `[v2]` **Piso de anonimato já existe**: `PULSE_MIN_N = 7`.

---

## Proposta

### 1. Modelo

```sql
-- container primário, independente de qualquer módulo opcional (§0)
create table turmas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  nome         text not null,                  -- "Diretores escolares — 2026.2"
  status       text not null default 'planejada',
  data_inicio  date,
  sys_config   jsonb not null default '{}',    -- override tipado (§2)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, empresa_id)                      -- alvo da FK composta
);

-- [v2] vínculo é TABELA, não campo — mesmo padrão de pulse_assignments
create table turma_membros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  turma_id       uuid not null,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  status         text not null default 'ativo', -- ativo|removido|concluido
  entrou_em      date not null default current_date,
  saiu_em        date,
  foreign key (turma_id, empresa_id) references turmas(id, empresa_id),
  unique (turma_id, colaborador_id)
);

alter table trilhas add column turma_membro_id uuid references turma_membros(id);

-- [v3] etapas instanciadas da turma. Tipos são enum FECHADO em código —
-- não é um builder de roteiro livre.
create table turma_etapas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  turma_id   uuid not null,
  tipo       text not null,   -- perfil|diagnostico|votacao|pulso_t0|jornada|pulso_t2|fechamento
  ordem      smallint not null,
  status     text not null default 'planejada', -- planejada|aberta|encerrada
  abre_em    date,
  fecha_em   date,
  ref_id     uuid,            -- id do objeto da etapa (ex.: pulse_ciclos.id)
  foreign key (turma_id, empresa_id) references turmas(id, empresa_id),
  unique (turma_id, tipo, ordem)
);

alter table pulse_ciclos add column turma_id uuid;  -- etapa, não container
```

`[v2]` **Por que `turma_membros` e não `colaboradores.turma_id`.** A revisão
externa estava certa na conclusão, mas o argumento que deu ("perde o histórico")
está errado: o histórico de jornada já vive na trilha carimbada, e
`numero_temporada` já resolve reentrada. Os motivos que **os dados** sustentam:

- **Existe estado de turma antes de existir trilha.** Macaé tem 283 pessoas e 0
  trilhas: durante todo o diagnóstico o vínculo só pode viver fora da trilha.
- **A composição é decisão do operador, não consulta.** Quem entra na safra
  2026.2 é escolha — não é `where cargo = 'Diretor'`. Um campo no colaborador
  guarda "turma atual"; não guarda "quem foi selecionado, quando e por quem".
- `[v3]` **Etapa precisa de um conjunto para ser subconjunto de.** Se o Pulso é
  uma etapa aplicada a parte da turma, `pulse_assignments` tem que se validar
  contra uma lista de membros — que precisa existir.
- **Simetria com o Pulso**, que já faz exatamente isso (`pulse_assignments`).

`[v3]` **Sobre `turma_etapas`: entra quando houver a segunda etapa opcional.** As
três flags de hoje (`perfil_comportamental_liberado`,
`mapeamento_cenarios_liberado`, `votacao_ativa`) já **são** etapas —
abertas/fechadas por booleano solto no `sys_config` da empresa. `turma_etapas`
unifica isso (etapa com janela, estado e ordem) em vez de inventar conceito novo;
mas enquanto o Pulso for a única etapa contratável, o resolvedor tipado de §2
resolve o caso com as flags por turma. **Não construir o motor de roteiro antes
de existirem dois clientes com roteiros diferentes** — o enum fechado é
justamente o freio contra virar builder.

`[v2]` **O que NÃO fazer: mexer na UNIQUE de `trilhas`.** A sugestão
`UNIQUE (turma_membro_id, numero_temporada)` quebra duas coisas:

1. `trilha-core.ts:772` faz `upsert(..., { onConflict:
   'empresa_id,colaborador_id,numero_temporada' })` — o upsert atômico do header
   (F-C1 do FMEA). Trocar a constraint quebra o call-site.
2. Pior: `turma_membro_id` é NULL em toda trilha legada, e **UNIQUE não
   deduplica NULLs no Postgres**. A atomicidade morreria exatamente no caminho
   de compatibilidade — falha silenciosa, do tipo que este repo já pagou caro.

`turma_membro_id` entra como **carimbo**, ao lado de `programa_modo`/
`programa_config`. A chave continua sendo `(empresa_id, colaborador_id,
numero_temporada)`.

`[v2]` **FK composta, não FK simples.** `turma_membros` referencia
`turmas(id, empresa_id)`, não `turmas(id)`. Como o app roda em `service_role`
(BYPASSRLS), a única garantia real de que turma, membro e trilha são da mesma
empresa é a que o Postgres impõe. FK por UUID solto não impede cruzar tenant.

**Turma não é cargo.** Em Macaé os eixos coincidem hoje; coincidência não é
modelo. A safra 2026.2 pode ter professores e diretores juntos.

### 2. Config: resolvedor tipado por nível (não merge genérico)

`[v2]` A v1 falava em "merge do `sys_config`". Está errado, e o motivo é
concreto: **as flags são booleanas** (`perfil_comportamental_liberado`), e um
merge com `||` perde `false` — ou seja, a turma **nunca conseguiria desligar** o
que a empresa ligou, que é metade do caso de uso. Arrays
(`competencias_regular_duo`) precisam **substituir**, não concatenar. `cadencia`
precisa de sobrescrita parcial por chave.

O resolvedor é tipado, chave a chave, em `lib/turmas/config-efetiva.ts`:

```
resolverConfigEfetiva(colab, turmaMembro, turma, empresa) -> ConfigEfetiva
// precedência: colaborador → turma → empresa → default
```

| Escopo | Chaves |
|---|---|
| **Empresa** | `ai.*`, `perfil_externo_fonte`, `is_demo`, `default_locale`, branding, `envios.*`, `[v3]` **módulos contratados** (o que está *disponível*) |
| **Turma** | gates de etapa, `programa_modo`, `competencias_regular_duo`, calendário, cadência **planejada**, `[v3]` **etapas instanciadas** (o que esta safra *usa*) |
| **Pessoa/trilha** | exceções individuais, `data_inicio` real, snapshot congelado |
| **Remetente/fila** | throughput, saúde do número, prioridade — **não é da empresa** (§6) |

> **Nenhum consumidor lê `empresas.sys_config` direto** para uma chave de nível
> turma. Guard de teste varre os 43 arquivos e falha fora da allowlist.
> Precedente: `nivelDaNota` esteve em 10 cópias e a divergência vazou para o
> documento final.

### 3. Painel: lista de turmas, workspace por turma

`[v2]` **Nem a turma tem fase única.** Os diretores podem começar a jornada
enquanto os atrasados ainda respondem o diagnóstico. A turma tem um **estado
operacional** (`diagnóstico aberto`, `trilhas em geração`, `jornada ativa` — este
último herdado do enum do ciclo, §0) **acompanhado da distribuição**, nunca
substituindo-a. `[v3]` E o roteiro de etapas **varia por turma**: a turma com
Pulso contratado tem T0/T2 no calendário; a sem Pulso não os tem — a mesma tela
não pode presumir um roteiro fixo.

| Turma | Pessoas | Estado | Distribuição | Próxima ação |
|---|---|---|---|---|
| Diretores 2026.2 | 127 | diagnóstico aberto | 38 responderam · 38/38 avaliados | gerar trilha para 38 elegíveis |
| Professores 2026.2 | 156 | diagnóstico inicial | 8 responderam · 0/8 avaliados | avaliar respostas · seguir mobilização |

`[v2]` **F0/F1 continuam por empresa.** Base, cargos, Top 10, gabarito e cenários
vivem em `cargos_empresa` — **já são por cargo**, e duas safras do mesmo cargo
devem compartilhar o perfil ideal. Só **F2/F3/F4** viram por turma. O painel fica:
régua institucional no topo, lista de turmas abaixo.

No gestor, `semana_media` morre e vira distribuição, com coluna de turma. O
escopo do gestor (`gestor_email`) é **ortogonal**: as duas réguas se compõem.

`[v2]` **Piso de N ao segmentar.** Segmentar um agregado seguro em turmas pode
produzir grupos de 2–3 pessoas. Reusar `PULSE_MIN_N` — não inventar régua nova.
Precedente do estrago: a demo UniAnchieta, com N=2.

### 4. Ações em lote: escopo explícito, validado em runtime

Toda ação mutativa recebe escopo declarado — `turma`, `selecionados` ou
`empresa_inteira` (esta, uma escolha consciente e auditada, não um default).

`[v2]` **A garantia vem de Zod, não do tipo.** A revisão sugeriu uma union
discriminada por `kind`. Não funciona aqui: `tsconfig.json` tem **`strict:
false`**, e `lib/access-gates/types.ts` documenta a decisão de evitar union
discriminada *"porque este projeto não estreita de forma confiável
(strictNullChecks frouxo)"*. O tipo não vai forçar exaustividade. O escopo é
validado por schema Zod dentro de `protectedAction`, que já é o pedágio de toda
action.

> Com **duas ou mais turmas ativas**, ação de lote sem escopo é **erro**.

Com prévia antes de executar — *"38 elegíveis · 89 sem diagnóstico concluído · 0
professores incluídos"* — e registro em `admin_audit_log` com `turma_id` e
contagem.

### 5. `[v2]` Importação: "Sem turma", não turma default

A v1 propunha mandar importados sem turma para uma turma default. Errado: numa
empresa com várias turmas, isso enfia a nova leva de professores dentro da turma
antiga de diretores — decisão errada, silenciosa. Correto:

- empresa com **uma** turma (todos os clientes de hoje): backfill automático,
  compatibilidade total;
- empresa **multiturma**: importação aceita, pessoas ficam em **"Sem turma"**;
- pessoa sem turma **não recebe ação em lote nem comunicação**;
- e — o ponto que fecha o ciclo — **"Sem turma: 156" é um contador visível na
  tela**. Bloqueio silencioso é o mesmo defeito do `adiadosPorTeto`: proteção que
  ninguém vê vira gente sem conteúdo sem ninguém saber.

### 6. `[v2]` WhatsApp: a capacidade é do REMETENTE, não da empresa

Correção de um erro da v1. O próprio código já diz
(`lib/fase4/trigger-diario-empresa.ts:118-121`):

> *"com o fan-out, cada empresa é uma lambda, e o espaçamento é POR EMPRESA —
> duas empresas em paralelo somam taxa no MESMO número. O intervalo por empresa
> é, portanto, um teto otimista."*

E o risco que **turmas agravam**: se a cadência virar unidade de fan-out por
turma, duas turmas da mesma empresa passam a somar taxa no mesmo número —
exatamente o defeito que hoje existe entre empresas, multiplicado. O incidente de
11/08 (155 mensagens a 2s/msg derrubaram o número em 1min47) mostra que não há
folga para absorver isso.

Portanto: **cadência é planejada por turma; execução é serializada por
remetente.** A fila do número aplica prioridade por SLA (pílula de jornada tem
data contratada; convite de onboarding é campanha recuperável), reserva para
entregas de jornada, e justiça entre turmas para evitar starvation — "jornada
antes de onboarding" é padrão inicial, não prioridade absoluta permanente.
`adiadosPorTeto` reportado **por turma**.

`notification_deliveries` (mig 198, **797 linhas já gravadas**) recebe
`turma_id` **na entrega**. Não basta join com o vínculo vivo: quem muda de turma
reescreveria o próprio passado.

### 7. Kits e alarmes

`levantarPlanoKitsCoorte(sb, empresaId, opts)` recebe `turmaId`. Hoje "coorte" =
empresa: `inicioMaisCedo` mistura turmas e o horizonte soma semana 5 de uma com
semana 1 da outra — e como as janelas são `semanas: number[]`, **"semana 5" de
duas turmas são datas diferentes**. `pulse_mv_aggregates` ganha `group_type:
'turma'` (extensão natural de `company|area|cargo`).

Vocabulário: `coorte` no código hoje significa "empresa". Ao introduzir turma, ou
vira sinônimo ou é renomeado — sem meio-termo. "Turma" é a palavra da Secretaria.

---

## `[v2]` Rollout: fatia vertical para Macaé

A v1 propunha "fundação → painel → lote → envio". **Errado**, e a revisão externa
tem razão: um painel que anuncia *"38 elegíveis · gerar trilha"* enquanto o botão
ainda varre a empresa inteira é **pior que o painel de hoje** — hoje o operador
desconfia do número; com o painel por turma ele confia. Painel que promete escopo
sem entregá-lo é armadilha.

Entrega única, atrás de feature flag só para Macaé:

1. `turmas` + `turma_membros` + FKs compostas (**migration 210** — 200 a 209 já
   existem; conferir `ls migrations/` no instante de criar);
2. backfill de uma turma legada por empresa (Ibipeba: 36 trilhas, nada muda);
3. `[v4]` desesticar o enum (`em_jornada` sai do ciclo e vira estado da turma) e
   **arquivar o rascunho de 14/05** — nada a converter (§0.1);
4. criação explícita de "Diretores escolares — 2026.2" e "Professores — 2026.2";
5. resolvedor tipado empresa → turma → pessoa, com guard;
6. dashboard por turma;
7. escopo obrigatório nos **três fluxos críticos**: IA4, geração de trilhas,
   convites;
8. `admin_audit_log` com `turma_id` e contagem do alvo.

Depois: kits e health por turma, cadência/entregas tagueadas, dashboard do
gestor, relatórios históricos, resto das 63 varreduras (com guard + allowlist
para que o pendente seja **visível**).

**Janela de ouro:** Macaé tem **0 trilhas**. Se a fundação entrar antes da
primeira geração, as trilhas já nascem carimbadas — zero retrabalho. Os 38
diretores estão prontos desde 11/08; o custo de esperar é menor que o de estampar
turma depois.

### Critérios de aceite

- Liberar o diagnóstico dos professores não altera gate nenhum dos diretores.
- Gerar trilhas para diretores nunca lista professor como candidato.
- Empresa com uma turma se comporta exatamente como hoje.
- Importado sem turma não recebe comunicação — e aparece como pendência contada.
- A mesma pessoa entra numa turma posterior sem perder histórico.
- Agregado por turma respeita `PULSE_MIN_N`.
- `pulse_ciclos` e `turmas` não coexistem como entidades concorrentes.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Um tenant por turma** | Duplica cargos/competências, quebra DNA Organizacional e Ranking (por empresa), a secretaria vira dois clientes, e o repo já pagou por "158 pessoas no tenant errado". |
| **Só filtro de turma na UI** | Não toca flags de etapa nem lotes — onde a dor está. Maquiagem. |
| **Turma implícita por `data_inicio`** | A turma precisa existir **antes** da trilha: 283 pessoas, 0 trilhas. E não tem onde pendurar override. |
| **`escola_id`** (mig 126) | Eixo organizacional, não temporal. Em Macaé, professores e diretores estão nas mesmas escolas. Ortogonal — convivem. |

## Riscos

- `[v3]` **Deixar `pulse_ciclos` continuar fazendo papel de turma.** Enquanto
  `em_jornada` viver no ciclo, existem dois donos do estado da turma — e o cliente
  sem Pulso não tem nenhum. É o risco nº 1.
- `[v3]` **Construir motor de roteiro cedo demais.** `turma_etapas` com tipo
  aberto vira builder e nunca fecha. Enum fechado, e só depois da segunda etapa
  contratável.
- **Turma tratada como cargo** — campo próprio; sugestão por cargo só como atalho
  de importação.
- **Cadência por turma multiplicando o fan-out** no mesmo número — §6.
- **As 63 varreduras**: a fatia vertical fecha 3 fluxos; o resto precisa de guard
  com allowlist (precedente: `docs/service-role-allowlist.md`).
- **Fonte única sem guard não sobrevive** — `nivelDaNota`.

## Decisões pendentes

1. ~~`turmas` absorve `pulse_ciclos`?~~ **RESOLVIDO 12/08 (Rodrigo):** o Pulso é
   módulo opcional; quando contratado, é **etapa da turma**. O ciclo vira filho.
2. ~~Onde registrar "contratado"~~ **RESOLVIDO 12/08 (Rodrigo):**
   `empresas.sys_config.modulos` — sem tabela nova. Promover a `empresa_modulos`
   só se surgir necessidade de vigência/histórico de contrato.
3. ~~A contratação do Pulso em Macaé cobre as duas turmas?~~ **RESOLVIDO 12/08
   (Rodrigo): não há Pulso contratado em lugar nenhum.** Ver §0.1 — o ciclo que
   existe é rascunho. Backfill **não converte**: arquiva.
4. Nome: **turma** (recomendado) ou coorte.
5. Turmas de Macaé: "Diretores escolares — 2026.2" / "Professores — 2026.2"?
6. Gestor: visão consolidada com coluna de turma (recomendado) ou uma por vez.
7. Prioridade de fila: jornada antes de onboarding como padrão inicial.
