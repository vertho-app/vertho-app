# Ambiente de Demonstração (ACME Demo)

Tenant `acme-demo` (empresa "ACME Demo") que os vendedores usam nas demos para clientes. Nasce com um estado rico e é resetado ao estado inicial sob demanda e toda madrugada.

## O que o cliente vê ao abrir (tudo pronto, SEM IA no reset)
- **6 personas** em estágios diferentes da jornada e em **áreas diferentes** (mostra que a plataforma vai além do comercial):
  - **Ana** (Representante Comercial, I, novo), **Paulo** (Rep. Comercial, ID, parcial), **Bruna** (Rep. Comercial, CS, completo), **Carla** (Gerente Comercial, D, gestora).
  - **Mariana** (Analista Financeiro, CS, completo) e **Renato** (Coordenador de Operações, DS, novo) — cargos fora de vendas (Financeiro e Operações).
- **DISC / Perfil Comportamental** das 6 (narrativas LLM `report_texts` congeladas → relatório abre instantâneo).
- **Mapeamento de competências avaliado** (respostas com nota da IA4 + `descriptor_assessments`): Bruna 5, Mariana 5 (30 `descriptor_assessments` congelados), Paulo 2.
- **2 jornadas/trilhas** de 14 semanas: Bruna (Negociação e Fechamento) e Paulo (Orientação a Metas e Resultados).
- **4 cargos completos** (competências + descritores + Top10 + cenários com rubrica N1-N4): Representante Comercial, Gerente Comercial, Analista Financeiro, Coordenador de Operações.
- **Adequação / Ranking real por cargo**: as personas nascem com colunas comportamentais (`comp_*`/`lid_*`) derivadas do DISC → o motor de fit as pontua. Aderências de referência: Mariana/Financeiro **92** (Alta), Renato/Operações **88** (Excelente), Carla/Gerente **88** (Excelente), Bruna/Representante **50** (Baixa — CS não casa com D/I do cargo). ⚠️ O fit NÃO é pré-computado no reset (o colab nasce sem `fit_resultado`) → na demo, clicar **"Calcular Fit"** 1x por cargo em `/admin/fit` popula o ranking.
- Envios reais **desligados** (gate por tenant `empresas.is_demo` no `envio-guard` + personas com e-mail `*.demo@vertho.ai` interno e sem telefone → WhatsApp no-op).

## Reset
Três caminhos, uma fonte única (`lib/demo/reset-acme-demo.ts::resetAcmeDemo`, TENANT-SAFE — todo delete/insert é `.eq('empresa_id')` do acme-demo):

| Caminho | Como | Quando |
|---|---|---|
| **Sob demanda** | Botão "Resetar demo agora" em `/admin/demo` (server action `resetarDemoAcme`, gated a platform admin + `admin_audit_log`) | Vendedor prepara demo limpa na hora |
| **Noturno** | `/api/cron?action=reset_demo` (gated CRON_SECRET) + `vercel.json` `0 7 * * *` (04h BRT). Falha → 500 (log Vercel) + audit | Automático |
| **Manual (CLI)** | `npm run reset:demo` (= `npx tsx scripts/seed-acme-demo.ts`) — DELEGA ao reset canônico (mesmo fixture + artefatos do botão/cron) | CLI/scripts/CI |

## Fixture congelado
O reset semeia de `lib/demo/acme-demo-fixture.json` (golden state VERSIONADO), **não** do acme vivo → a demo é estável e imune a mexidas no `acme`. O fixture guarda:
- Estrutura: empresa + competências + cargos + top10 + cenários (com source ids para remapeamento).
- `personaArtifacts` por e-mail: respostas avaliadas + descriptor_assessments + `report_texts` + trilha (row + progresso semanal).

Os artefatos pesados são **gerados 1x e congelados**, replicados no reset sem custo de IA (best-effort — falha num artefato não derruba o reset, só deixa a demo sem aquele item).

### Cargos extra (fora do fixture)
Alguns cargos são construídos **fresco no código** do reset, não vêm do fixture:
- `DEMO_EXTRA_ROLES` (`lib/demo/reset-acme-demo.ts`) — pacote COMPLETO de **Analista Financeiro**, **Coordenador de Operações** e **Gerente Comercial** (5 competências + 6 descritores cada + Top10 + cenários). O Gerente Comercial e o Diretor Geral entram em `DEMO_EXCLUDED_ROLES` (o fixture do acme só tinha o cargo + Top5 vestigial, sem competências/cenários) — o Gerente é reconstruído aqui em pacote completo; o Diretor Geral segue fora da demo.
- Gabaritos (IA2) + cenários ricos (IA3, rubrica N1-N4 + descritores-alvo) desses 3 cargos são congelados em `lib/demo/acme-demo-extra-artifacts.json` (gerados 1x pelo pipeline headless, aplicados no reset SEM custo de IA).

### Colunas comportamentais (`comp_*`/`lid_*`)
O motor de Adequação (fit v2) lê colunas **comportamentais** do colaborador (`comp_*`/`lid_*`), DERIVADAS do DISC — **não** os `descriptor_assessments`. `insertPersonas` popula essas colunas deterministicamente do DISC (`comportamentosDoDisc`), senão o ranking sai vazio/"Não recomendado" mesmo com DISC perfeito.

### Personas visíveis nas views agregadas
As personas são `*.demo@vertho.ai` por causa do guardrail de envio, mas `isInternalEmail`/`excludeInternalEmails` (`lib/internal-emails.ts`) **isentam** `*.demo@vertho.ai` (persona ≠ staff) — assim aparecem em ranking/DNA/Perfil Organizacional. Só o `@vertho.ai` "puro" (ex.: `rodrigo@vertho.ai`) é excluído. O guardrail de ENVIO continua no `is_demo` (envio-guard), intacto.

## Como ATUALIZAR o golden state
Quando quiser um novo estado de referência (ex.: após mudar competências no acme, ou melhorar as personas):

1. Resetar o acme-demo (estado base): botão `/admin/demo` ou `npm run reset:demo`.
2. Rodar os pipelines pesados no acme-demo (usam a flag `internal` — service-role, sem UI/gate de admin):
   - **IA4** (mapeamento avaliado): `rodarIA4(demoEmpresaId, {}, { internal: true })` — ~100s/resposta.
   - **IA2** (gabaritos) / **IA3** (cenários ricos) dos cargos extra: `rodarIA2(empresaId, {}, { internal: true })` e `rodarIA3Uma(empresaId, cargo, competenciaId, ..., true)` (`actions/fase1.ts`) — para o golden update dos artefatos congelados.
   - **Relatórios DISC**: `gerarEsalvarRelatorioComportamental({ colabId })` por persona.
   - **Trilhas**: `gerarTemporadaInternal(colabId, 'Competência COM descriptor_assessments')` — a competência PRECISA ter avaliação, senão erra.
3. Capturar:
   - `node scripts/capture-acme-fixture.mjs` (dumpa estrutura do acme + artefatos do acme-demo → `acme-demo-fixture.json`).
   - `scripts/_capture-fixture-extra.mjs` / `scripts/_capture-demo-extra.mts` (gabaritos + cenários dos cargos extra → `acme-demo-extra-artifacts.json`).
4. Commitar o `acme-demo-fixture.json` (e o `acme-demo-extra-artifacts.json`, se mudou).

## Pegadinhas
- `descriptor_assessments.nivel` é coluna **GENERATED ALWAYS** — capture/replay a descartam (senão o insert falha).
- `gerarTemporada` exige competência COM `descriptor_assessments` — passar `competencia` válida.
- O render do PDF via tsx falha (`Font family not registered: NotoSans`) — mas `report_texts` salva ANTES, e o PDF regenera on-demand no app (o que congelamos é o `report_texts`, não o binário).

## Follow-ups (não feitos)
- Tenant por vendedor (`acme-demo-<rep>`) contra colisão simultânea — o reset sob demanda mitiga.
- Season "em ANDAMENTO" de verdade (a trilha nasce gerada mas sem semanas concluídas).
