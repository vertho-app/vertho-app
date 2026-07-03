# Ambiente de Demonstração (ACME Demo)

Tenant `acme-demo` (empresa "ACME Demo") que os vendedores usam nas demos para clientes. Nasce com um estado rico e é resetado ao estado inicial sob demanda e toda madrugada.

## O que o cliente vê ao abrir (tudo pronto, SEM IA no reset)
- **4 personas** em estágios diferentes da jornada: **Ana** (perfil I, novo), **Paulo** (ID, parcial), **Bruna** (CS, completo), **Carla** (D, gestor).
- **DISC / Perfil Comportamental** das 4 (narrativas LLM `report_texts` congeladas → relatório abre instantâneo).
- **Mapeamento de competências avaliado** (respostas com nota da IA4 + `descriptor_assessments`): Bruna 5 competências, Paulo 2.
- **2 jornadas/trilhas** de 14 semanas: Bruna (Negociação e Fechamento) e Paulo (Orientação a Metas e Resultados).
- Envios reais **desligados** (personas com e-mail @vertho.ai interno e sem telefone → WhatsApp no-op).

## Reset
Três caminhos, uma fonte única (`lib/demo/reset-acme-demo.ts::resetAcmeDemo`, TENANT-SAFE — todo delete/insert é `.eq('empresa_id')` do acme-demo):

| Caminho | Como | Quando |
|---|---|---|
| **Sob demanda** | Botão "Resetar demo agora" em `/admin/demo` (server action `resetarDemoAcme`, gated a platform admin + `admin_audit_log`) | Vendedor prepara demo limpa na hora |
| **Noturno** | `/api/cron?action=reset_demo` (gated CRON_SECRET) + `vercel.json` `0 7 * * *` (04h BRT). Falha → 500 (log Vercel) + audit | Automático |
| **Manual** | `node scripts/seed-acme-demo.mjs` (legado — clona o acme VIVO) | Fallback |

## Fixture congelado
O reset semeia de `lib/demo/acme-demo-fixture.json` (golden state VERSIONADO), **não** do acme vivo → a demo é estável e imune a mexidas no `acme`. O fixture guarda:
- Estrutura: empresa + competências + cargos + top10 + cenários (com source ids para remapeamento).
- `personaArtifacts` por e-mail: respostas avaliadas + descriptor_assessments + `report_texts` + trilha (row + progresso semanal).

Os artefatos pesados são **gerados 1x e congelados**, replicados no reset sem custo de IA (best-effort — falha num artefato não derruba o reset, só deixa a demo sem aquele item).

## Como ATUALIZAR o golden state
Quando quiser um novo estado de referência (ex.: após mudar competências no acme, ou melhorar as personas):

1. Resetar o acme-demo (estado base): botão `/admin/demo` ou `node scripts/seed-acme-demo.mjs`.
2. Rodar os pipelines pesados no acme-demo (usam a flag `internal` — sem UI):
   - **IA4** (mapeamento avaliado): `rodarIA4(demoEmpresaId, {}, { internal: true })` — ~100s/resposta.
   - **Relatórios DISC**: `gerarEsalvarRelatorioComportamental({ colabId })` por persona.
   - **Trilhas**: `gerarTemporadaInternal(colabId, 'Competência COM descriptor_assessments')` — a competência PRECISA ter avaliação, senão erra.
3. Capturar: `node scripts/capture-acme-fixture.mjs` (dumpa estrutura do acme + artefatos do acme-demo → fixture).
4. Commitar o `acme-demo-fixture.json`.

## Pegadinhas
- `descriptor_assessments.nivel` é coluna **GENERATED ALWAYS** — capture/replay a descartam (senão o insert falha).
- `gerarTemporada` exige competência COM `descriptor_assessments` — passar `competencia` válida.
- O render do PDF via tsx falha (`Font family not registered: NotoSans`) — mas `report_texts` salva ANTES, e o PDF regenera on-demand no app (o que congelamos é o `report_texts`, não o binário).

## Follow-ups (não feitos)
- Gate de envio central por tenant-demo (hoje protege pelas personas, não por código de envio).
- Tenant por vendedor (`acme-demo-<rep>`) contra colisão simultânea — o reset sob demanda mitiga.
- Season "em ANDAMENTO" de verdade (a trilha nasce gerada mas sem semanas concluídas).
