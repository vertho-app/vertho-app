# Ambientes de Demonstração

## Apresentações sem internet

| Demo | Endereço | Pacote inicial |
| --- | --- | --- |
| Rede de escolas | `https://professor-escolas.vertho.ai/apresentacao-offline/index.html` | Cerca de 42 MB |
| ACME empresarial | `https://usuario-demo.vertho.ai/apresentacao-offline-acme/index.html` | Cerca de 14 MB |

Também disponível pelo botão **Preparar offline** em cada card de ambiente na seção
**Apresentação** da tela administrativa `/admin/demo`. Prepare pelo Wi-Fi, no mesmo
navegador e aparelho que serão usados para apresentar. O pacote só sinaliza
**Pronto para apresentar offline** depois de baixar e conferir todos os arquivos.
Salve o endereço nos favoritos; abra esse endereço diretamente quando estiver sem
rede. Use os mesmos seletores **Visão apresentada** e **Dispositivo** da sala online.
Depois do preparo, o painel se recolhe; o ícone **Preparo offline** no canto superior
direito permite conferir e atualizar. Quem já salvou a versão anterior deve usar
**Atualizar pacote** com conexão para receber a interface compartilhada.

A versão offline reutiliza o `DashboardShell`, as páginas React e o CSS da aplicação
online: início, jornada, temporada, conteúdo da semana, perfil, avaliação, PDI,
equipe, evolução e relatórios. Cores, fontes, menus, barra de apresentação e leitores
são os mesmos. Mantém também as regras de liberação das semanas do retrato salvo.

Na escolar, inclui os perfis e avaliações do fixture, PDI de Marina, relatório da
coordenação e panorama da direção. Na ACME, inclui o elenco de 30 pessoas fictícias,
PDI de Bruna, relatório de Carla e panorama de Helena. As duas demos incluem os
quatro formatos das semanas 1 e 2 (vídeo, áudio, texto e case). Na ACME essas semanas
compartilham o tema **Criação de senso de urgência** e os mesmos arquivos; cada mídia
é baixada uma única vez, incluindo o vídeo nominal de Bruna. Na escolar, vídeo e podcast
das duas semanas são os de Marina, abertos por "Olá, Marina" (até 17/09/2026 o pacote
levava o deck genérico e o áudio-base, sem o nome).

**Não inclui conversa com IA, login offline nem gravação ou
sincronização de avaliações.** Ações que dependem desses serviços mostram um aviso
e permitem continuar a apresentação.
O retrato dos dados fictícios tem sua data visível; o pacote não consulta o banco.

**Conferir pacote** relê os arquivos salvos e valida tamanho e SHA-256. Antes de
um evento, confira, desligue a internet, feche e reabra o navegador e teste a mídia.
Se o navegador apagar o armazenamento, será necessário preparar novamente com
conexão. **Atualizar pacote** aparece quando há uma versão nova. Downloads
incompletos, cancelados ou sem espaço não substituem o pacote anterior.

### Implementação e verificação

- Fonte TypeScript em `lib/demo/offline/`; `data.ts` e `acme-data.ts` projetam apenas
  campos demonstrativos dos fixtures e rosters, sem contatos, sessões ou conversas.
  A ACME complementa o fixture antigo com `acme-content.json`: semanas resolvidas
  pelo overlay real dos kits e notas numéricas das 30 pessoas declaradas no roster,
  indexadas por chave fictícia, sem IDs de colaboradores ou convidados. Os relatórios
  usam os geradores canônicos `criarRelatorioGestorAcmeDemo` e `criarRelatorioRhAcmeDemo`.
- `build-adapters.ts` substitui sessão, navegação e server actions apenas no bundle
  estático. Os módulos `use server` nunca entram no pacote: leituras usam os dados
  fictícios locais e mutações ficam indisponíveis. O transporte bloqueia chamadas
  de API externas ao pacote. Não altera autenticação nem regras da aplicação online.
  `ui-snapshot.json` contém planos e progresso do roster fictício, sem IDs ou contatos.
  `documents/` guarda PDFs gerados pelos mesmos componentes React-PDF do produto;
  o leitor PDF e seu worker também são empacotados para funcionar sem rede.
- `media.json` (escola) e `acme-media.json` fixam os arquivos públicos, tamanhos e hashes. Ao trocar a mídia,
  atualize o manifesto a partir dos novos arquivos completos; builds não fazem
  downloads e não precisam de segredos. As semanas vêm do plano congelado de
  Marina. Vídeo e podcast são cópias imutáveis das versões nominais dela
  (`videos_personalizados` das células de `escolas-videos-jornada.json` e
  `final/audio-personalizado/<conteúdo>/<Marina>.mp3`); texto e case são os PDFs do
  fixture. A cópia é necessária porque o reset recria a persona com UUID novo e move
  o áudio personalizado toda noite. As mídias da ACME são cópias imutáveis do
  material entregue a Bruna. Todas ficam em `conteudos/demo-offline/<escolas|acme>/<sha256>.<ext>`.
- 🔴 **O `source` de toda mídia é do MESMO domínio**: `<base>midia/<sha256>.<ext>`, que
  o rewrite de `lib/demo/offline/midia-rewrites.mjs` (importado pelo `next.config.mjs`)
  repassa ao Storage. Quem baixa a versão nova é o app JÁ INSTALADO, e ele bloqueia
  (503) toda URL externa fora da lista gravada no build dele (`__OFFLINE_MEDIA__`).
  Em 17/09/2026 o podcast da Marina mudou para uma URL nova do Storage e "Atualizar
  pacote" falhou com conexão ("Não foi possível baixar Semana 1 · podcast da Marina").
  Mesmo domínio dentro da base é o que transporte, service worker e `validatePackage`
  de todas as versões publicadas aceitam. `tests/unit/demo-offline.test.ts` exige o
  formato nos dois manifestos e recusa os bytes do deck e do MP3-base antigos; o
  canário local (`verify-demo-offline.mts`) repassa `midia/` ao Storage como o rewrite.
- `npm run build:demo-offline` gera `public/apresentacao-offline/` e
  `public/apresentacao-offline-acme/` (ignorados no Git).
  `predev` e `prebuild` executam o mesmo gerador. HTML, CSS, JavaScript e fontes
  locais entram nos manifestos; a ACME compartilha as mídias repetidas entre semanas.
- `environment.ts` define nomes, visões, caminhos e namespaces de cada ambiente.
  Workers exclusivos em `/apresentacao-offline/sw.js` e `/apresentacao-offline-acme/sw.js`,
  cada um com escopo explícito no próprio diretório. O endereço e cache escolar
  existente são preservados. `public/sw.js` continua apenas push. Cada worker
  atende somente os arquivos desse pacote; não captura API, auth ou dashboard.
- Cache temporário + validação completa + ponteiro ativo atômico. O pacote
  anterior é preservado; limpeza fica no namespace próprio e sob lock entre abas.
  Requests explícitas de atualização passam pela rede, para evitar baixar o HTML
  antigo do próprio cache. Range requests permitem buscar trechos de vídeo/áudio.
- Unitários: `tests/unit/demo-offline.test.ts` (corrupção, quota, cancelamento,
  preservação do anterior, escopo de arquivos e intervalos de mídia).
- Canary manual: `node scripts/verify-demo-offline.mts`, depois do build do pacote.
  Baixa as mídias públicas reais, testa atualização, desliga o servidor de origem,
  reinicia o Chrome sem conexão e percorre os três perfis e quatro formatos.
  Também confere telas a 390px e invalida a prontidão ao remover um vídeo do cache.
  `--origin=https://professor-escolas.vertho.ai` verifica a publicação escolar real.
  Para ACME, use `--acme`; o teste local também prepara a escola na mesma origem,
  registra o worker de push e confirma que ambos sobrevivem ao preparo/atualização
  da ACME e à reabertura offline. Publicação ACME:
  `node scripts/verify-demo-offline.mts --acme --origin=https://usuario-demo.vertho.ai`.

## Ambientes online

Tenant `acme-demo` (empresa "ACME Demo") que os vendedores usam nas demos para clientes. Nasce com um estado rico e é resetado ao estado inicial sob demanda e toda madrugada.

O tenant `gruposinal` (`https://gruposinal.vertho.ai`) é uma instância contextualizada
para o Grupo Sinal. Ele usa o mesmo fixture, as mesmas telas e as mesmas regras do
produto; o seed altera apenas a identidade e o contexto organizacional dos artefatos.
Os dois tenants permanecem com `is_demo=true` e, portanto, sem disparos automáticos reais.

## O que o cliente vê ao abrir (tudo pronto, SEM IA no reset)
- **6 participantes** em estágios diferentes da jornada e em **áreas diferentes**, mais **1 persona de RH** que consome o panorama da empresa:
  - **Ana** (Representante Comercial, IS, novo), **Paulo** (Rep. Comercial, IC, parcial), **Bruna** (Rep. Comercial, CS, completo), **Carla** (Gerente Comercial, D, gestora; **só lidera** desde 16/09/2026: sem mapeamento, situação, trilha ou PDI individual, como a coordenação das escolas).
  - **Mariana** (Analista Financeiro, CS, completo) e **Renato** (Coordenador de Operações, DS, novo) — cargos fora de vendas (Financeiro e Operações).
  - **Helena** (Gerente de Recursos Humanos, papel `rh`) — sem DISC/trilha por desenho; vê o funil, colaboradores, ranking e relatórios e não entra nas métricas de participantes.
- **DISC / Perfil Comportamental** das 6 (narrativas LLM `report_texts` congeladas → relatório abre instantâneo).
- **Mapeamento de competências avaliado** (respostas com nota da IA4 + `descriptor_assessments`): Bruna 5, Mariana 5 (30 `descriptor_assessments` congelados), Paulo 2.
- **Jornadas/trilhas de 7 semanas** no `acme-demo`: 6 semanas de conteúdo e fechamento na semana 7. A trilha rica da Bruna preserva o conteúdo congelado de Negociação e Fechamento; o Grupo Sinal continua no programa regular de 14 semanas.
- **4 cargos completos** (competências + descritores + Top10 + cenários com rubrica N1-N4): Representante Comercial, Gerente Comercial, Analista Financeiro, Coordenador de Operações. O Gerente Comercial nasce com **Top 5 vazio** (só lidera): mantém competências, cenários e gabarito, entra no ranking de adequação e não é convidado a mapeamento. Funil do ACME desde 16/09/2026: 30 pessoas · 28 com perfil · **24** mapeadas · **19** em jornada · 16 em dia · **3** atrasadas · 15 concluídas (o Marcelo, Gerente Comercial do diretório, saiu do mapeamento, da jornada e dos atrasados).
- **Adequação / Ranking real por cargo**: as personas nascem com colunas comportamentais (`comp_*`/`lid_*`) derivadas do DISC → o motor de fit as pontua. Aderências de referência (medidas em 24/08, com as personas já na régua do produto): Mariana/Financeiro **95,0** (Excelente), Renato/Operações **89,1** (Excelente), Carla/Gerente **87,8** (Excelente), Paulo/Representante **83,6** mas **"Não recomendado"** (knockout de Persistência — nota alta não passa por cima de requisito eliminatório), Ana/Representante **83,3** (Alta), Bruna/Representante **46,2** (Baixa — CS não casa com D/I do cargo). ✅ **O fit é pré-computado pelo próprio reset** (`precomputarFit`, best-effort, sem custo de IA) — a aba Fit v2 de `/admin/fit` abre populada, sem ninguém precisar clicar "Calcular Fit". Antes de 25/08 não era: `fit_resultados` tem `ON DELETE CASCADE` em `colaborador_id`, o reset recria os colaboradores e o ranking **amanhecia vazio todo dia**, dependendo de um passo manual que ninguém lembra na hora da demo. A contagem sai no `counts.fit_resultados` do resultado do reset.
- Envios reais **desligados** (gate por tenant `empresas.is_demo` no `envio-guard` + personas com e-mail `*.demo@vertho.ai` interno e sem telefone → WhatsApp no-op).

## Vídeos da jornada escolar

A professora Marina tem vídeos próprios nas semanas **1 (Ritmo e transições)**,
**2 (Engajamento ativo)** e **3 (Recursos didáticos)**. Os dois primeiros seguem
o texto e o desafio das semanas que ficam acessíveis no início da demonstração.
Os assets publicados ficam no roster escolar; as semanas 1 e 2 usam
`lib/demo/escolas-videos-jornada.json`.

`recomporVideosDaJornadaDemo` (`lib/demo/video-jornada.ts`) é compartilhado pelo
reset e pela manutenção pontual: restaura o catálogo, o vínculo dos quatro
formatos ao módulo correto e o vídeo nominal da persona atual. Não altera a
trilha nem conclui semanas. Vídeos prontos são reaproveitados sem geração de IA.

Uma célula fixa com erro de renderização continua ocupando seu ID no banco.
O reset deve recuperá-la por atualização quando não houver uma célula viva que
a substitua; tentar inserir novamente o ID aborta a recomposição da demo.
Essa recuperação é comum às demos escolar e empresarial.

## Conversas de evidências da Marina

As semanas 1 e 2 da Marina nascem concluídas **com a conversa que as concluiu**
(`lib/demo/escolas-evidencias-jornada.json`, ligada em `percursoDaPersona.evidencias`
do roster escolar). O produto só conclui semana de conteúdo na conversa, e a tela da
semana só se dá por concluída com o transcript gravado. Até 17/09/2026 o reset gravava
`concluido` com `reflexao: null`: a lista mostrava a semana concluída e a tela, "0 de 6
respostas". Clicar em "Levantar evidências" abria conversa nova (paga) e regravava a
semana como em andamento.

As conversas saíram da rota real (`/api/temporada/reflection`, logado como Marina):
mentor, desafio do kit e extração são os do produto; só a fala da professora veio do
aluno simulado (`promptSimuladorColab`, evolução confirmada, instruído a falar no
feminino). O reset repete sem IA e recarimba as mensagens com a data de conclusão.
`tests/unit/demo-percurso-evidencias.test.ts` exige, para toda semana concluída de
persona com percurso, os 6 turnos da régua `turnosIaNecessarios`, a extração e o
descritor da semana no plano.

⚠️ Semanas concluídas das pessoas de APOIO e da Mariana (ACME e Grupo Sinal) seguem
sem conversa: o plano delas é um esqueleto (`{semana, tipo}`, sem conteúdo), feito para
o painel de Evolução, e não abre como jornada navegável.

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
informa nome, empresa, WhatsApp opcional e escolhe um dos cargos que percorrem a
jornada (três no comercial desde 16/09/2026: a gestão comercial só lidera). A action é fixada no `acme-demo` (não recebe slug do client) e
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

### Versão B: convite guiado (16/09/2026)

**Por que existe.** `Medido 16/09/2026` nos 8 prospects reais desde 08/09: 0
fizeram o DISC, 0 responderam a situação, 0 abriram qualquer visão 02 a 04. E o
"acesso pessoal" do painel era, na maioria, o **robô de preview do WhatsApp**: o
GET de `/auth/degustacao` cria a sessão e carimba, e 6 dos 8 tinham uma única
sessão aberta 12 s a 1 min 44 s depois da criação, sem nenhum JavaScript rodando
(navegador de verdade dispara `POST /dashboard` cerca de 2 s depois do
`GET /dashboard`; essas aberturas não dispararam). A única pessoa confirmada
abriu no iPhone 6 h depois e parou na home genérica, com o botão do DISC atrás da
barra de navegação.

**O que muda para o prospect** (a A continua igual e selecionável no painel):

| | A (quatro links) | B (convite guiado) |
|---|---|---|
| Mensagem | 4 etapas, 4 links | ~3 linhas, 1 link |
| Link | `/auth/degustacao?passe=` (GET cria sessão) | `/c/<código>` curto (página, **não** cria sessão); `/degustacao?passe=` segue abrindo |
| Ordem | você, colaborador, gestor, RH | gestor, RH, colaborador; perfil opcional |
| Sessão nasce | no GET (robô incluído) | no POST do botão pessoal (clique) |
| `/dashboard` do convidado | home de colaborador | volta para a página (`lib/demo/degustacao-casa.ts`) |
| "Abriu" no painel | `personal_accessed_at` (contaminado) | `invite_opened_at` (beacon após interação ou clique) |

**Peças.** Coluna `experience_version` e `invite_opened_at` (mig 256).
`lib/demo/degustacao-acesso.ts` concentra a decisão de acesso das quatro portas
(GET da A, POST do botão, beacon, página): passe, hostname CRU (host de sala é
recusado) e sessão viva no banco. A página (`app/degustacao/page.tsx`) só lê: o
teste `degustacao-pagina` prova zero escritas e nenhuma chamada ao Auth. Ela
mostra só estados (visto, perfil pronto, devolutiva pronta), nunca resultado:
quem tem o link não vê perfil nem nota. O botão pessoal manda uma CHAVE de
destino (`mapeamento`, `perfil`, `assessment`), nunca caminho, e `/dashboard` não
é destino (seria laço). As rotas de escrita da pasta são vigiadas por
`tests/unit/security/degustacao-rotas-guard.test.ts`, porque `routes-require-auth`
só varre `app/api`.

**Painel.** Selo A/B por passaporte; na B, seis marcos: Abriu, Gestor, RH,
Colaborador, Perfil, Situação (primeira resposta, lida de `respostas`). O botão de
lembrete gera o texto curto com o link da página; num passaporte A vivo ele
**converte a linha para B** (auditado em `demo.prospect_invite_reminder`, sem a
URL), que é como os prospects do roteiro antigo ganham o convite novo sem perder
o que fizeram.

⚠️ **Escolas:** até a mig 256 a CHECK de `role_key` só aceitava os quatro cargos
comerciais, então todo passaporte de `professor` falharia no insert.

### Ajustes da versão B (16/09/2026, noite)

**Link curto.** O convite e o lembrete levam `https://<ambiente>.vertho.ai/c/<código>`,
24 caracteres em vez dos ~160 do passe. Sem tabela e sem migration: o código é a
sessão (10 bytes) seguida de 8 bytes de HMAC sobre `ambiente|sessão`
(`lib/demo/degustacao-link-curto.ts`, contexto de assinatura PRÓPRIO). A
assinatura não é enfeite: o id da sessão aparece em claro no ticket da sala, e
sem ela quem tivesse um ticket montaria o link da pessoa. O ambiente sai do
hostname de quem abre, então o código de um ambiente não vale no vizinho. O prazo
continua sendo o da linha em `demo_prospect_sessions`. `/c/<código>` e
`/degustacao?passe=` renderizam a MESMA página (`app/degustacao/pagina-da-degustacao.tsx`).

**Página responsiva.** No computador a página abre em até 1120 px, com os três
cartões de visão lado a lado e a seção pessoal em duas colunas; no celular segue
em coluna.

**Voltar ao início.** Cada visão leva o código curto em `volta`. A rota
`/auth/apresentacao` só o repassa se ele for do MESMO ambiente e da MESMA sessão
do ticket (código de outra pessoa, de outro ambiente ou forjado é descartado e a
sala abre sem o botão). Nas salas, "Voltar ao início" aparece no começo da barra,
antes dos seletores de função e de dispositivo (o de dispositivo chegou a sumir
para o convidado em 16/09 e voltou em 17/09, a pedido do dono). No celular o
"Voltar" fica só com o ícone, para a barra caber na tela.

**Menu lateral expansível** (vale para todo o dashboard). Recolhido, é a coluna de
ícones; com o mouse ou com o teclado (`has-focus-visible`, não `focus-within`,
senão a coluna ficava aberta depois do clique) ele abre por cima do conteúdo e
mostra o nome de cada item. Cada destino tem um ícone próprio: o simulador de
atendimento e o simulador de vendas usavam o mesmo balão.
`tests/unit/dashboard-shell-menu.test.ts` cobra os dois. Aberto, o menu fica em
`z-[44]`, abaixo da barra da sala (`z-[45]`): em `z-50` ele a cobria, e o ponto de
"Voltar ao início" virava o botão Sair.

**Gestor só lidera.** Ver "Degustação: só entra cargo que PERCORRE a jornada".
Passaporte antigo com cargo de Gerente Comercial continua abrindo: depois do DISC
a página mostra só o perfil (`perfil-pronto`), porque o cargo não tem situação. A
página pergunta pelo Top 5 com a mesma chave da avaliação (o cargo do
colaborador), para as duas nunca discordarem.

### Próximo passo: a saída da página (18/09/2026)

**O que faltava, medido.** `Medido 18/09/2026`: a primeira convidada a atravessar
a experiência inteira (DISC às 09:05, colaborador 09:17, gestor 09:20, RH 09:21,
versão A) terminou numa página sem nenhuma saída. Quem quisesse conversar teria
que voltar ao WhatsApp e procurar a conversa.

**Como é.** O último bloco da página de boas-vindas é "Próximo passo", com a
pergunta do ambiente ("Quer ver isso na sua empresa?" / "na sua rede") e um link
`wa.me` com o texto pronto. Quem envia a mensagem é a PESSOA, do aparelho dela:
o tenant de demonstração não dispara nada, nada novo é guardado sobre o lead e o
robô de preview do WhatsApp não tem o que carimbar. É um `<a>` comum, funciona
sem JavaScript.

**Para quem vai a mensagem.** `lib/demo/degustacao-contato.ts` resolve o número
pelo `created_by_email` do passaporte, num mapa explícito; quem não estiver lá
cai no número público da Vertho (o mesmo do site). Comercial novo = uma linha no
mapa. A empresa do lead entra entre parênteses no texto, nunca com artigo
montado: "da Boehringer" e "do Grupo Sinal" pedem artigos diferentes.

⚠️ **O clique não é medido.** Só chega sinal quando a pessoa envia a mensagem.
Medir "clicou e não enviou" pede coluna nova em `demo_prospect_sessions` (DDL é
decisão do dono) ou um evento em `diag_eventos`; nenhum dos dois foi feito.

### Simuladores por papel e simulador de liderança (17/09/2026)

**Quem treina e quem acompanha** (decisão do dono). Atendimento e vendas são
treino de quem atende e vende. Gestor e RH não treinam: veem os mesmos destinos
como "Simulações de atendimento" e "Simulações de vendas", que abrem direto na
aba da equipe, sem a aba de treino, e não dependem da liberação por cargo (que
diz quem TREINA). A API recusa gravar treino de gestor e RH; o acompanhamento
segue. Régua única em `lib/simuladores/papel.ts`, usada no menu, no `/api/me`, no
gate das páginas e no contexto das duas APIs. Quem administra a plataforma segue
treinando (preview). O nome "Treino de atendimento" virou "Simulador de
atendimento".

**Simulador de liderança do gestor.** Item "Simulador de liderança" no menu do
gestor, que abre o trilho de liderança (variante Líder) em
`/dashboard/assessment?trilho=lideranca`. Só aparece quando ele responde o
trilho: módulo contratado, cargo liberado e dentro da população, pela mesma régua
da tela de mapeamento. O RH continua com a "Prontidão para liderança" (o
relatório da empresa) e não pratica simulador nenhum.

**Ligado no ACME demo e nas Escolas.** O dono ligou o módulo pelo painel em
17/09/2026 nos dois ambientes (cargo de referência: Gerente Comercial no ACME,
Coordenador(a) Pedagógico(a) nas Escolas) e gerou e reauditou os dez cenários do
trilho ali. 🔴 O reset reconstrói `sys_config` do fixture e apaga cargos,
competências e cenários: sem cuidado, às 04:00 o módulo desligava e a curadoria
sumia. Hoje (`lib/demo/simulador-lideranca-demo.ts`):
- a configuração do módulo que está no banco atravessa o reset, inclusive
  desligada; o padrão do perfil (só o ACME tem) entra quando o banco não tem nada;
- os cenários da matriz que estão no banco são lidos ANTES do wipe e voltam
  depois que a matriz global é reinstalada (`instalarMatrizLideranca`), apontando
  para a linha-cabeçalho da competência nova;
- `lib/demo/cenarios-lideranca/<ambiente>.json` é a rede de segurança: só entra
  com o módulo ligado e nenhum cenário no banco;
- os retratos do ranking fora do ACME ignoram os cargos-âncora ("Líder" e "Futuro
  Líder"), que não têm perfil ideal e lançariam no meio do laço.

⚠️ Com `um_por_dia` ligado (o valor gravado pelo painel), a persona de gestor da
sala responde UM cenário de liderança por dia, e ela é compartilhada por todos os
prospects até o reset.

### Os passaportes fora do ACME eram invisíveis (16/09/2026)

`isEmailDeConvidadoDemo` e `readAcmeProspectAuthContext` só conheciam o prefixo
`convidado.acme.`. `Medido`: os 3 passaportes do Grupo Sinal de 15/09 tinham
sessão criada e `personal_accessed_at` nulo, não apareciam no painel e o
assessment deles não era tratado como degustação. Hoje o e-mail técnico é lido
por `lerEmailDePassaporte` (prefixo registrado + 20 hex), e a listagem de
passaportes vale para qualquer ambiente de degustação. A faxina continua por
ambiente, de propósito.

### 🔴 A visão de RH listava os convidados pelo nome (16/09/2026)

A sala de apresentação entrega a visão de RH a todo prospect, e o RH enxerga a
empresa inteira. A tela Equipe e a Equipe em evolução listavam os convidados reais
(9 no `acme-demo`, 3 no `gruposinal`). Em tenant `is_demo` essas listas passam
por `recortarElencoDemo` (`lib/demo/elenco-visivel.ts`): aparece só o elenco
(`*.demo@vertho.ai`), por pertencimento. As visões agregadas já excluíam conta
interna.

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

⚠️ **Pausa é janela, não estado.** Vigente em 02/09/2026: `gruposinal` até
**07/09**, porque o Alpheu é convidado NOMEADO do perfil e o adiamento
automático só cobre passaporte no prazo D+2 — sem ela, o DISC e as respostas
dele viram nada às 04h. A do `escolas-acme` já saiu: com o golden congelado, o
reset reconstrói o conteúdo a partir do fixture, sem IA, e a pausa perdeu o
motivo. Guard: `tests/unit/demo-reset-pausa.test.ts` recusa pausa a mais de 30
dias — pausar é decisão legítima, pausa eterna é o reset desligado que ninguém
religa.

🔑 **A pausa protege o ambiente, não a visibilidade.** Ambiente oculto no
seletor (`TENANTS[slug].oculto`) tem os convidados fora do acompanhamento: em
02/09 o `gruposinal` está nas duas condições ao mesmo tempo — protegido do reset
e invisível na tela.

✅ **A do `gruposinal` venceu em 07/09 e a data cumpriu o papel dela**: o ciclo
voltou sozinho, e `Medido 15/09/2026:` o reset das 04h recriou o elenco (todos
os colaboradores com `created_at` 07:01 UTC). Nenhuma pausa vigora hoje. Com o
ambiente oferecendo passaporte desde 15/09, o motivo que a criou — proteger o
trabalho do convidado nomeado — tem caminho que não depende de ninguém lembrar
de uma data.

### Prazo, retenção e o que sobrevive ao reset (03/09/2026)

O passaporte vale **10 dias** (`DEGUSTACAO_DIAS_DE_VALIDADE`), até as 04h BRT do
décimo dia. Era 2, e a janela curta obrigava a conversa a acontecer em 48h.

⚠️ Mexer no prazo sozinho NÃO basta: o passe das visões 02–04 tem teto próprio
(`DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS`), e com a validade acima dele a
criação do passaporte falha em "validade do passe inválida".

**Vencer revoga o ACESSO, não o trabalho.** A conta do Auth é removida (a sessão
morre no próximo refresh) e `access_closed_at` é carimbado; o colaborador, o
DISC e as respostas ficam. Quem some de vez é quem passou de
`DEGUSTACAO_RETENCAO_DIAS` (30) desde o fechamento — a contagem é pelo
FECHAMENTO, não pela criação, senão quem cria o passaporte cedo e faz a
experiência semanas depois é apagado no meio.

**O convidado atravessa o reset.** O wipe passa a excluir os convidados do
ambiente (identificados pelo prefixo do e-mail) em `colaboradores` e
`respostas`; o resto é derivado e se refaz. Consequência: o adiamento do reset
por convidado ativo **saiu** — ele existia só para proteger esse trabalho, e com
validade de 10 dias deixaria o ambiente sem estado-base por semanas.

🔴 **Duas armadilhas que isso destrava, e que já custaram diagnóstico:**

1. `respostas_cenario_id_fkey` é **ON DELETE RESTRICT**. Preservar a resposta sem
   soltar o `cenario_id` faz o `delete banco_cenarios` violar a FK e derrubar o
   reset inteiro, de madrugada. Por isso `soltarCenarioDasRespostasPreservadas`
   roda ANTES do wipe — e o teste prende essa ordem.
2. A resposta preservada continua legível depois de o catálogo ser recriado com
   UUIDs novos porque `findAssessmentAnswer` casa por ID **ou por nome
   normalizado**. Sem esse fallback, preservar produziria resultado órfão.

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

⚠️ **O acompanhamento é por tenant**: até 01/09/2026 a leitura era fixa no
`acme-demo` e o Alpheu, convidado real do Grupo Sinal, nunca apareceu na tela.
Trocar o seletor de ambiente troca a lista.

Em **15/09/2026** o `gruposinal` passou a oferecer **passaporte** (era só ACME e
escolas): registro em `DEMO_PROSPECT_TENANTS` com prefixo próprio
(`convidado.gruposinal.`), os cargos do roster comercial (quatro na época; três desde 16/09/2026) em
`DEMO_PROSPECT_ROLES_POR_AMBIENTE` — apontando para a MESMA lista do ACME, não
uma cópia — e sala própria em `DEMO_PRESENTATION_ROOMS`
(`usuario-sinal` · `gestor-sinal` · `rh-sinal`), sem a qual a action recusa o
roteiro: ela exige as três visões do MESMO ambiente. O card do Grupo Sinal
também voltou ao seletor (`oculto` removido) — é a régua da própria tela:
ambiente fora do seletor é ambiente cujos convidados ninguém acompanha.

🔑 **Isso muda a resposta para "como dar uma degustação ao Alpheu".** Pela
conta corporativa dele (origem `cadastro`) o trabalho **não** atravessa o reset
— a preservação é pelo prefixo `convidado.<ambiente>.`, e o e-mail dele não tem
— então dependia de `resetPausadoAte`, que é janela e vence. Pelo passaporte, a
durabilidade vem por construção. A sala do Grupo Sinal ficou FORA do card de
sala ao vivo (`PRESENTATION_ROOMS`, na tela): a degustação a prepara sozinha, e
o ambiente segue sem ocupar espaço numa tela usada às pressas.

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

### "DISC aguardando" no acompanhamento é a VERDADE do banco (10/09/2026)

Funil das degustações ativas auditado: todas paradas na etapa 1, e **não é
carimbo perdido**. O DISC concluído grava `colaboradores.mapeamento_em` /
`perfil_dominante` / `disc_resultados` (`mapeamento-actions.ts:105-167`) e o
carimbo da etapa 2 sai de `recordAcmeProspectDiscCompletion`
(`acme-prospect-tracking.ts:210`); mesmo que esse carimbo falhe,
`listAcmeProspectProgress` relê `mapeamento_em` e preenche `disc_completed_at`
ao montar a tela (`acme-prospect-tracking.ts:245-259`) — ou seja, a tela já é o
valor auto-corrigido, e "Aguardando" nela significa DISC não concluído mesmo.

DISC começado e abandonado **não deixa rastro**: não existe tabela de progresso
parcial, então "abriu e largou no meio" é indistinguível de "nunca abriu".
Verificação ponta a ponta: `scripts/_degustacao-acme.mjs` (somente leitura).

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
- `DEMO_EXTRA_ROLES` (`lib/demo/reset-acme-demo.ts`): pacote COMPLETO de **Analista Financeiro**, **Coordenador de Operações** e **Gerente Comercial** (5 competências + 6 descritores cada + Top10 + cenários). O Gerente Comercial e o Diretor Geral entram em `DEMO_EXCLUDED_ROLES` (o fixture do acme só tinha o cargo + Top5 vestigial, sem competências/cenários); o Gerente é reconstruído aqui em pacote completo; o Diretor Geral segue fora da demo. Desde 16/09/2026 o Gerente Comercial está em `cargosSemAssessment` e nasce com Top 5 e foco vazios; a régua do cargo que só lidera é uma só (`lib/demo/rosters/cargo-sem-assessment.ts`) e vale no fixture (`seedCargos`), no cargo construído (`insertDemoExtraRoles`), nas respostas (`seedRespostas`) e no PDI individual da central do RH.
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

### 🔴 Convidado é POPULAÇÃO, não ELENCO (09/09/2026)

Desde 03/09 o convidado de degustação atravessa o reset — vencer revoga o
acesso, não apaga o que a pessoa fez. Certo, e com um efeito colateral que
custou uma semana: ele fica em `colaboradores` e passa a contar em toda
asserção de tamanho de elenco.

Duas exigiam `=== ACME_DEMO_TEAM_SIZE` (30) sobre a população inteira:
`seedAcmeRhReportCenter` (`lib/demo/reset-acme-demo.ts`) e
`buildAcmeOrganizationReportArtifacts` (`lib/demo/acme-organization-reports.ts`).
Com **quatro prospects na base, 34 ≠ 30** e as duas lançavam — depois de
`resetTenant` já ter apagado as tabelas. `Medido 09/09/2026:` o tenant ficou com
**3 relatórios de 35**, e a central do RH abria as abas Cargos e Prioridades em
"Leitura analítica ainda não disponível", porque o consolidado é um dos que não
nasciam.

A asserção continua valendo — ela protege contra elenco incompleto, que é erro
de seed real. O que estava errado era o denominador: hoje as duas filtram
`email` começando com `convidado.`. É também o certo para o documento — o Perfil
e o DNA descrevem a ORGANIZAÇÃO, e um prospect de passagem não faz parte dela.

Guard: `tests/unit/demo-convidado-fora-do-elenco.test.ts` (estático — o alvo é o
call-site; validado por mutação).

### 🔴 E o CLI dizia "ADIADO" com exit 0 (09/09/2026)

O motivo de ninguém ver o item acima por dias. `scripts/seed-acme-demo.ts` ainda
tinha o ADIAMENTO por passaporte ativo que o **cron abandonou em 03/09** — está
escrito em `app/api/cron/route.ts`: "com validade de 10 dias, adiar é
praticamente nunca resetar". A decisão entrou num caminho só.

Pior que divergir: o CLI imprimia `RESET ACME DEMO ADIADO` e saía com
**`process.exit(0)`**. Quem roda `npm run reset:demo` lê SUCESSO, e o reset não
aconteceu. **Caminho que DESVIA do trabalho não pode sair com código de
sucesso** — é a mesma classe do "200 vazia fura o fail-loud" (F-D1) e do
"`sucesso` = ACEITOU" do WhatsApp.

### Degustação: só entra cargo que PERCORRE a jornada (08/09/2026)

`DEMO_PROSPECT_ROLES_POR_AMBIENTE` já dizia isso em prosa. Prosa não é catraca:
em 01/09 a degustação escolar passou a oferecer `coordenacao-pedagogica` e em
02/09 a coordenação entrou em `cargosSemAssessment` (Top 5 zerado de propósito —
ela existe para adequação e gestão de equipe, não para percorrer a jornada).
Nenhuma das duas decisões estava errada sozinha, e o prospect que escolhesse
aquele cargo morria na etapa 01 em "Cenário para X ainda não foi gerado".

Guard: `tests/unit/degustacao-cargo-com-matriz.test.ts` cruza as duas listas
(cargo oferecido × `cargosSemAssessment` do roster). Verificação de ponta a
ponta: `scripts/_verificar-degustacao.ts` (cargo · matriz · cenário A).

**16/09/2026: o Gerente Comercial saiu da degustação do ACME e do Grupo Sinal**
(decisão do dono: o gestor só lidera). 🔴 Declarar o cargo em
`cargosSemAssessment` NÃO bastava, e o guard acima continuaria verde: ele compara
código com código. O Gerente Comercial é construído pelo reset, e o construtor
gravava o Top 5 cheio sem olhar a lista; com o Top 5 zerado de verdade, o Marcelo
seguiria contado como mapeado e o DNA Organizacional (24 contra 25) derrubaria o
reset depois do wipe. `tests/unit/demo-cargo-so-lidera.test.ts` cobre a régua do
cargo construído, o uso dela nos pontos do seed e o funil dos dois rosters
(ninguém que só lidera em mapeados, jornada, concluídos ou atrasados). O efeito no
banco chega no reset noturno (04:00, Brasília). O pacote offline
(`lib/demo/offline`) é uma foto congelada e ainda mostra o Marcelo avaliado.

## Pegadinhas
- `descriptor_assessments.nivel` é coluna **GENERATED ALWAYS** — capture/replay a descartam (senão o insert falha).
- `gerarTemporada` exige competência COM `descriptor_assessments` — passar `competencia` válida.
- O render do PDF via tsx falha (`Font family not registered: NotoSans`) — mas `report_texts` salva ANTES, e o PDF regenera on-demand no app (o que congelamos é o `report_texts`, não o binário).
- Tabela nova com FK para `colaboradores` precisa de `ON DELETE CASCADE` (ou entrar em `DEMO_RESET_TABLES`). O reset apaga trilhas, avaliações e cenários ANTES de `colaboradores`; uma FK que bloqueia faz ele abortar com o tenant pela metade. Aconteceu em 16 e 17/09/2026 com `video_publicacoes` (mig 248): a Marina amanheceu sem trilha e o `demo.reset` registrou `erro` no `admin_audit_log`. Corrigido na mig 258.

## Follow-ups (não feitos)
- ⛔ *(resolvido em 01/09)* Reset noturno cobria só o ACME: o Grupo Sinal era tenant demo desde 25/08 e **nunca foi recomposto**, e o preflight de convidados lia sempre o ACME (um convidado ativo lá adiaria o reset do vizinho).
- Tenant por vendedor (`acme-demo-<rep>`) contra colisão simultânea — o reset sob demanda mitiga.
- Season "em ANDAMENTO" de verdade (a trilha nasce gerada mas sem semanas concluídas).


### Cenários de Liderança e identidade da régua (17/09/2026)

As duas demos têm dez cenários revisados cada (cinco competências × duas variantes). A configuração atual usa Gerente Comercial no ACME Demo e Coordenador(a) Pedagógico(a) na Rede de Escolas ACME. Os fixtures de segurança foram atualizados depois da revisão; a curadoria corrente no banco continua prevalecendo.

`alternativas.descritores_ordem` congela os códigos na ordem usada ao construir cada cenário. IA3/check, IA4/check e reavaliação alinham a régua a esse vínculo: uma reinstalação da matriz não pode fazer D1 passar a representar outro comportamento. A recomposição preserva esse campo. Cenários antigos sem o campo mantêm a leitura histórica. Geração síncrona e batch passam a registrar a ordem; matriz incompleta ou divergente do snapshot gera erro explícito.

Validação: `tests/unit/simuladores/lideranca-ordem-cenario.test.ts` cobre reordenação das linhas, inconsistência da matriz e recomposição com novos IDs. As notas de qualidade do instrumento (`nota_check`, 0–100) são auditoria administrativa; o desempenho do participante segue a matriz N1–N4.
