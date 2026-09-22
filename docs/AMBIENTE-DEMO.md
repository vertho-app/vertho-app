# Ambientes de Demonstração

## Navegação, histórico ilustrativo e simuladores — 21/09/2026

- Os cartões de “Onde agir agora” usam o mesmo filtro da lista. Ao abrir uma ação, o título nomeia a pendência, o contador e a explicação identificam o grupo; “Voltar às sugestões” devolve o foco ao cartão de origem. A rolagem ocorre depois da renderização e respeita movimento reduzido.
- O gráfico semanal se adapta à largura disponível, permite selecionar uma semana e consultar a tabela acessível. Mantém a escala de 0 a 100%. Na visão geral dos três tenants de demonstração, o histórico editorial varia de 73% a 97% e aparece identificado como **Histórico ilustrativo**. Não altera métricas operacionais, pendências ou registros de pessoas. Recortes por área continuam medidos. O gate exige `is_demo=true` e um slug conhecido; clientes reais nunca recebem a série fictícia.
- Vendas e liderança não mostram mais o resumo “Revisão das devolutivas” acima dos indicadores de participação. Os formulários individuais de revisão e os registros existentes continuam disponíveis ao abrir uma devolutiva.

## Adoção e resultados do elenco online — 21/09/2026

A fotografia da degustação B representa uma operação com boa adoção e desenvolvimento visível, mantendo casos que precisam de apoio. Não altera métricas comerciais de convidados reais.

| Indicador do elenco | ACME / Sinal | Rede escolar |
| --- | --- | --- |
| Pessoas | 30 | 14 |
| Com perfil (base do reset) | 28 (93%) | 13 (93%) |
| Mapeamentos completos | 24 (80%) | 11 (79%) |
| Jornadas iniciadas | 22 (73%) | 11 (79%) |
| Jornadas concluídas | 19 de 22 (86%) | 9 de 11 (82%) |
| Competências em N3/N4 | 80% | 76% |
| Média do diagnóstico | 3,26 / 4 | 3,26 / 4 |

- A home recorta o elenco antes de contar, inclusive quando há turma. Visitantes não entram no numerador nem no denominador. Jornadas iniciadas são pessoas distintas com temporada ativa ou concluída; a conclusão não desaparece da adesão. Os cartões distinguem concluídas, em andamento e atrasadas. Atraso é subconjunto de em andamento.
- `adocao-resultados-fixture.ts` varia notas por pessoa, competência e descritor; o foco trabalhado usa o T0 de `evolucao-nucleo.ts` (2,2–2,8). Ganhos e classificações continuam na régua de produção. O fechamento grava `nota_cenario` explicitamente, compatível com a leitura externa dos dois cenários. O mesmo mix alimenta reset e atualização incremental: ACME/Sinal têm 15 evoluções confirmadas, 2 parciais e 2 estáveis; escola tem 7, 1 e 1. Bruna e Marina continuam navegáveis no meio da jornada, com conteúdo e evidências preservados.
- `sincronizar-adocao.ts` valida tenant demo e elenco completo antes de escrever. Atualiza notas, fechamento, progresso, cadência, eventos editoriais e PDIs sintéticos do apoio. IDs de eventos são determinísticos; reexecutar com o mesmo relógio não duplica linhas. A data das personas ativas acompanha o progresso já existente; Rafael e Eduardo preservam os casos de atraso.
- O reset chama a sincronização após artefatos aquecidos e antes de regenerar as leituras de gestor/RH. O script operacional usa o mesmo helper com backup externo ao repositório. Leitura, nível e PDF derivam das notas reais do fixture; PDFs afetados são invalidados. Consultas do panorama e dos documentos organizacionais paginam descritores (os simuladores levam a ACME acima de mil registros).
- `seed-engajamento.ts` completa o retrato do consumo: preferências variadas no apoio, reprodução editorial associada a semanas concluídas e exemplos de tira-dúvidas no contrato real do transcript. Não envia mensagens, não chama IA e não registra eventos como se viessem do provedor de vídeo. Reprodução fica marcada por `raw_payload.demo_fixture` e IDs `demo:`; diálogos já existentes são preservados. Consumo médio entre quem prefere vídeo: 95% ACME, 83% Sinal e 100% no pequeno grupo escolar.
- Onde os simuladores estão habilitados, 90% do elenco é selecionado, respeitando acesso por cargo. A maioria dos resultados está em N3/N4, há novas tentativas e mais encontros de liderança concluídos. Interações que alteraram um fixture são preservadas. Não são habilitados módulos desativados.
- Os percentuais publicados podem avançar quando alguém interage com uma persona: o Sinal já tinha 29 perfis no início desta revisão, e isso foi preservado. Os pacotes offline continuam sendo retratos datados, independentes do banco online.

Validação: 533 testes relacionados passaram; comparação antes/depois e repetição idempotente sobre cópias dos três tenants; testes de recorte do elenco, paginação acima de mil notas, falha parcial, régua e PDI. Backups e evidências ficam em `output/demo-adocao-20260921/` no workspace, fora do repositório público.

## Correções do QA e medição do funil — 21/09/2026

- **Entrada e PDF publicados:** quatro entradas concorrentes ACME/Sinal passaram sem retry externo; PDF RH do Sinal respondeu 200 em visualização e download. A migração 266 protege geração + consumo de OTP por identidade entre instâncias, nas salas e na entrada pessoal das versões A/B. Convite válido com indisponibilidade volta à degustação. Nome de PDF usa fallback ASCII e `filename*=UTF-8''`.
- **Leituras coerentes:** `lib/demo/relatorios-coerentes.ts` deriva texto, cartões, níveis e distribuições de `descriptor_assessments`, do Top 5 e do elenco do roster. O RH considera somente mapeamentos completos e explicita o recorte; o gestor explicita tamanho da equipe, completos e parciais. Sinal: 8 liderados, 24 mapeamentos completos e 120 avaliações de competências no RH. Marina: Gestão da Aprendizagem N3, 3,10. A personalização da marca é idempotente. Sincronização aplicada aos três tenants, com backup local dos relatórios anteriores; o reset a executa depois dos artefatos aquecidos. PDFs anteriores são invalidados para regenerar o conteúdo corrigido.
- **Medição v1:** migração 267 aplicada. O formulário de contato usa `rel="noopener"` (não `noreferrer`: em POST o navegador envia `Origin: null` e a proteção corretamente recusa). O POST de contato funciona sem JavaScript e registra `contact_clicked_at` antes de redirecionar ao WhatsApp; não envia mensagem. As telas instrumentadas só montam o beacon quando o conteúdo carregou: perfil, PDI, jornada, engajamento, evolução e adequação; PDF exige a primeira página renderizada. Dois segundos de visibilidade registram a primeira exploração por convite. A rota confere origem, ticket, tenant, persona autenticada e validade/fechamento no banco. Escritas deduplicadas por coluna nula, sem respostas do DISC, texto de mensagens ou tokens persistidos.
- **Taxa:** convites B com `telemetry_version=2026-09-21.v1`, abertos e retidos neste ambiente; numerador = os que tiveram uma exploração relevante. Históricos sem instrumento, versão A e testes internos ficam fora. O formulário oferece a marca de teste; prefixos QA / TESTE INTERNO também são reconhecidos. A consulta é paginada para não truncar a métrica; só os cartões visíveis são limitados aos 50 mais recentes. Clique no contato é intenção, não conversa confirmada. A retenção segue a sessão do convite (sem tabela paralela de eventos).
- **Evolução:** o estado sem comparação explica a reavaliação ao final da jornada e oferece retorno à temporada. Não pede que a pessoa repita um mapeamento já feito.
- **Acessibilidade e hidratação:** setas do DISC identificam palavra e direção; estrelas identificam formato, nota e seleção. Download do PDF mantém nome acessível no celular. A data do cabeçalho administrativo tem render inicial determinístico e fuso explícito, sem `suppressHydrationWarning`.

Validação desta rodada: 468 testes relacionados passaram, incluindo isolamento de eventos, recusa de convite encerrado, falhas de banco, paginação acima de 500 convites, nível de Marina e idempotência da marca. Reprodução do erro de hidratação na virada UTC/Brasília; componente corrigido sem erro em Brasília e Tóquio. Os testes publicados finais estão registrados no relatório local `output/degustacao-correcoes-20260921/relatorio-qa.md` do workspace.

## Retorno aos painéis e mapeamento responsivo — 21/09/2026

As telas das salas online mostram, no topo, **Voltar ao painel do RH**, **Voltar
ao painel do gestor** ou **Voltar ao início do colaborador** quando a pessoa está
fora da home daquele papel. Na rede escolar, os rótulos usam direção, coordenação
e professor. O retorno não depende do histórico do navegador nem da dica de
perguntas: continua disponível depois de dispensá-la e recarregar a página.

Quem veio do convite também vê **Início da degustação**, com o mesmo código curto
da sua sessão. Esse link sai da prévia em iframe quando o dispositivo escolhido
é celular. Os seletores de papel e dispositivo continuam disponíveis no rodapé.

O DISC tem um contêiner de até 1.200 px: vídeo e orientações lado a lado no desktop,
instruções ao lado das respostas nos rankings/pares e preferências em duas colunas.
No celular, os blocos ficam em uma coluna; a escala de estrelas tem área de toque
de 44 px. Todas as etapas oferecem **Voltar ao início**, apontando para `/dashboard`.
Para o convidado B, essa rota devolve ao roteiro do seu convite. Não apontar para
`/dashboard/perfil-comportamental`: sem resultado, essa página redireciona para o
mapeamento e causa um ciclo de navegação.

Regressão: `tests/unit/degustacao-navegacao.test.ts` cobre os destinos nos nove papéis,
códigos inválidos, saída do iframe e retorno do DISC sem o ciclo do perfil vazio.

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
- **Jornadas/trilhas de 7 semanas** no `acme-demo`: 6 semanas de conteúdo e fechamento na semana 7. A Bruna mantém a **temporada 2 ativa** na semana 1 e também uma **temporada 1 concluída**, com 7/7 semanas, conteúdo congelado de Negociação e Fechamento, Evolution Report e certificado. Na visão Usuário, o histórico abre por **Jornada → Ver histórico** (`/dashboard/jornada/historico`); o Grupo Sinal continua no programa regular de 14 semanas.
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

No `acme-demo`, o reset chama `ensureBrunaAcmeDemoHistory`
(`lib/demo/bruna-history.ts`) depois de restaurar os artefatos da persona. A rotina é
idempotente: renumera a jornada corrente para temporada 2 somente quando necessário e
recria uma temporada 1 concluída sem IA. Cadência e sinais usam sempre a trilha de maior
`numero_temporada`, portanto o histórico não desloca a Bruna da semana atual nem infla o
acompanhamento operacional.

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
| Ordem | você, colaborador, gestor, RH | RH, gestor, colaborador; perfil opcional |
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
cai no contato comercial da degustação, **5511973882303** (alterado em 21/09/2026). Comercial novo = uma linha no
mapa. A empresa do lead entra entre parênteses no texto, nunca com artigo
montado: "da Boehringer" e "do Grupo Sinal" pedem artigos diferentes.

⚠️ **O clique não é medido.** Só chega sinal quando a pessoa envia a mensagem.
Medir "clicou e não enviou" pede coluna nova em `demo_prospect_sessions` (DDL é
decisão do dono) ou um evento em `diag_eventos`; nenhum dos dois foi feito.

### Orientação dentro das visões (18/09/2026)

**O que faltava.** O convite entrega três visões prontas e a pessoa cai numa tela
de produto real, com o menu inteiro, sem saber o que olhar primeiro. `Medido
18/09`: a única convidada que atravessou a experiência abriu as três visões em
quatro minutos e não abriu nada dentro delas.

**Como é.** Um bloco no topo da tela inicial de cada papel, com até quatro perguntas
que executam a ação. Aparece só para quem chegou pelo convite (a sala guarda o
código de volta em `sessionStorage`), só na casa daquele papel, e some quando a
pessoa dispensa. Não é tour: não cobre menu nem bloqueia navegação.

| Papel | Para onde manda olhar |
|---|---|
| Gestor (Carla / coordenação) | Engajamento, acompanhamento de Bruna/Marina e evolução de cada pessoa |
| RH (Helena / direção) | Engajamento, evolução, aderência aos cargos e cultura da organização |
| Participante (Bruna / Marina) | Aplicar o aprendizado na jornada, descobrir o que desenvolver no PDI e entender o próprio perfil |

**A linha começa pela DOR, em pergunta** (refinamento do dono, 18/09: "os textos
ainda explicam a navegação"). A pergunta de cada papel nasceu para ser o título
do vídeo comercial daquele papel, para as duas pontas contarem uma história só.
**Em 21/09/2026 os vídeos saíram do escopo**: as perguntas passaram a carregar
a história sozinhas, e o plano de storytelling ficou arquivado como superado no
workspace (`output/plano-degustacao-b-storytelling.md`). ⚠️ E ela não pode
prometer o que a tela desmente: "quem precisa de apoio?" foi descartada porque
o KPI logo abaixo da dica diz "PRECISAM DE APOIO: 0 · ninguém parado".
Guardado por teste.

**Régua de conteúdo** (`lib/demo/degustacao-orientacao.ts`, puro): a casa de cada
papel é conferida contra o `homePath` da sala por teste, porque divergir ali faz
a dica nunca aparecer, sem erro nenhum. 🔴 **Pessoa se aponta por e-mail de
persona, nunca por id**: o reset das 04:00 recria os colaboradores, e o id só é
resolvido no momento da visita (`degustacao-orientacao-servidor.ts`, escopado no
tenant). Persona que não existe mais perde o link; o resto da linha continua.

Conferido no banco e na tela antes de escrever a copy: a jornada da Bruna está
na semana 1 de 7 (progresso 0/7, semana 2 libera na segunda) com as cinco
devolutivas prontas, cinco colegas do mesmo time já concluíram as 7, e o
`gestor_email` dela é o da persona de liderança nos três ambientes, que é o que
faz o link passar pelo gate de posse. A Marina é o espelho disso nas escolas
(3 semanas, 2 concluídas).

### Degustação B: RH primeiro e simuladores preenchidos (21/09/2026)

O primeiro card, o selo **Comece por aqui** e a ação **Explorar** agora abrem o RH
(direção na demo escolar). Seguem gestor/coordenação e colaborador/professor.
Convite e faixa de etapas do painel acompanham essa ordem. As perguntas acima
aparecem em três colunas para gestor/participante e duas para RH no computador;
no celular, uma coluna, com alvos de pelo menos 44 px.

`lib/demo/seed-simuladores.ts` popula somente o elenco fictício registrado de
tenants da allowlist com `is_demo=true`, respeitando módulos e acesso por cargo.
Atendimento e vendas não semeiam treinos para quem só acompanha. As sessões
usam `owner_key=colab:<id>`: testes de admin ficam fora das métricas da equipe.
`simuladores-fixture.ts` fornece conversas, devolutivas, pesquisa e encontros
editoriais, com origem explícita de demonstração e sem chamadas de IA.

O reset canônico executa o seed depois de personas e panorama. IDs estáveis por
tenant/e-mail permitem religar os históricos depois da troca de UUID das personas;
datas relativas mantêm os treinos nos filtros recentes. Uma execução incremental
preserva registros que não pertencem ao fixture e jornadas que já receberam
interações. Mapeamento e treino têm fontes separadas; o primeiro inclui notas por
descritor e respostas com evidências, sem derivar avaliação formal do simulador.

População inicial conferida no banco e nos painéis em 21/09:

| Ambiente | Atendimento | Vendas | Liderança | Mapeamento |
|---|---|---|---|---|
| ACME | 25 treinos | 25 treinos | 20 jornadas / 65 encontros | 16 completos, 4 incompletos, 10 não iniciados |
| Escolas | Módulo não habilitado | Módulo não habilitado | 9 jornadas / 30 encontros adicionados; jornada prévia preservada | 8 completos, 2 incompletos, 4 não iniciados |
| Grupo Sinal | Módulo não habilitado | Módulo não habilitado | Módulo não habilitado | Módulo não habilitado |

Os quatro quadrantes de liderança têm exemplos nos dois ambientes habilitados.
O aviso existente de seis medidas sem discriminação no gabarito continua visível.
Validação: 758 testes passaram (80 arquivos; 56 casos de integração não executados),
TypeScript e build de produção aprovados. O build local usou temporariamente a raiz
do workspace no Turbopack para aceitar a junction de dependências do worktree;
`next.config.mjs` foi restaurado. Evidências e backup anteriores à população estão
em `output/degustacao-ajustes-20260921`, fora do repositório público.

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
da tela de mapeamento. O RH continua com o "Mapeamento de liderança" (antiga
Prontidão, o relatório da empresa) e não pratica simulador nenhum.

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
- **21/09/2026 — entrada simultânea e PDF.** A geração de outro OTP para a mesma persona invalida o anterior: reproduzido com duas entradas paralelas. A migração 266 serializa geração + consumo por hash da identidade, inclusive entre ACME e Sinal; o helper reutiliza a sessão correta e repete erros transitórios com um token novo. Convite válido com indisponibilidade volta à própria degustação, sem alegar expiração. O PDF usa `filename` ASCII e `filename*=UTF-8''`, preservando nomes com travessão. Validação: 42 testes direcionados, typecheck e build; quatro autenticações simultâneas reais com sucesso. Produção conferida: quatro entradas simultâneas sem retry externo e PDF do Sinal 200 em visualização/download.
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
