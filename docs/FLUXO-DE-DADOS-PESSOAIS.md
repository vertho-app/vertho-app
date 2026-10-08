# Fluxo de dados pessoais: levantamento técnico

> **O que este documento é:** um mapa do que o sistema coleta, onde guarda e para quem envia,
> levantado **no código e no banco** em 14/08/2026 e **revisado no código em 03/10/2026**
> (fase 2 da revisão de 02/10: máscara de PII, avaliação sem nome, subprocessadores e voz).
> Serve de insumo para quem for redigir a política de privacidade e o contrato de tratamento
> de dados. A política pública (`app/privacidade/page.tsx`) é conferida contra ele.
>
> **O que ele NÃO é:** não é a política de privacidade, não é análise jurídica e não classifica
> nada como "dado sensível" no sentido legal. Essa leitura é de quem entende de direito digital.
>
> **Por que existe:** o modelo de política que circulou em 14/08 dizia *"Compartilhamos dados
> apenas com a Meta Platforms"*. São dezenove destinos externos fixos (mais quatro provedores
> de IA selecionáveis, §2.3), e o mais relevante não é o WhatsApp: é a IA, que recebe avaliação
> de desempenho.
>
> **Regra de manutenção:** fluxo novo que manda dado de pessoa a um fornecedor entra na tabela
> da §2 no mesmo commit, com a coluna "mascarado" preenchida. Linha "sim" só com teste que
> prova a máscara no prompt (os testes de 03/10 estão citados em cada linha).
>
> **Adendo de 06/10/2026:** a §2.2 ganha quatro fluxos que mandam nome de pessoa e não estavam na
> tabela (adequação ao cargo, leitura executiva do Fit, Copiloto de reunião e assistente comercial),
> e a §2.3 registra o que se mediu sobre treinamento e retenção nos provedores. Conferido contra
> `origin/master` (`586c56d8`): nenhum desses quatro importa o mascarador.

---

> **Treinamento comercial, 06/10/2026:** o criador e o cliente dos três níveis passam
> a usar Kimi K3 hospedado na AWS Bedrock, com autorização específica do dono e
> a máscara existente. O escopo e os resíduos de dados pessoais estão na §2.3.

## 1. O que é coletado

### 1.1 Cadastro (`colaboradores` — 400 registros)

`nome_completo`, `email`, `telefone`, `whatsapp`, `foto_url`, `cargo`, `gestor_nome`,
`gestor_email`, `gestor_whatsapp`.

O cadastro é feito **pelo contratante** (secretaria/escola), em massa, não pelo próprio titular.

### 1.2 Avaliação de desempenho — o núcleo do produto

| Tabela | Linhas | Conteúdo |
|---|---|---|
| `descriptor_assessments` | 1.224 | Nota e nível por descritor de competência, por pessoa |
| `respostas` | 228 | Respostas a cenários situacionais, com `nome_colaborador`, `email_colaborador`, `whatsapp` |
| `mensagens_chat` | — | Conversa da pessoa com a Mentora IA (texto livre) |
| `trilhas` | 49 | Plano individual de desenvolvimento |
| `colaboradores.comp_*` / `lid_*` | — | Perfil comportamental (DISC) |

Isto descreve **como uma pessoa foi avaliada no trabalho**. Quem é avaliado, na operação atual,
é majoritariamente professor e diretor de rede pública.

### 1.3 Comunicação

| Tabela | Linhas | Conteúdo |
|---|---|---|
| `notification_deliveries` | 972 | Registro por mensagem: canal, status, entrega, leitura |
| `whatsapp_mensagens_recebidas` | 0 | Texto do que a pessoa responde no WhatsApp (mig 212) |
| `fase4_envios` | 37 | `nome`, `email`, `whatsapp`, carimbos por canal |
| `colab_otp` | — | `telefone` + hash do código de acesso |
| `notification_endpoints` | 5 | Inscrição de push (identifica o aparelho) |

### 1.4 Comercial (titulares que não são colaboradores)

`diag_leads`, `sales_contacts`, `radarempresas_estabelecimentos` (nome, e-mail, telefones de
contato de escolas/empresas prospectadas).

---

## 2. 🔴 O que sai para a IA

### 2.1 Como funciona a máscara (desde 03/10/2026)

`lib/pii-masker.ts` troca a identidade da pessoa por um identificador estável (`COLAB_1A2B`,
derivado do id do colaborador) antes da chamada, e devolve o nome depois dela:

- **Ida** (`maskTextPII`): nome completo, nome composto ("Ana Beatriz", "Maria do Socorro"),
  primeiro + último nome e o primeiro nome isolado viram o identificador, com fronteira de
  palavra que entende acento ("Ana" não casa dentro de "Análise"). O e-mail cadastrado vira um
  e-mail-identificador; qualquer outro e-mail, telefone ou CPF vira `[email]`, `[telefone]`,
  `[cpf]`.
- **Volta** (`unmaskPII`): o identificador vira o **primeiro nome** no texto que a pessoa ou o
  RH leem (no simulador de vendas, o nome completo, que é o que o cenário sempre trouxe).
- Os dois sentidos são mapas **separados**. Até 03/10 era um mapa só, e a máscara trocava o
  nome completo pelo identificador e o identificador de volta pelo primeiro nome, no mesmo
  passo: o texto ia à IA com o nome da pessoa (R-05 da revisão de 02/10).

**Limites, ditos com todas as letras:**

1. Só o nome e os contatos da **própria pessoa**. Nome de terceiro citado na resposta ("conversei
   com a Joana") segue como foi escrito: não há reconhecimento de nomes próprios.
2. Primeiro nome que também é palavra comum ("Clara", "Rosa", "Vitória", "Will"...) só é
   mascarado com inicial maiúscula, para "comunicação clara" não virar "comunicação COLAB_1A2B"
   na evidência avaliada. A lista é explícita em `NOMES_QUE_SAO_PALAVRAS`.
3. Voz não se mascara: áudio vai como áudio (§2.4).
4. O identificador é um hash curto do id: serve para tirar o nome do texto, não é
   pseudonimização no sentido jurídico (quem tem o banco refaz o de-para).

### 2.2 Tabela por fluxo

"Mascarado: sim" quer dizer: nome e contatos da pessoa substituídos antes da chamada, provado
por teste. Provedor de IA: o padrão é **Anthropic** (Claude), com fallback de provedor para
**OpenAI** quando o Claude está sobrecarregado; várias tarefas têm o modelo configurável por
empresa (§2.3), e aí o provedor é o do modelo escolhido.

| Fluxo | Dado pessoal que vai | Provedor | Mascarado? | Onde / teste |
|---|---|---|---|---|
| Conversas da semana (Evidências, missão, cenário escrito) | falas da pessoa, falas anteriores da IA, compromisso | IA do pipeline | **sim** | `app/api/temporada/reflection` · `tests/unit/security/pii-rotas-jornada.test.ts` |
| Extração de fim de conversa da semana | transcrição inteira | IA do pipeline | **sim** (resultado desmascarado antes de gravar) | idem |
| Tira-Dúvidas: conversa | pergunta, histórico, plano de desenvolvimento | IA do pipeline | **sim** | `app/api/temporada/tira-duvidas` |
| Tira-Dúvidas: busca no acervo | a pergunta da pessoa | **Voyage** (vetor da consulta) | **sim**; e `lib/rag.ts` tira e-mail, telefone e CPF de qualquer consulta | idem |
| Conversa qualitativa (semana da acumulada) e a extração dela | falas, insights das semanas anteriores | IA do pipeline | **sim** | `app/api/temporada/evaluation` · mesmo teste |
| Cenário B, arguição e extração da arguição | respostas, defesa oral | IA do pipeline | **sim** | `lib/season-engine/arguicao.ts` · `tests/unit/arguicao.test.ts` |
| Avaliação acumulada (1ª IA e auditor) | evidências das semanas | IA do pipeline + auditor de outra família (configurável) | **sim** | `lib/season-engine/avaliacao-acumulada-core.ts` |
| Fechamento: nota, redação final e auditor | respostas do cenário, evidências, acumulado gravado | IA do pipeline + auditor | **sim** (o acumulado gravado, que tem o nome, é remascarado) | `lib/season-engine/fechamento-core.ts` · `tests/unit/fechamento-core.test.ts` |
| Regeração do fechamento pelo admin | idem + auditoria anterior | idem | **sim** | `app/admin/vertho/auditoria-sem14/actions.ts` |
| IA4: nota das respostas do mapeamento (síncrono e lote) | respostas, cargo, perfil DISC | modelo da tarefa `ia4_avaliacao` (Batch API da Anthropic no lote) | **sim** | `lib/ia4-avaliacao.ts`, `trigger/gerar-ia4-batch.ts` · `tests/unit/avaliacao-sem-nome.test.ts` |
| Auditoria da IA4 (síncrono e lote) | respostas, avaliação gravada | modelo da tarefa `ia4_check` | **sim** | `lib/check-ia4-core.ts` · idem |
| Reavaliação da IA4 | respostas, avaliação anterior, auditoria | modelo da tarefa `ia4_avaliacao` | **sim** | `lib/ia4-reavaliacao.ts` · idem |
| PDI: gerador e auditor (síncrono e lote) | respostas, parecer da IA4, plano, perfil | modelo da tarefa + auditor `pdi_check` | **sim** (o PDI grava com o primeiro nome) | `lib/relatorio-individual-prompt.ts`, `lib/relatorios/individual-core.ts` · idem |
| Beto no app | mensagem, histórico, perfil comportamental, plano, cargo | Anthropic | **sim** | `app/actions/beto.ts` · `tests/unit/conversas-pii.test.ts` |
| Beto no WhatsApp: texto | mensagem, histórico de 24 h, nome e cargo do cadastro, empresa | **Google** (Gemini) | **sim** (resposta desmascarada antes da checagem de conduta) | `lib/whatsapp/suporte-auto.ts` · `tests/unit/integrations/suporte-auto.test.ts` |
| Beto no WhatsApp: áudio | **a voz da pessoa** | **Google** (Gemini) | **não** (voz não se mascara) | idem, §2.4 |
| Simulador de vendas | nome do vendedor, falas, planejamento | modelo PACE configurado | **sim** (nome vira identificador em todas as etapas; falas já sem contato) | `lib/simulador-vendas/ai.ts` · `tests/unit/simulador-vendas-ai.test.ts` |
| Simulador de liderança | falas | modelo configurado | nome não é enviado; falas sem e-mail, telefone e CPF | `lib/simulador-lideranca/service.ts` |
| Treino de atendimento: texto | falas digitadas | modelo configurado | nome não é enviado; falas sem e-mail, telefone e CPF | `lib/recepcao/ai.ts` |
| Treino de atendimento: voz | **a voz da pessoa** (transcrição) | **OpenAI** (Whisper) | **não** | `app/api/recepcao/voz/route.ts` |
| Conversa de mapeamento (`/api/chat`) | falas da pessoa | IA do pipeline | nome não é enviado; **falas vão como digitadas** (sem tirar contato) | `app/api/chat/route.ts` |
| Relatório do gestor | nomes da equipe, **nome e e-mail do gestor**, níveis | modelo da tarefa | **não, por desenho** (o relatório é sobre pessoas nomeadas) | `lib/relatorios/gestor-rh-core.ts` |
| Relatório do RH | nomes, cargos, níveis | modelo da tarefa | **não, por desenho** | idem |
| Plano de desenvolvimento (blueprint), síncrono e lote | nome, cargo, perfil, competências | modelo da tarefa | **não** (pendente: é a base do PDI, que já é mascarado) | `lib/blueprint/core.ts`, `trigger/gerar-blueprint-batch.ts` |
| Relatório comportamental (DISC) e insights executivos | nome, perfil DISC | modelo da tarefa | **não** | `lib/prompts/behavioral-report-prompt.js`, `lib/prompts/insights-executivos-prompt.js` |
| Devolutiva comportamental em áudio | primeiro nome no roteiro e na voz | modelo da tarefa + **Google** (TTS) | **não, por desenho** (a voz diz o nome) | `lib/relatorio-comportamental/devolutiva-audio.ts` |
| Saudação nominal do vídeo | primeiro nome | **Google** (TTS Vertex, chamado pelo app/Trigger desde 07/10/2026; antes, pela box de render) | **não, por desenho** | `lib/video/saudacao-vertex.ts`, `worker-hetzner/personalizar.mjs` |
| Fase 5 (evolução) | nome, cargo, respostas | modelo da tarefa | **não** | `actions/fase5/evolucao.ts` |
| Simulador de conversas (ferramenta do admin) | nome, cargo | modelo escolhido | **não** (ferramenta interna, gera respostas sintéticas) | `actions/simulador-conversas.ts` |
| Adequação ao cargo: análise por pessoa | nome de várias pessoas por chamada, aderência, perfil DISC e gaps; a resposta volta indexada pelo nome | modelo configurado | **não** | `lib/adequacao-cargo/narrative.ts` |
| Leitura executiva do Fit | nome, resultado do fit (gaps, forças e alertas) | modelo configurado | **não** | `actions/fit-v2.ts`, `lib/prompts/fit-executive-prompt.js` |
| Copiloto de reunião (ao vivo, planejamento e memória da conversa) | falas da reunião, nome e cargo dos participantes do cliente, notas do CRM; **terceiros, não colaboradores** | **Anthropic** (leitura ao vivo em Haiku, planejamento e memória em Sonnet; desde 08/10/2026), **Google** (Gemini, reserva da leitura ao vivo) e **OpenAI** (só a pesquisa pública do Copiloto, `copiloto_pesquisa_*`, com busca na web) | **não** | `app/api/copiloto/`, `lib/copiloto/conversation-analysis.ts` |
| Assistente comercial (objeções e contexto da oportunidade) | nome e função do contato, texto digitado pelo representante | modelo configurado (padrão Anthropic) | **não** | `actions/sales/ai-assistant.ts` |

### 2.3 Provedores de IA

| Provedor | Papel | Onde |
|---|---|---|
| **Anthropic** (Claude) | padrão da maior parte do pipeline; Batch API nos lotes; desde 08/10/2026 também os simuladores PACE (vendas e liderança), o Copiloto (ao vivo, planejamento, memória) e o brief da escola, que antes rodavam em OpenAI ou Google | `actions/ai-client.ts`, `lib/ai-batch.ts` |
| **OpenAI** | fallback de provedor, auditores cross-família, Batch API do check, pesquisa web do Copiloto, transcrição (Whisper) | idem, `app/api/recepcao/voz` |
| **Google** (Gemini) | Beto no WhatsApp (texto e áudio), síntese de voz (vídeo, devolutiva, podcast) | `lib/whatsapp/suporte-auto.ts`, `lib/gemini-tts.ts`, `worker-hetzner/` |
| **Amazon Web Services (AWS Bedrock)** | Kimi K3: criador de cenários e cliente nas dificuldades baixa, média e alta no treinamento comercial Vertho; nome do vendedor e contatos mascarados, nomes de terceiros em texto livre podem permanecer | `lib/bedrock-vendas-vertho.ts`, `lib/simulador-vendas/ai.ts`, `actions/ai-client.ts` |
| **Voyage** | vetores do acervo de conteúdo e da pergunta do Tira-Dúvidas | `lib/embeddings.ts`, `lib/rag.ts` |
| Moonshot (Kimi), xAI (Grok), Alibaba (Qwen), Meta (Muse) | **não declarados na política**. Desde 03/10/2026 (R-45) só rodam nas tarefas liberadas abaixo, nenhuma com dado de pessoa; fora da escada de fallback | `lib/ai-tasks.ts` (`TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS`), `lib/ai-regua-privacidade.ts` |

**Decisão do dono (R-45, 03/10/2026): restringir, não declarar.** Ledger de 90 dias medido no
mesmo dia: os quatro só rodaram em teste, comparação e canário; nenhuma funcionalidade de
produção dependia deles.

**Exceção autorizada pelo dono em 06/10/2026:** Kimi K3 hospedado na AWS Bedrock
roda no criador e nos clientes das dificuldades baixa, média e alta do treinamento
comercial. Gemini fica nos auxiliares e Sonnet 5.5 na avaliação.
A execução exige o ID fixo do tenant Vertho, modelo exato e apenas
`sim_vendas_criador` / `sim_vendas_cliente` (`lib/bedrock-vendas-vertho.ts`).
AWS Bedrock está declarado na política pública; a API direta Moonshot, outros
tenants, PDI, avaliação e seletores gerais continuam sob a restrição original.
O nome do vendedor e contatos são mascarados antes do envio, com o resíduo de
nomes de terceiros em texto livre descrito na §2.1. O perfil `global` usa endpoint
us-east-1 e pode rotear mundialmente, sem garantia de residência no Brasil.
A [AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)
informa que fornecedores de modelos não acessam prompts e respostas nas contas
de deployment operadas por ela; não se afirma ausência geral de retenção.

- **A régua é uma lista de PERMISSÃO.** Só as tarefas em `TAREFAS_LIBERADAS_FORA_DAS_DECLARADAS`
  (`lib/ai-tasks.ts`) aceitam provedor não declarado, cada uma com o que o prompt recebe escrito
  ao lado: `conteudo_tags`, `conteudo_expansao_pdf`, `conteudo_layout_plan`,
  `cenarios_lote_check`, `descritor_reancoragem` e o canário de contrato. Tarefa nova nasce
  restrita, e chamada sem `taskKey` também.
- **Ficaram de fora, de propósito, as tarefas que não leem pessoa mas recebem o PPP** (IA1, IA2,
  IA3 e o check, Cenários B e o check, kit, roteiros de conteúdo, vídeo do avatar, brief da escola):
  a extração do PPP (`actions/ppp.ts`) não remove nome de gestor, então não dá para afirmar que
  esses prompts saem sem nome de pessoa. Liberar uma delas é acrescentar a linha com o motivo,
  depois de anonimizar o PPP ou de o dono aceitar o risco por escrito.
- **Onde vale.** Na escolha: o seletor por tarefa (Configurações da empresa → IA) só oferece o que
  a tarefa permite, e os seletores que servem várias tarefas (modelo padrão, pipeline da empresa,
  Fase 4, simulador do admin, extração de PPP) só oferecem Anthropic, OpenAI e Google; o
  `salvarConfig` recusa o resto. Na execução: `callAI` e `callAIChat` trocam um modelo não
  permitido pelo default declarado da tarefa e registram `modelo-nao-declarado` em
  `degradacao_log` (sem lançar, porque é entrega); `getModelForTask` faz o mesmo com o
  `sys_config` gravado. Na escada de fallback: o `grok-4.6` saiu, e um `AI_FALLBACK_MODEL` de
  env não declarado também é recusado. Testes: `tests/unit/security/ia-provedor-nao-declarado.test.ts`.
- **Comparação entre modelos usa dado SINTÉTICO ou MASCARADO.** Em julho e agosto, três
  comparações mandaram ao Kimi o PDI de pessoas reais (levantamento da revisão de 02/10). E o aluno
  sintético do simulador de temporada (`sim_aluno`) rodou 881 vezes no Kimi entre 24 e 27/08; no
  código de hoje o histórico que ele recebe traz o primeiro nome e o cargo da pessoa real cuja
  trilha é simulada (`lib/season-engine/simulador-core.ts`). Com a régua, essas chamadas cairiam no
  default declarado. A regra que fica: bake-off, piloto e leitura cega entre modelos montam a
  entrada com dado sintético ou passado pela máscara da §2.1, mesmo entre provedores declarados.
- **Resíduo conhecido:** o Modo Cena (só em scripts) tem o leitor fixo em `grok-4.6`
  (`lib/season-engine/cena/core.ts`, `MODELO_LEITOR`) e lê a fala do avaliado. A régua troca esse
  modelo pelo default declarado (Claude), o que tira a independência de família entre o leitor e o
  personagem. Se o Modo Cena voltar, o leitor precisa de um modelo declarado de outra família.

⚠️ **Pergunta que o jurídico vai fazer e a engenharia precisa responder:** os contratos com esses
provedores incluem cláusula de **não-treinamento** com os dados enviados? Isso depende do plano
contratado em cada um e não é verificável no código.

**O que se mediu em 06/10/2026 sobre treinamento e retenção** (documentação oficial dos provedores
lida nesse dia; os contratos e os painéis NÃO foram conferidos):

- **Treinamento.** Anthropic: o dado retido nunca é usado para treinar sem permissão expressa.
  OpenAI: dado enviado à API não treina os modelos, salvo adesão expressa (desde 01/03/2023).
  Google: o plano gratuito da API do Gemini usa o conteúdo para melhorar produtos e permite revisão
  humana; o plano pago (projeto com Cloud Billing ativo) não usa. No Vertex AI o Google não treina
  sem permissão.
- **A chave do Gemini é paga?** Indício, não prova: dois modelos sem camada gratuita
  (`gemini-3.1-pro-preview`, em 20/07, e `gemini-3.1-flash-image`, em 24/09) responderam com a
  `GEMINI_API_KEY`. A linha do registro de chamadas não diz se rodou em produção ou com a chave
  local. **Falta conferir no painel do Google AI Studio.**
- **Retenção por abuso.** A OpenAI guarda logs de abuso por até 30 dias; o Google, no plano pago,
  guarda prompts e respostas por período limitado; a política padrão da Anthropic não foi lida.
- **Retenção zero (ZDR).** Anthropic e OpenAI concedem por contato comercial e aprovação própria;
  não vi piso de gasto. Na Anthropic entram Messages, cache de prompt, raciocínio e busca na web;
  **não entra o Batch API** (retenção de 29 dias), conteúdo sinalizado pode ser retido por até 2
  anos mesmo com ZDR, e os modelos Fable e Mythos exigem 30 dias. Na OpenAI não entram Batch API
  nem File Search, e o `store` passa a ser `false` à força (o código já manda `store: false` nas
  chamadas Responses). A API do Gemini com chave do AI Studio não tem opção de ZDR (não encontrei);
  no Vertex dá para pedir exceção ao monitoramento de abuso e desligar o cache de 24 h por projeto,
  e a busca do Google como fonte (*grounding*) quebra o ZDR (não usamos).
- **O que o ZDR custaria no nosso uso.** Nos 90 dias até 06/10, 867 chamadas e cerca de US$ 49 (9%
  do gasto na Anthropic) foram por Batch API. Passá-las para chamada síncrona perderia o desconto de
  50%: uns US$ 16 por mês, estimados pelo registro de custo, que conta menos que a fatura.
- Não há registro de ZDR contratado com nenhum provedor.

### 2.4 Voz

| Origem | O que vai | Para quem |
|---|---|---|
| Resposta falada no treino de atendimento | gravação de até 60 s | **OpenAI** (Whisper), transcrição; o texto volta sem e-mail, telefone e CPF |
| Áudio enviado ao Beto no WhatsApp | arquivo de áudio baixado da Meta | **Google** (Gemini), inline na chamada |
| Voz sintetizada com o primeiro nome | texto "Olá, {nome}" e o roteiro da devolutiva | **Google** (TTS); o vídeo resultante fica no **Bunny** |

### 2.5 Beto: os dois canais

| Fluxo | Provedor | Dados enviados | Proteções relevantes |
|---|---|---|---|
| Beto no WhatsApp (todos os colaboradores desde 22/09/2026) | **Google (Gemini)** | Texto ou áudio recebido, histórico recente de até 24 h (inclusive mensagens automáticas da plataforma e respostas da equipe), identificador e cargo da pessoa, empresa | Só telefone resolvido para UMA empresa; número sem empresa e tenant de demo não chegam à IA; links do histórico trocados por `[link]`; token de acesso nunca entra no prompt; nome e contatos mascarados no texto (não no áudio) |
| Beto dentro do app | **Anthropic (Claude)** | Mensagem, histórico, perfil/cargo/empresa, contexto de desenvolvimento disponível e descrição da página atual | Sessão resolvida no servidor; query/hash removidos; ids dinâmicos redigidos; URL externa e quebra de linha recusadas; nome e contatos mascarados |

O magic link é criado separadamente pela aplicação e transportado apenas no template aprovado.
Dentro do app, "página atual" significa a rota normalizada, não HTML, screenshot, campos visíveis
nem conteúdo do navegador. Especificação operacional: `docs/BETO-CANAIS.md`.

---

## 3. Onde os dados ficam e quem os processa

| Camada | Fornecedor | O que recebe |
|---|---|---|
| Banco de dados e arquivos | **Supabase** (Postgres e Storage) | tudo; ⚠️ região do projeto **a confirmar no painel** (não é legível pelo código) |
| Aplicação | **Vercel** | tudo que passa pelas rotas; `vercel.json` **não declara região** ⇒ default da conta |
| Backups | **Supabase Storage**, bucket `backups` | `.json.gz` diário, rotação de 7 dias (`actions/backup.ts`) |
| Render de vídeo | **Hetzner** (servidor provisionado sob demanda) | acesso ao banco pela `DATABASE_URL`; lê `nome_completo` de quem recebe vídeo personalizado e sintetiza a saudação (`worker-hetzner/worker.mjs`, `lib/video/ensure-render-worker.ts`) |
| Tarefas em segundo plano | **Trigger.dev** | executa acumulada do piloto, IA4, PDI e blueprint em lote, geração de vídeo; processa os mesmos dados dessas etapas, e o progresso dos lotes leva o nome da pessoa no rótulo (`trigger/`) |
| Fila de mensagens | **Upstash QStash** | envio em lote de WhatsApp: nome (dentro da mensagem), telefone e link de acesso ou de conteúdo (`lib/qstash-publish.ts`) |
| Limite de requisições | **Upstash Redis** | e-mail da sessão como chave do limite (ou o IP, sem sessão) (`lib/rate-limit.ts`) |
| Monitoramento de erros | **Sentry** | dados técnicos de erro; e-mail, telefone, CPF e credenciais de URL (`t`, `token`, `token_hash`, `codigo`, `code`, `ticket`, `passe`, `key`, `secret`) removidos em `lib/sentry-scrub-pii.ts`; **nome em texto livre não é detectado** |
| Vídeo | **Bunny Stream** | vídeos genéricos e personalizados; os personalizados têm o primeiro nome na saudação e no **título** (`worker-hetzner/worker.mjs`) |
| Avatar de vídeo | **HeyGen** | roteiros de conteúdo dos decks genéricos, sem dado da pessoa |

**Transferência internacional:** todos os fornecedores acima são estrangeiros. A confirmação de
*em que país* cada dado repousa depende da configuração de região de Supabase e Vercel: é o
primeiro item a verificar no painel.

---

## 4. Comunicação: quem recebe o quê

| Fornecedor | Recebe | Onde no código |
|---|---|---|
| **Meta** (WhatsApp Cloud API) | telefone + conteúdo da mensagem | `lib/whatsapp/cloud-api.ts` |
| **Z-API** (WhatsApp por QR) | idem; caminho legado, ainda ativo | `lib/whatsapp/providers/zapi.ts` |
| **WaSender** | idem; alternativa de envio (failover) | `lib/whatsapp/providers/wasender.ts` |
| **Amazon SES** e **Resend** | e-mail + conteúdo | `lib/email-provider.ts`, `lib/notifications/pilula-envio.ts` |
| **Twilio** | telefone + código de acesso (SMS) | `lib/sms/providers/twilio.ts`; configurado, sem número |
| **Web Push** (navegador) | endpoint do aparelho | `lib/notifications/push-core.ts` |
| **Upstash QStash** | nome, telefone e link dos envios em lote | `lib/qstash-publish.ts` (§3) |

O recebimento do WhatsApp também pode incluir mídia. A inbox guarda a cópia recebida no bucket
privado `inbox-midia-recebida`; no Beto do WhatsApp, um áudio elegível pode ainda ser enviado ao
Google para interpretação, conforme a §2.4.

---

## 5. Retenção — o que se apaga hoje

| Dado | Regra | Onde |
|---|---|---|
| `mensagens_chat` de sessão abandonada | apagada após **48h** de inatividade | `cleanup_sessoes` |
| Backups | rotação de **7 dias** | `actions/backup.ts` |
| **Todo o resto** | **sem prazo definido** — permanece indefinidamente | — |

⚠️ Não existe rotina de exclusão a pedido do titular, nem prazo de descarte para avaliação,
cadastro ou histórico de mensagens. Hoje isso seria feito na mão, direto no banco.

---

## 6. Quem é controlador e quem é operador

A plataforma é **multi-tenant**: cada secretaria/escola tem seus colaboradores isolados, e o
cadastro é feito por ela, não pelo titular.

Isso sugere que o **contratante é o controlador** e a Vertho é **operadora** — o que muda a quem
o titular pede exclusão e quem responde pelo tratamento. O modelo de política que circulou trata
a Vertho como controladora de tudo, o que não corresponde ao desenho.

⚠️ Consequência prática, já observada: um mesmo telefone pode pertencer a pessoas cadastradas em
**empresas diferentes** — no primeiro evento real do webhook, um número resolveu para 7 cadastros
em 6 tenants. "Excluir os dados desta pessoa" não é uma operação única.

---

## 7. Lacunas que a engenharia precisa fechar

1. **Região de Supabase e Vercel**: verificar no painel e declarar.
2. **Cláusula de não-treinamento** nos contratos de IA: a documentação dos provedores foi lida em
   06/10 (§2.3); falta conferir nos painéis o plano de cada chave (Google AI Studio), o
   compartilhamento de dados da organização na OpenAI e se há acordo de retenção na Anthropic.
3. **Rotina de exclusão a pedido**: não existe.
4. **Prazo de descarte**: não existe para nenhum dado além de chat abandonado e backup.
5. **Registro de consentimento**: o cadastro é feito pelo contratante; não há registro de aceite
   do titular no sistema. Desde 03/10 o login e o rodapé do painel levam à política; os e-mails
   e as mensagens de WhatsApp ainda não.
6. **Z-API ainda ativa**: a política precisa refletir os dois caminhos de WhatsApp enquanto a
   migração não fecha.
7. **Provedores de IA fora da política** (Kimi, Grok, Qwen, Muse): restritos em 03/10/2026 às
   tarefas sem dado de pessoa, no seletor, na gravação, na execução e no fallback (R-45, §2.3).
8. **Fluxos de IA ainda com nome** (§2.2, linhas "não" que não são "por desenho"): plano de
   desenvolvimento (blueprint), relatório comportamental e insights, Fase 5 e o simulador de
   conversas do admin. A conversa de mapeamento (`/api/chat`) não manda o nome, mas também não
   tira o contato digitado.
9. **Bucket público**: desde 03/10 os relatórios organizacionais do RH (Perfil Organizacional,
   DNA, Ranking e Adequação ao Cargo) nascem no bucket privado e abrem por link assinado depois
   de conferir o acesso (R-74). Desde a continuação do R-74 (03/10), o podcast com o nome da
   pessoa também nasce no bucket privado e só sai por link assinado de 1 hora
   (`lib/conteudo/audio-personalizado.ts`). Seguem pendentes: a migração dos arquivos antigos que
   ainda estão no bucket público (relatórios e os 288 áudios, `scripts/_migrar-*.mjs`, fora do
   repo), a saudação nominal dos vídeos (`video-assets/greetings*` e, desde 07/10/2026, `video-assets/saudacoes/`, que leva o primeiro nome falado no arquivo e no caminho; o render lê pela URL
   pública) e as fotos de perfil (`avatars`). O PDF personalizado (`conteudos/final/perso/`) NÃO
   tem dado de pessoa: é por conteúdo, empresa e arquétipo DISC, e uma amostra de 62 PDFs das 6
   empresas não trouxe nome de ninguém (conferido em 03/10/2026).

---

## 8. Nota sobre a publicação do app na Meta

A política precisa existir para publicar o app. Mas publicar um texto que descreve **apenas o
WhatsApp** deixaria de fora o núcleo do produto — a avaliação por IA — que é justamente a parte
com mais consequência para o titular. As duas coisas não têm o mesmo prazo: o app pode esperar a
revisão do texto.
