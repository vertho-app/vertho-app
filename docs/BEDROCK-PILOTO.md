# Piloto Bedrock — classificação editorial (06/10/2026)

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
- Só este piloto pode usar a nova rota Bedrock. Não inclui avaliação de
  colaboradores, respostas do simulador, dados de PPP ou personalização.
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

Rollback: remover a chave Bedrock de production e fazer novo deploy. O botão
volta à rota anterior; o contador permanece. Renovar a chave ou ampliar o
orçamento exige uma decisão explícita depois de revisar o piloto.

Fontes:
[modelo, IDs e preços](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html),
[endpoint e autenticação](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html),
[chaves para exploração](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-generate.html).
