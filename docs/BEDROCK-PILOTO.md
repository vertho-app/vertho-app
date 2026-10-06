# AWS Bedrock — piloto editorial e treinamento comercial (06/10/2026)

O botão de sugestão de tags em `/admin/conteudos` usa Kimi K3 no Amazon Bedrock
quando `AWS_BEARER_TOKEN_BEDROCK` está configurada no servidor. O administrador
revê a classificação no modal e aplica as tags numa operação separada. Gerar a
sugestão não altera o conteúdo nem publica material.

- Tarefa: `conteudo_tags`, já liberada para Moonshot na régua de privacidade.
- Modelo: `global.moonshotai.kimi-k3`, via Chat Completions em `us-east-1`.
- Credencial: chave Bedrock da conta com créditos Activate; para o piloto,
  configurar somente em production, como segredo criptografado. Não usa a
  credencial SES. Não guardar a chave neste documento, em Git ou em logs.
- Sem a chave, o botão mantém o modelo anterior. A rota `kimi-k3` da Moonshot
  continua sendo uma rota distinta.
- O piloto editorial continua separado do treinamento comercial publicado abaixo.
  A comparação entre modelos usa somente dados fictícios. A autorização comercial
  não inclui PDI, avaliação de colaboradores, PPP ou personalização.
- Sugestões precisam passar pelo schema e referenciar uma competência do
  catálogo antes de chegar ao modal.

## Orçamento

Reserva conservadora de US$ 0,20 por tentativa, com máximo de 50 tentativas
para o piloto inteiro (US$ 10). O limite vale para todas as instâncias e tenants
juntos. Lua no Redis reserva atomicamente ANTES da chamada à AWS. O contador
`vertho:bedrock:piloto:conteudo-tags:20261006` não expira, não é zerado por deploy
e não é estornado em erro/timeout, pois a AWS pode ter processado o pedido.
Falha de Redis bloqueia o envio; não há fallback em memória.

Payload máximo de 25.000 bytes UTF-8; máximo de 6.000 tokens de saída, incluindo
raciocínio; `reasoning_effort: low`; tier Standard (`default`); timeout de até
90 segundos. Não há retries automáticos ou fallback para outro provedor.
Os limites usam os preços conferidos em 06/10/2026, com entrada/cache-write de
até US$ 3,75 e saída de US$ 15 por milhão de tokens. A reserva é superior ao
custo esperado e não é uma medição do faturamento AWS.

## Medição inicial

Duas chamadas com peça fictícia sobre escuta ativa, sem conteúdo de tenant:

| Chamada | Entrada registrada | Leitura de cache | Saída | Latência da API | Estimativa original |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.473 | 0 | 251 | 7,39 s | US$ 0,008184 |
| 2 | 681 | 850 | 267 | 3,19 s | US$ 0,006303 |

A primeira resposta copiou os metadados junto com o nome da competência.
A lista foi convertida em JSON com campos separados e a validação passou a
recusar nomes fora do catálogo. A segunda resposta respeitou o contrato e
classificou a peça em Comunicação. É uma verificação de integração com uma
peça sintética, não uma avaliação abrangente da qualidade do modelo.

### Ensaio básico depois do deploy (06/10, 09:39)

Uma chamada real, pelo código da classificação com peça e catálogo sintéticos,
retornou Comunicação → Escuta ativa, níveis 1–2, contexto corporativo e confiança
alta. O schema aceitou a sugestão; tempo do fluxo: 4,4 s. O navegador não estava
conectado nesta sessão, portanto este ensaio não verificou o modal em produção.

A AWS informou 1.531 tokens de prompt, dos quais 1.524 foram escritos no cache,
e 264 tokens de saída. A estimativa correta é US$ 0,009696: 7 tokens de entrada
comum, 1.524 de cache-write e 264 de saída. O wrapper single-turn e chat agora
separam a gravação de cache para não precificá-la como entrada comum. A linha
deste ensaio foi corrigida no ledger com backup e os tokens da resposta original.
Os valores das duas chamadas anteriores acima são os registros originais e podem
subestimar gravações de cache; sem a resposta original completa, não são recalculados.

O ledger `ia_usage_log` registra `provider = bedrock`,
`model = global.moonshotai.kimi-k3`, `feature = conteudo_tags`, tokens,
latência e custo estimado. A aplicação dos créditos deve ser conferida no
Billing da AWS; elegibilidade dos créditos não é confirmação do lançamento.

Teste pago, opt-in: `BEDROCK_TAGS_LIVE=1` e executar apenas
`tests/unit/bedrock-conteudo-tags-live.test.ts` carregando o `.env.local`.
Cada execução consome uma tentativa. Os testes comuns não chamam a AWS.

Rollback do piloto editorial: desligar sua seleção de modelo em código e publicar.
Não remover a chave compartilhada com o treinamento comercial. O contador permanece. Renovar a chave ou ampliar o
orçamento exige uma decisão explícita depois de revisar o piloto.

Fontes:
[modelo, IDs e preços](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html),
[endpoint e autenticação](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html),
[chaves para exploração](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-generate.html).

## Comparação sintética do simulador comercial (06/10/2026)

Uso autorizado de Kimi K3 para comparação interna com Sonnet, nos níveis médio
e alto, sem sessões ou dados de vendedores. Tarefa `canario_contrato`, já
permitida na régua de privacidade para canários fixos. Modelo e endpoint são os
mesmos do piloto editorial, com JSON Schema estrito e esforço low.

O contador independente `vertho:bedrock:canario:vendas:20261006` reserva
até 20 tentativas, sem expiração ou estorno. Payload de até 80.000 bytes e saída
de até 6.000 tokens permitem reserva conservadora de US$ 0,40/tentativa,
total de US$ 8. Indisponibilidade do Redis bloqueia a chamada. O limite editorial
de 50 chamadas/US$ 10 permanece separado. Os custos estimados aparecem no ledger
como `provider = bedrock`, `feature = canario_contrato`.

Na etapa de comparação o perfil de produção ainda usava Sonnet. A autorização
posterior para Kimi nas sessões comerciais está descrita abaixo; este canário
mantém sua tarefa e orçamento independentes. Não há escolha de modelo na tela
nem sorteio de participantes. O teste opt-in `VENDAS_MODELOS_LIVE=1` compara duas repetições por
nível com o mesmo contexto sintético de cliente e valida schema, fala e transição
PACE. Os artefatos locais em `output/simulador-vendas-modelos/` não são
versionados. Uma amostra assim não estabelece qualidade superior.

Ensaio de integração em 06/10/2026, 18:42–18:47 (Brasília): os três segmentos
e níveis passaram por criação, planejamento e primeira resposta com provedores
reais, em 24/30/34 s por fluxo. Sonnet e Kimi passaram nas duas repetições de
cada nível 2/3, com schema, fala e transição válidos. Opus concluiu duas
avaliações documentais PACE em 72/66 s; médias 2,60/2,55 na mesma fixture,
mostrando variação entre execuções sem trocar a régua.

| Amostra sintética | Chamadas | Latência da API | Custo estimado no ledger |
| --- | ---: | ---: | ---: |
| Cliente Sonnet 5.5 | 4 | 1,85–3,26 s | US$ 0,049126 |
| Cliente Kimi K3 no Bedrock | 4 | 3,37–8,56 s | US$ 0,055240 |
| Avaliação Opus 5.5 | 2 | 65,39–71,92 s | US$ 0,413907 |

São custos destas chamadas e deste cache, não previsão de custo mensal ou
confirmação de créditos AWS. Os clientes comparados estavam na fase Preparar;
este ensaio não mede toda a negociação nem demonstra superioridade do Kimi.

## Treinamento comercial publicado (06/10/2026)

Perfil vigente autorizado pelo dono: Kimi K3 via AWS Bedrock para criar cenários
e representar clientes nas dificuldades baixa, média e alta. Gemini 3.8 Flash
fica nos auxiliares de moderação e intenção; Sonnet 5.5 na avaliação PACE.
A calibração `comercial-3` usa perfis receptivos, uma objeção simples e nenhuma
objeção profunda no fácil, mantendo a matriz PACE e os outros níveis. Sessões anteriores conservam seus snapshots.

A exceção de privacidade exige o modelo exato `global.moonshotai.kimi-k3`,
o tenant comercial Vertho fixo e `sim_vendas_criador` ou `sim_vendas_cliente`.
O wrapper valida novamente o escopo antes do envio. A API direta da Moonshot e
outras tarefas/tenants permanecem restritos. AWS Bedrock está declarado em
`app/privacidade` e em [FLUXO-DE-DADOS-PESSOAIS.md](FLUXO-DE-DADOS-PESSOAIS.md).
O nome do vendedor e os contatos são mascarados pelo fluxo existente; nomes de
terceiros em texto livre podem permanecer.

Cada chamada exige JSON Schema nativo estrito e esforço low, com validação Zod
completa e transições PACE no retorno. Limites não suportados no schema Bedrock
são convertidos em descrições, mantendo os enums, propriedades e campos obrigatórios.
Tier Standard, sem retry automático ou fallback: até 500.000 bytes UTF-8,
8.000 tokens/110 s no criador e 2.500 tokens/60 s no cliente. Mantém rate limits,
checkpoints e custo no ledger por tarefa. Não há cota total de ensaio para treinos
publicados; eles não consomem os contadores editoriais ou de canário.

Endpoint Chat Completions em us-east-1 com chave Bedrock já existente. O perfil
`global` pode rotear mundialmente; não implica residência de dados no Brasil.
Segundo a [AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html),
os fornecedores de modelos não têm acesso aos prompts e respostas nas contas de
deployment operadas pela AWS. Isso não equivale a afirmar ausência de retenção
em toda a infraestrutura ou a confirmar aplicação de créditos Activate.

Rollback: reverter o perfil de novos treinos em `lib/simulador-vendas/modelos.ts`
e publicar. Preservar a autorização AWS para retomar sessões já abertas com Kimi.

Fontes: [Kimi K3 e roteamento](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html),
[JSON Schema suportado](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html).

Validação do perfil anterior (Gemini no cliente baixo e Opus na avaliação) em 06/10/2026, 20:19–20:29 (Brasília): três cenários e três
respostas por nível, com compradores fictícios e banco de sessões em memória.
Qulture Rocks, Revvo e Yoodli permaneceram no contexto competitivo. Os fluxos
aceitos levaram 46/67/97 s, incluindo criador, moderação, cliente e intenção.
Schemas, quantidade de objeções, preços vazios e transições PACE passaram.
Um pedido de criação do nível médio excedeu 110 s; a repetição manual isolada
passou, sem ampliar o timeout nem adicionar retry ou fallback automático.
Esses ensaios verificam integração e uma conversa curta; não demonstram qualidade
superior nem ausência de timeouts futuros.

Validação do perfil vigente em 06/10/2026: três conversas fáceis completas,
com Kimi no criador e no cliente e compradores fictícios de empresa, escola
privada e rede pública. Cada caso levou 84/77/80 s, com seis falas do vendedor.
Uma mensagem trivial manteve a fase inicial; uma abertura com pergunta simples
avançou para análise, e a resposta à única objeção permitiu combinar demonstração.
Os três casos terminaram em engajamento, sem barreiras adicionais ou contratação
imediata. Qulture Rocks, Revvo e Yoodli permaneceram no contexto competitivo.

Na avaliação real dessa conversa de empresa, Sonnet 5.5 passou pelo schema,
pelas evidências literais e pelas fontes PACE em 29 s: 30 descritores preenchidos,
27 observados e nenhum nível numérico sem evidência. O prompt reforça o contrato
existente para omissões observadas versus ausência de oportunidade; nenhuma regra
de nota ou validação foi flexibilizada. Sessões de teste ficaram em memória,
com artefatos locais e custos registrados no ledger. Também passaram 11.215 testes
automáticos; após o reforço do prompt, passaram typecheck e 503 testes de contratos.
