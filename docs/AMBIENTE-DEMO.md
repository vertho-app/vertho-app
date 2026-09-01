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
| **Noturno** | `/api/cron?action=reset_demo` (gated CRON_SECRET) + `vercel.json` `0 7 * * *` (04h BRT). Percorre **todos** os ambientes de `DEMO_TENANT_PROFILES`, um a um; falha → 500 (log Vercel) + audit por ambiente | Automático |
| **Manual (CLI)** | `npm run reset:demo` (= `npx tsx scripts/seed-acme-demo.ts`) — DELEGA ao reset canônico (mesmo fixture + artefatos do botão/cron) | CLI/scripts/CI |
| **Grupo Sinal (CLI)** | `npm run reset:demo:gruposinal` | Cria ou recompõe `gruposinal.vertho.ai` |

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

Para demonstrar as três funções sem logout, abra `/admin/demo`. As três visões
ficam sempre visíveis e o acesso seguro é disponibilizado automaticamente ao
carregar a página. A sala usa sempre o `acme-demo`: ele contém o mesmo fixture
e os mesmos artefatos do Grupo Sinal, mas mantém identidade genérica.

O carregamento automático prepara um ponto de entrada para cada origem:

| Visão | Host isolado | Conta real |
|---|---|---|
| Usuário | `usuario-demo.vertho.ai` | `bruna.demo@vertho.ai` |
| Gestor | `gestor-demo.vertho.ai` | `carla.demo@vertho.ai` |
| RH | `rh-demo.vertho.ai` | `helena.demo@vertho.ai` |

Abra qualquer uma das visões. O preparo emite um passe assinado, restrito ao
ambiente que o emitiu (`DEMO_PRESENTATION_ROOMS`) e válido por 4 horas.
🔴 **A rota confere o `tenant` do passe contra o ambiente do hostname**: a
assinatura prova que o passe é nosso, não que ele é DESTA sala — sem a
comparação, um passe legítimo de outro ambiente demo abriria sessão aqui. O dropdown **Visão apresentada** leva esse
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
preparo da sala. Fora dos aliases registrados o dropdown não é renderizado.

⚠️ **Cada ambiente tem os seus três hosts, e eles não podem se repetir**: o
hostname identifica papel E ambiente, então um alias compartilhado abriria
tenants diferentes conforme quem emitiu o passe. O seletor de função navega
dentro da sala atual (`currentRole.tenantSlug`), nunca para os hosts de outro
ambiente.

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

### Pausar o reset de um ambiente (com data de fim)

O reset noturno (07:00 UTC, 04h BRT) percorre **todos** os ambientes de
`DEMO_TENANT_PROFILES` e só é adiado por **passaporte** no prazo D+2. Convidado
nomeado do perfil (o Alpheu, no Grupo Sinal) não tem esse prazo: sem mais nada,
o DISC, as respostas e a análise dele somem na madrugada e o seed o recria
zerado — o que quebra qualquer experiência que dure mais de um dia.

Para segurar um ambiente durante uma janela, o perfil aceita `resetPausadoAte`
(instante ISO). O cron pula o ambiente enquanto ela vigora, registrando
`motivo: 'reset_pausado'` no `admin_audit_log`; a régua é `resetPausadoAte(slug)`,
fonte única lida também pela tela.

🔑 **A data É o desligamento.** Passado o instante, o ciclo volta sozinho, sem
depender de alguém lembrar. Pausa sem data seria um reset desligado para sempre,
que é o modo de falha do trabalho sazonal já medido nesta base (os crons do
CONARH seguiram disparando 48×/dia por duas semanas depois do evento acabar).
O teste central de `tests/unit/demo-reset-pausa.test.ts` é o da EXPIRAÇÃO.

O reset **manual** não é bloqueado pela pausa: ele avisa, na confirmação, até
quando o ambiente está segurado e o que se perde ao recompor agora. Quem aperta
o botão é o dono do ambiente — recusar sem caminho de saída na tela seria beco.

⚠️ Pausa vigente em 01/09/2026: `gruposinal` até **07/09 07:00 UTC** (a
experiência do Alpheu atravessa a semana até domingo).

### A etapa 01 é uma DEGUSTAÇÃO: uma competência, avaliada sozinha

O convidado responde **uma** competência, não as cinco do cargo
(`DEGUSTACAO_MAX_COMPETENCIAS`, em `lib/demo/convidado-demo.ts`). A etapa 01
existe para a pessoa entender o fluxo; o diagnóstico completo é o que ela vê
pronto nas visões 02–04, com o ambiente já preenchido. O corte é aplicado num
ponto só (`competenciasDoColaborador`, em `app/dashboard/assessment/assessment-actions.ts`)
porque **duas** actions decidem sobre a mesma lista: a que monta a tela e a que
calcula a próxima pendente. Divergirem significa a pessoa concluir e continuar
sendo empurrada para o próximo cenário.

A régua de quem está em degustação exige as **duas** pontas: tenant `is_demo` E
convidado (a mesma `isEmailDeConvidadoDemo` do acompanhamento). Só o `is_demo`
cortaria as personas do fixture; só o e-mail cortaria gente real em tenant de
cliente, que é exatamente quem precisa das cinco.

⚠️ **Não mexa no `top5_workshop` do ACME para conseguir esse corte.** Ele é
fixture congelado e alimenta o ranking de fit e os relatórios organizacionais da
demo inteira; o corte é do CONVIDADO, não do cargo.

**A avaliação sai sozinha.** Fora da demo, quem manda avaliar é um humano no
painel ("IA4 — Avaliar + Check") — correto para cliente real, onde a nota vira
PDI. Na degustação não existe esse alguém: `Medido 01/09/2026:` a única resposta
de convidado no ACME estava com `nivel_ia4` nulo, e a tela dizia "Análise em
processamento" para sempre. Agora o envio da resposta dispara
`avaliarRespostaDaDegustacao` em `after()`.

Por que em segundo plano, e não na tela: `Medido:` a IA4 leva **107,5s de
mediana** e 153,6s no p90 (60 dias de `ia_usage_log`, `claude-sonnet-5`). Segurar
uma demonstração por dois minutos não é espera, é desistência — então quem
espera é o roteiro, e a análise amadurece enquanto a pessoa percorre as visões
02–04. Sem o check dual (`ia4_check`, +19,4s e +US$ 0,045): a segunda IA existe
para auditar nota que vira PDI, e esta morre com o passaporte em D+2. Custo:
~US$ 0,12 por convidado.

Enquanto nada foi avaliado, a tela de conclusão diz **"Respostas registradas"**,
e não "Resultado da avaliação — 0 de 1 com análise concluída": anunciar resultado
e ausência de resultado na mesma dobra é prometer o que ainda não existe. E o
aviso manda continuar **pelo roteiro que a pessoa recebeu**, porque as etapas
02–04 são links do passaporte que o dashboard não conhece — mandar "siga para a
próxima etapa" sem oferecer o caminho seria um beco.

### Acompanhamento dos clientes: duas origens, um tenant por vez

O bloco **Acompanhamento dos clientes** lista **todo convidado do tenant
selecionado**, não só os passaportes:

| Origem | Quem é | Marcas | Prazo |
|---|---|---|---|
| `passaporte` | veio da Degustação individual (linha em `demo_prospect_sessions`) | as 5 | D+2, às 04h BRT |
| `cadastro` | colaborador do tenant fora do elenco fixo: o convidado nomeado do seed (Alpheu, no `gruposinal`) ou alguém cadastrado à mão | acesso e DISC | não expira |

A régua de "convidado" é o **e-mail**: fica de fora o elenco do seed
(`*.demo@vertho.ai`, que é conteúdo do ambiente) e a conta de staff da Vertho.
No `cadastro` não existem as visões 02–04, e o cartão mostra só as duas marcas
que ele pode cumprir — pintar as outras como "Aguardando" inventaria etapa que
ninguém alcança.

⚠️ **O passaporte só existe no ACME, mas o acompanhamento é por tenant**: até
01/09/2026 a leitura era fixa no `acme-demo` e o Alpheu, convidado real do Grupo
Sinal, nunca apareceu na tela. Trocar o seletor de ambiente troca a lista.

O primeiro acesso de quem entrou por `cadastro` não tem carimbo do app: vem do
`last_sign_in_at` do Supabase Auth pela RPC `demo_guest_auth_activity` (mig 237,
`SECURITY DEFINER`, só `service_role`, restrita a e-mail de tenant `is_demo`).
Varrer `auth.admin.listUsers` no lugar dela custaria paginar **todos** os
usuários do projeto a cada atualização do painel. Falha na RPC derruba a
listagem de propósito: silêncio ali viraria "ninguém acessou" na tela.

⚠️ Convidado de `cadastro` no ACME **não sobrevive ao reset das 04h** —
`colaboradores` está em `DEMO_RESET_TABLES`. Para acompanhar alguém por mais de
um dia, use a Degustação individual (o reset adia enquanto houver passaporte no
prazo) ou o convidado nomeado do perfil do tenant, que o seed recria.

## Um ambiente demo é IDENTIDADE + ROSTER

Um tenant de demonstração é a soma de duas coisas, e elas mudam por motivos
diferentes:

| Dimensão | Onde | Muda quando |
|---|---|---|
| **Identidade** | `DEMO_TENANT_PROFILES` (nome, marca, PPP, valores, logo, allowlist) | O prospect é outro (foi assim que o Grupo Sinal nasceu do ACME) |
| **Roster** | `lib/demo/rosters/` (cargos, competências, personas, Top 5, sala) | O SEGMENTO é outro (uma rede de escolas não tem Representante Comercial) |

Cada perfil declara o próprio elenco (`roster: 'comercial'`) e o motor lê
`rosterDemo(profile.roster)`. Trocar de elenco deixou de ser editar o reset.

🔑 **Dois campos do roster são dado, não regra.** `codPrefix` (prefixo do
`cod_comp`) e `ehLideranca` saíam de heurística sobre o NOME do cargo
(`startsWith('Analista')`, `includes('Coordenador')`). Isso acertava por
acidente com um elenco só: "Coordenação Pedagógica" cairia no `else` e levaria
o prefixo do Gerente Comercial, gravando `cod_comp` colidente em dois cargos.
Travado em `tests/unit/demo-roster-comercial.test.ts`, que roda a régua antiga
contra a nova.

**Para nascer, um ambiente novo precisa de:** perfil em `DEMO_TENANT_PROFILES`
(com `roster`) · roster em `lib/demo/rosters/` · fixture congelado
(`node scripts/capture-acme-fixture.mjs --source=<tenant vivo> --demo=<tenant demo> --out=<arquivo>`)
· hosts da sala em `DEMO_PRESENTATION_ROOMS` · prefixo de convidado em
`DEMO_PROSPECT_TENANTS` se oferecer degustação · o tenant no banco com
`is_demo=true`.

⚠️ **O prefixo do convidado é o que separa os ambientes no Auth.** A conta de
degustação não guarda tenant, e a faxina apaga como resíduo todo usuário com o
marcador que não tem sessão rastreada no tenant varrido — com prefixo
compartilhado, limpar um ambiente apagaria o convidado vivo do outro. Um tenant
não registrado deriva o prefixo do próprio slug, nunca herda o do ACME
(`tests/unit/demo-prospect-isolamento-ambiente.test.ts`).

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
   - `node scripts/capture-acme-fixture.mjs` (dumpa estrutura do acme + artefatos do acme-demo → `acme-demo-fixture.json`). Outro par vai por argumento: `--source=<tenant vivo> --demo=<tenant demo> --out=<arquivo>`.
   - `scripts/_capture-fixture-extra.mjs` / `scripts/_capture-demo-extra.mts` (gabaritos + cenários dos cargos extra → `acme-demo-extra-artifacts.json`).
4. Commitar o `acme-demo-fixture.json` (e o `acme-demo-extra-artifacts.json`, se mudou).

## Pegadinhas
- `descriptor_assessments.nivel` é coluna **GENERATED ALWAYS** — capture/replay a descartam (senão o insert falha).
- `gerarTemporada` exige competência COM `descriptor_assessments` — passar `competencia` válida.
- O render do PDF via tsx falha (`Font family not registered: NotoSans`) — mas `report_texts` salva ANTES, e o PDF regenera on-demand no app (o que congelamos é o `report_texts`, não o binário).

## Follow-ups (não feitos)
- ⛔ *(resolvido em 01/09)* Reset noturno cobria só o ACME: o Grupo Sinal era tenant demo desde 25/08 e **nunca foi recomposto**, e o preflight de convidados lia sempre o ACME (um convidado ativo lá adiaria o reset do vizinho).
- Tenant por vendedor (`acme-demo-<rep>`) contra colisão simultânea — o reset sob demanda mitiga.
- Season "em ANDAMENTO" de verdade (a trilha nasce gerada mas sem semanas concluídas).
