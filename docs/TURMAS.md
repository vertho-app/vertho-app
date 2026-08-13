# Turmas (coortes) — proposta de arquitetura

> **Status: PROPOSTA — nada implementado.** Consolidada em 13/08/2026 a partir de
> quatro rodadas de revisão (histórico no fim). Enquanto estiver com este
> cabeçalho, não é descrição do sistema: descreve o que se propõe construir.

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
create table turmas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  nome         text not null,                  -- "Diretores escolares — 2026.2"
  status       text not null default 'planejada',
  data_inicio  date,
  sys_config   jsonb not null default '{}',    -- override tipado (§3)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, empresa_id)                      -- alvo da FK composta
);

create table turma_membros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  turma_id       uuid not null,
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  status         text not null default 'ativo',  -- ativo|removido|concluido
  entrou_em      date not null default current_date,
  saiu_em        date,
  foreign key (turma_id, empresa_id) references turmas(id, empresa_id),
  unique (turma_id, colaborador_id)
);

alter table trilhas add column turma_membro_id uuid references turma_membros(id);
```

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

**FK composta, não FK simples.** `turma_membros` referencia
`turmas(id, empresa_id)`. Como o app roda em `service_role` (BYPASSRLS), a única
garantia real de que turma, membro e trilha são do mesmo tenant é a que o
Postgres impõe; FK por UUID solto não impede cruzar empresa.

**Turma não é cargo.** Em Macaé os eixos coincidem hoje; coincidência não é
modelo — a safra 2026.2 pode ter professores e diretores juntos. E não é
`escola_id` (mig 126), que é eixo organizacional, não temporal: em Macaé os dois
cargos estão nas mesmas escolas. Os eixos convivem.

## 2. Módulos opcionais: o Pulso é uma etapa da turma

O Pulso é **contratado à parte**. Quando contratado, é **uma etapa da turma** —
logo a turma não pode ser o `pulse_ciclos`: empresa sem Pulso ficaria sem turma.

Mas `pulse_ciclos` (mig 096) **foi esticado para fazer o papel de turma**, na
falta de um container. A prova está no próprio enum:

```
pulse_ciclos.status = draft | t0_aberto | em_jornada | t2_aberto | encerrado
                                          ^^^^^^^^^^ não é estado do Pulso
```

A migração **desfaz** o esticamento: `em_jornada` vira estado da turma; o resto
continua no ciclo, que ganha `turma_id`.

```sql
alter table pulse_ciclos add column turma_id uuid;  -- etapa, não container
```

**Regra geral que fica:** os participantes de uma etapa são **subconjunto** dos
membros da turma, nunca uma lista paralela. `pulse_assignments` continua
existindo, validado contra `turma_membros`.

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
resolverConfigEfetiva(colab, turmaMembro, turma, empresa) -> ConfigEfetiva
// precedência: colaborador → turma → empresa → default
```

**Tipado chave a chave, nunca merge genérico.** As flags são booleanas, e um
merge com `||` perde `false` — a turma nunca conseguiria *desligar* o que a
empresa ligou, que é metade do caso de uso. Arrays
(`competencias_regular_duo`) substituem, não concatenam. `cadencia` precisa de
sobrescrita parcial por chave.

| Escopo | Chaves |
|---|---|
| **Empresa** | `ai.*`, `perfil_externo_fonte`, `is_demo`, `default_locale`, branding, `envios.*`, **`modulos`** (o que está disponível) |
| **Turma** | gates de etapa, `programa_modo`, `competencias_regular_duo`, calendário, cadência **planejada**, etapas instanciadas |
| **Pessoa/trilha** | exceções individuais, `data_inicio` real, snapshot congelado |
| **Remetente/fila** | throughput, saúde do número, prioridade — não é da empresa (§7) |

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

**Piso de N ao segmentar.** Segmentar um agregado seguro em turmas pode produzir
grupos de 2–3 pessoas — reusar `PULSE_MIN_N`, não inventar régua. Precedente do
estrago: a demo UniAnchieta, com N=2.

## 5. Ações em lote: escopo explícito, validado em runtime

Toda ação mutativa recebe escopo declarado — `turma`, `selecionados` ou
`empresa_inteira` (esta, escolha consciente e auditada, nunca default).

> Com **duas ou mais turmas ativas**, ação de lote sem escopo é **erro**.

Com prévia antes de executar — *"38 elegíveis · 89 sem diagnóstico concluído · 0
professores incluídos"* — e registro em `admin_audit_log` com `turma_id` e
contagem do alvo.

**A garantia vem de Zod, não do tipo.** Union discriminada por `kind` não serve
aqui: `tsconfig.json` tem `strict: false`, e `lib/access-gates/types.ts`
documenta a decisão de evitar union discriminada *"porque este projeto não
estreita de forma confiável"*. O escopo é validado por schema dentro de
`protectedAction`, que já é o pedágio de toda action.

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
número aplica prioridade por SLA (pílula de jornada tem data contratada; convite
de onboarding é campanha recuperável), reserva para entregas de jornada e justiça
entre turmas para evitar starvation — "jornada antes de onboarding" é padrão
inicial, não prioridade absoluta permanente. `adiadosPorTeto` reportado **por
turma**.

`notification_deliveries` (mig 198) recebe `turma_id` **na entrega** — join com o
vínculo vivo faria quem muda de turma reescrever o próprio passado.

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

1. `turmas` + `turma_membros` + FKs compostas (**migration 210** — 200 a 209 já
   existem; conferir `ls migrations/` no instante de criar);
2. backfill de uma turma legada por empresa (Ibipeba: 36 trilhas, nada muda);
3. `pulse_ciclos.turma_id` e o enum desesticado (`em_jornada` sai do ciclo) —
   nada a converter, o rascunho foi excluído em 12/08;
4. `sys_config.modulos` + gate de módulo (sem contratação, não se cria ciclo);
5. criação explícita de "Diretores escolares — 2026.2" e "Professores — 2026.2";
6. resolvedor tipado empresa → turma → pessoa, com guard;
7. dashboard por turma;
8. escopo obrigatório nos **três fluxos críticos**: IA4, geração de trilhas,
   convites;
9. `admin_audit_log` com `turma_id` e contagem do alvo.

Depois: kits e health por turma, cadência e entregas tagueadas, dashboard do
gestor, relatórios históricos, e o resto das 63 varreduras — com guard +
allowlist, para que o pendente seja **visível**.

**Janela de ouro:** Macaé segue com **0 trilhas**. Se a fundação entrar antes da
primeira geração, as trilhas nascem já carimbadas — zero retrabalho. Os 38
diretores estão prontos desde 11/08; o custo de esperar é menor que o de estampar
turma depois.

### Critérios de aceite

- Liberar o diagnóstico dos professores não altera gate nenhum dos diretores.
- Gerar trilhas para diretores nunca lista professor como candidato.
- Empresa com uma turma se comporta exatamente como hoje.
- Importado sem turma não recebe comunicação — e aparece como pendência contada.
- A mesma pessoa entra numa turma posterior sem perder histórico.
- Agregado por turma respeita `PULSE_MIN_N`.
- Sem módulo contratado, não se cria ciclo nem assignment.
- `pulse_ciclos` e `turmas` não coexistem como entidades concorrentes.

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

Detalhe de cada rodada no histórico do git (`git log -- docs/TURMAS.md`).
</details>
