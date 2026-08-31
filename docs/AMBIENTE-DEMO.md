# Ambientes de Demonstração

Tenant `acme-demo` (empresa "ACME Demo") que os vendedores usam nas demos para clientes. Nasce com um estado rico e é resetado ao estado inicial sob demanda e toda madrugada.

O tenant `gruposinal` (`https://gruposinal.vertho.ai`) é uma instância contextualizada
para o Grupo Sinal. Ele usa o mesmo fixture, as mesmas telas e as mesmas regras do
produto; o seed altera apenas a identidade e o contexto organizacional dos artefatos.
Os dois tenants permanecem com `is_demo=true` e, portanto, sem disparos automáticos reais.

## O que o cliente vê ao abrir (tudo pronto, SEM IA no reset)
- **6 participantes** em estágios diferentes da jornada e em **áreas diferentes**, mais **1 persona de RH** que consome o panorama da empresa:
  - **Ana** (Representante Comercial, IS, novo), **Paulo** (Rep. Comercial, IC, parcial), **Bruna** (Rep. Comercial, CS, completo), **Carla** (Gerente Comercial, D, gestora).
  - **Mariana** (Analista Financeiro, CS, completo) e **Renato** (Coordenador de Operações, DS, novo) — cargos fora de vendas (Financeiro e Operações).
  - **Helena** (Gerente de Recursos Humanos, papel `rh`) — sem DISC/trilha por desenho; vê o funil, colaboradores, ranking e relatórios e não entra nas métricas de participantes.
- **DISC / Perfil Comportamental** das 6 (narrativas LLM `report_texts` congeladas → relatório abre instantâneo).
- **Mapeamento de competências avaliado** (respostas com nota da IA4 + `descriptor_assessments`): Bruna 5, Mariana 5 (30 `descriptor_assessments` congelados), Paulo 2.
- **2 jornadas/trilhas** de 14 semanas: Bruna (Negociação e Fechamento) e Paulo (Orientação a Metas e Resultados).
- **4 cargos completos** (competências + descritores + Top10 + cenários com rubrica N1-N4): Representante Comercial, Gerente Comercial, Analista Financeiro, Coordenador de Operações.
- **Adequação / Ranking real por cargo**: as personas nascem com colunas comportamentais (`comp_*`/`lid_*`) derivadas do DISC → o motor de fit as pontua. Aderências de referência (medidas em 24/08, com as personas já na régua do produto): Mariana/Financeiro **95,0** (Excelente), Renato/Operações **89,1** (Excelente), Carla/Gerente **87,8** (Excelente), Paulo/Representante **83,6** mas **"Não recomendado"** (knockout de Persistência — nota alta não passa por cima de requisito eliminatório), Ana/Representante **83,3** (Alta), Bruna/Representante **46,2** (Baixa — CS não casa com D/I do cargo). ✅ **O fit é pré-computado pelo próprio reset** (`precomputarFit`, best-effort, sem custo de IA) — a aba Fit v2 de `/admin/fit` abre populada, sem ninguém precisar clicar "Calcular Fit". Antes de 25/08 não era: `fit_resultados` tem `ON DELETE CASCADE` em `colaborador_id`, o reset recria os colaboradores e o ranking **amanhecia vazio todo dia**, dependendo de um passo manual que ninguém lembra na hora da demo. A contagem sai no `counts.fit_resultados` do resultado do reset.
- Envios reais **desligados** (gate por tenant `empresas.is_demo` no `envio-guard` + personas com e-mail `*.demo@vertho.ai` interno e sem telefone → WhatsApp no-op).

## Reset
Os tenants usam uma fonte única (`lib/demo/reset-acme-demo.ts::resetDemoTenant`,
TENANT-SAFE — todo delete/insert é filtrado pelo `empresa_id` do tenant escolhido):

| Caminho | Como | Quando |
|---|---|---|
| **Sob demanda** | Seletor + botão "Recriar dados" em `/admin/demo` (server action gated a platform admin + `admin_audit_log`) | Vendedor prepara o tenant escolhido |
| **Noturno** | `/api/cron?action=reset_demo` (gated CRON_SECRET) + `vercel.json` `0 7 * * *` (04h BRT). Falha → 500 (log Vercel) + audit | Automático |
| **Manual (CLI)** | `npm run reset:demo` (= `npx tsx scripts/seed-acme-demo.ts`) — DELEGA ao reset canônico (mesmo fixture + artefatos do botão/cron) | CLI/scripts/CI |
| **Grupo Sinal (CLI)** | `npm run reset:demo:gruposinal` | Cria ou recompõe `gruposinal.vertho.ai` |

## Acesso temporário para prospect

Para uma degustação assíncrona, use as três contas estáveis no mesmo tenant:

| Visão | Conta |
|---|---|
| Participante | `bruna.demo@vertho.ai` |
| Liderança | `carla.demo@vertho.ai` |
| RH | `helena.demo@vertho.ai` |

Depois do reset, abra `/admin/demo`, escolha o tenant e clique **Gerar links de
entrada**. A ação valida `is_demo=true`, confere as três personas e gera um magic
link real e de uso único para cada destino (`/dashboard`, `/dashboard/gestor` e
home de RH). Os tokens não entram no log de auditoria. A tela permite copiar o
link ou abrir o WhatsApp com a mensagem pronta; o envio continua sendo uma ação
humana, preservando o bloqueio automático do ambiente demo.

Uma senha compartilhada continua disponível na seção de contingência. O reset
recompõe os dados do tenant, mas não altera os usuários do Auth.

## Degustação self-service com contato real (allowlist)

O login self-service (prospect digita o próprio e-mail e recebe o magic link
por e-mail/WhatsApp) é bloqueado pelo envio-guard em tenants demo. A exceção é
`empresas.sys_config.demo_acesso_allowlist`: e-mails listados ali recebem o
link **de verdade** — só o access-link; disparos em lote seguem bloqueados
(`lib/demo/envio-guard.ts::destinatarioLiberadoEmDemo`).

No `gruposinal`, o seed já cria o convidado **Alpheu** (`alpheu.sousa@gruposinal.com`,
perfil do tenant em `DEMO_TENANT_PROFILES`): conta zerada de Representante
Comercial, na equipe da Carla, fora da régua DISC/fit, com a allowlist ligada.
É ele quem faz o mapeamento comportamental do zero na degustação. O reset o
recria; a conta de Auth precisa existir (criar via `auth.admin.createUser`
com `email_confirm: true`, sem senha — o login é por magic link).

## Sala de apresentação ao vivo

Para demonstrar as três funções sem logout, abra `/admin/demo` e clique
**Preparar apresentação**. A sala usa sempre o `acme-demo`: ele contém o mesmo
fixture e os mesmos artefatos do Grupo Sinal, mas mantém identidade genérica.

O botão prepara um ponto de entrada para cada origem:

| Visão | Host isolado | Conta real |
|---|---|---|
| Usuário | `usuario-demo.vertho.ai` | `bruna.demo@vertho.ai` |
| Gestor | `gestor-demo.vertho.ai` | `carla.demo@vertho.ai` |
| RH | `rh-demo.vertho.ai` | `helena.demo@vertho.ai` |

Abra qualquer uma das visões. O preparo emite um passe assinado, restrito ao
`acme-demo` e válido por 4 horas. O dropdown **Visão apresentada** leva esse
passe para a origem escolhida, e a rota `/auth/apresentacao` cria a sessão da
persona correta no servidor — sem expor a senha compartilhada ao browser.

Ao lado dele, o dropdown **Dispositivo** alterna entre **Computador** e
**Celular**. No modo Celular, a aplicação real roda numa viewport isolada de
390 px, dentro de uma moldura de aparelho. Portanto os breakpoints, o header e
a navegação inferior são exatamente os responsivos do produto, não uma imagem
reduzida. A preferência acompanha a troca de função; ao voltar para Computador,
a sala mantém a tela até então navegada dentro da prévia.

Os aliases são três origens diferentes e, por isso, preservam três cookies de
sessão host-only no mesmo navegador. O proxy mapeia todos para o tenant canônico
`acme-demo`, mas o papel e as permissões continuam vindo do usuário realmente
autenticado — não existe override de role por URL ou cookie. A rota deriva o
papel exclusivamente do hostname fixo, nunca de parâmetros enviados pelo client.

Os hosts da apresentação são registrados na Vercel de forma idempotente no
preparo da sala. Fora desses três aliases o dropdown não é renderizado.

## Degustação individual reutilizável no ACME

Para um prospect percorrer a experiência como ele mesmo sem criar um tenant
contextualizado, use **Degustação individual** em `/admin/demo`. O operador
informa nome, empresa, WhatsApp opcional e escolhe um dos quatro cargos completos
do fixture. A action é fixada no `acme-demo` — não recebe slug do client — e
prepara um roteiro de quatro etapas:

1. **Comece como você:** um colaborador zerado, uma identidade Auth aleatória
   `convidado.acme.<id>@vertho.ai` e um magic link individual para iniciar pelo DISC;
2. **Veja como colaborador:** a jornada preenchida da persona Bruna;
3. **Veja como gestor:** a leitura de equipe da persona Carla;
4. **Veja como RH:** o panorama organizacional da persona Helena.

O e-mail real não é coletado. O WhatsApp opcional **não é persistido nem enviado
pelo servidor**: permanece no browser apenas para abrir `wa.me`. A interface
também oferece **Copiar texto completo**, com as quatro etapas e seus links. Os
tokens não entram no audit log. Como o e-mail técnico não termina em
`.demo@vertho.ai`, `isInternalEmail` o classifica como interno: o convidado pode
usar os fluxos individuais, mas fica fora de indicadores, rankings e relatórios
agregados.

As etapas 2–4 reutilizam um passe assinado da sala de apresentação vinculado ao
roteiro. Os quatro acessos expiram às **04h BRT de D+2**, considerando `D` como o
dia civil em que o roteiro foi criado. Cada visão cria uma sessão real em seu
hostname isolado; elas não compartilham a sessão nem as respostas do convidado
da etapa 1. A sala de apresentação avulsa, sem prospect vinculado, mantém a
janela de 4 horas.

O magic link da etapa 1 continua sendo de uso único e também segue a expiração
de OTP configurada no provedor; depois de consumido, a sessão permanece no mesmo
navegador até D+2. O reset das 04h primeiro remove somente convidados vencidos.
Enquanto houver algum roteiro ativo, a recomposição integral do ACME é adiada
para preservar colaborador, respostas e progresso. Vários passes coexistem sem
compartilhar respostas ou perfil.

Cada roteiro bem-sucedido cria uma linha em `demo_prospect_sessions`. O painel
mostra o primeiro acesso pessoal, a conclusão do DISC e a primeira entrada nas
visões Colaborador, Gestor e RH. A linha de acompanhamento sobrevive à expiração
e à remoção do colaborador temporário, preservando o histórico comercial; o
WhatsApp opcional nunca é persistido.

## Fixture congelado
O reset semeia de `lib/demo/acme-demo-fixture.json` (golden state VERSIONADO), **não** do acme vivo → a demo é estável e imune a mexidas no `acme`. O fixture guarda:
- Estrutura: empresa + competências + cargos + top10 + cenários (com source ids para remapeamento).
- `personaArtifacts` por e-mail: respostas avaliadas + descriptor_assessments + `report_texts` + trilha (row + progresso semanal). **Os 6 relatórios estão congelados** (eram 4 até 24/08 — Mariana e Renato abriam a tela de perfil disparando IA ao vivo).
- 🔴 **O merge das duas fontes é chave a chave** (`mesclarPersonaArtifacts`), nunca spread raso. Uma persona pode existir no fixture E no `acme-demo-extra-artifacts.json`: a Mariana tem avaliações no extra e relatório no fixture, e o spread raso fazia a entrada do extra substituir a do fixture INTEIRA — o relatório dela sumia em todo reset. O sintoma aparece longe da causa: congelar o artefato no arquivo "certo" não resolve, porque o problema é o merge.
- ⚠️ **Recalibrou o DISC de uma persona? Regere o relatório dela.** `report_texts` é narrativa gerada A PARTIR do DISC, e o reset RESTAURA o texto congelado toda madrugada — sem recongelar, o texto errado volta sozinho mesmo depois de corrigido no banco. O core (`gerarEsalvarRelatorioComportamentalCore`) reusa cache fresco, então limpe `report_texts` antes de regerar, senão ele devolve o texto velho e o script "passa".

Os artefatos pesados são **gerados 1x e congelados**, replicados no reset sem custo de IA (best-effort — falha num artefato não derruba o reset, só deixa a demo sem aquele item).

### Cargos extra (fora do fixture)
Alguns cargos são construídos **fresco no código** do reset, não vêm do fixture:
- `DEMO_EXTRA_ROLES` (`lib/demo/reset-acme-demo.ts`) — pacote COMPLETO de **Analista Financeiro**, **Coordenador de Operações** e **Gerente Comercial** (5 competências + 6 descritores cada + Top10 + cenários). O Gerente Comercial e o Diretor Geral entram em `DEMO_EXCLUDED_ROLES` (o fixture do acme só tinha o cargo + Top5 vestigial, sem competências/cenários) — o Gerente é reconstruído aqui em pacote completo; o Diretor Geral segue fora da demo.
- Gabaritos (IA2) + cenários ricos (IA3, rubrica N1-N4 + descritores-alvo) desses 3 cargos são congelados em `lib/demo/acme-demo-extra-artifacts.json` (gerados 1x pelo pipeline headless, aplicados no reset SEM custo de IA).

### Colunas comportamentais (`comp_*`/`lid_*`)
O motor de Adequação (fit v2) lê colunas **comportamentais** do colaborador (`comp_*`/`lid_*`), DERIVADAS do DISC — **não** os `descriptor_assessments`. `insertPersonas` popula essas colunas deterministicamente do DISC (`comportamentosDoDisc`), senão o ranking sai vazio/"Não recomendado" mesmo com DISC perfeito.

🔑 **As personas seguem a régua do produto, e isso é travado por teste**
(`tests/unit/demo-personas-regua.test.ts`): DISC somando **200**, `perfil_dominante`
igual ao que `deriveProfile` deriva, `comp_*` pela regressão canônica e `lid_*` = DISC/2.
Até 24/08 as `comp_*` eram uma TERCEIRA derivação (`cl(D)`, `cl((D+I)/2)`…) e o DISC somava
180-204 — a demo exibia números que a plataforma real não produz. O caso que mostra por que
isso não é cosmético: o "Não recomendado" do Paulo vinha de um `comp_persistencia = S = 24`,
e a regressão daria **50** para o mesmo DISC. Como alinhar apagaria os dois efeitos de
vitrine, o DISC das personas foi **recalibrado** (busca em grade de 18 mil perfis, com o
próprio motor de fit como oráculo) para produzi-los PELA régua: Paulo `D36 I84 S18 C62`
(fit 83,6 + knockout) e Bruna `D24 I27 S69 C80` (fit 46,2 sem knockout). ⚠️ O perfil do
Paulo deixou de ser "ID" porque **"ID com Persistência insuficiente" é aritmeticamente
impossível** no produto — Persistência ≈ `0,58·D + 0,61·S`, então D alto já garante o piso
do cargo. A primeira letra (que ancora a geração de conteúdo do kit) foi preservada.

⚠️ **Duas réguas de liderança convivem no código — a do produto é `lid_X = DISC_X / 2`** (`computeLeadership`, no mapeamento que o colaborador percorre). Medido em 24/08: 199 dos 218 colaboradores com DISC seguem essa régua (Macaé 138/138, Ibipeba 52/52, Elo 6/6, UniAnchieta 2/2). Como o DISC natural é normalizado para somar **200** (não 100), a liderança soma 100 e cada estilo vive em 0-50. O `simulador-disc` usa OUTRA fórmula (`0,7·D + 0,3·C` etc.) numa escala 0-100 — todo tenant populado por ele nasce fora da régua (`projetomacae` 13 pessoas, `acme` 4). O `comportamentosDoDisc` do demo seguia o simulador e foi alinhado ao produto; as `comp_*` seguem o simulador de propósito (não têm equivalente no mapeamento). Consequência para quem mexe no fit: `liderancaFit` normaliza ideal e real para soma 100, então o motor é **imune à escala** e **sensível à fórmula** — trocar uma pela outra muda o score dos cargos de liderança (aqui: Renato 87,9→88,8 e Carla 87,9→85,8), e não muda nada nos demais.

### Personas visíveis nas views agregadas
As personas são `*.demo@vertho.ai` por causa do guardrail de envio, mas `isInternalEmail`/`excludeInternalEmails` (`lib/internal-emails.ts`) **isentam** `*.demo@vertho.ai` (persona ≠ staff) — assim aparecem em ranking/DNA/Perfil Organizacional. Só o `@vertho.ai` "puro" (ex.: `rodrigo@vertho.ai`) é excluído. O guardrail de ENVIO continua no `is_demo` (envio-guard), intacto.

## Como ATUALIZAR o golden state
Quando quiser um novo estado de referência (ex.: após mudar competências no acme, ou melhorar as personas):

1. Resetar o acme-demo (estado base): botão `/admin/demo` ou `npm run reset:demo`.
2. Rodar os pipelines pesados no acme-demo (usam a flag `internal` — service-role, sem UI/gate de admin):
   - **IA4** (mapeamento avaliado): `rodarIA4(demoEmpresaId, {})` pela tela de admin (com sessão) — ~100s/resposta.
   - **IA2** (gabaritos) / **IA3** (cenários ricos) dos cargos extra: `rodarIA2(empresaId, {}, { cargoNome })` e `rodarIA3Uma(empresaId, cargo, competenciaId, ...)` (`actions/fase1.ts`), pela tela de admin — para o golden update dos artefatos congelados.
   - ⚠️ A flag `internal` destas três foi REMOVIDA em 10/07: o action id delas estava publicado no bundle do browser, e o bypass era chamável sem sessão. Se a execução headless voltar a ser necessária, extrair núcleo sem gate pra `lib/` (modelo `lib/blueprint/core.ts`) — nunca reabrir a flag.
   - **Relatórios DISC**: `gerarEsalvarRelatorioComportamental({ colabId })` por persona.
   - **Trilhas**: gerar pela tela de admin (`gerarTemporada`, com sessão) — a competência PRECISA ter avaliação (`descriptor_assessments`), senão erra. O antigo `gerarTemporadaInternal` foi REMOVIDO: era um export `'use server'` que rodava service-role incondicionalmente, ou seja, um endpoint HTTP sem gate. Se a geração headless voltar a ser necessária, extrair um núcleo sem gate pra `lib/` (modelo: `lib/blueprint/core.ts`) em vez de reabrir a flag.
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
