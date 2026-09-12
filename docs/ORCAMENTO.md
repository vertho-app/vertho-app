# Orçamento e régua comercial

> Estado vigente em 12/09/2026. Este é o documento canônico da precificação
> comercial. A fonte executável fica em `lib/orcamento/precificacao.ts`; quando
> houver divergência, código e testes vencem o texto.

## Duas telas, dois trabalhos

| Tela | Rota | Pergunta que responde |
|---|---|---|
| Custos de IA | `/admin/vertho/simulador-custo` | Quanto a plataforma gastou e quanto os fluxos de IA podem custar? |
| Precificação comercial | `/admin/vertho/orcamento` | Quanto cobrar pelo projeto, com que margem e exposição de caixa? |

O centro de Custos de IA é FinOps: ledger real, projeções, catálogo técnico e
comparação de modelos. O orçamento é um *deal desk*: combina escopo, preço,
custos internos, impostos, comissão e contingência. Um mede a operação; o outro
apoia uma decisão comercial.

A tela de orçamento calcula um cenário no navegador; ela não cria nem persiste
uma proposta. A proposta é criada no fluxo comercial e usa a mesma régua-base
por meio de `lib/sales/pricing.ts`.

## Fontes únicas

- `lib/orcamento/precificacao.ts`: premissas, fórmulas puras e políticas de
  comissão do cenário.
- `app/admin/vertho/orcamento/page.tsx`: composição dos custos operacionais e
  interface do deal desk.
- `lib/sales/pricing.ts`: sugestão automática no formulário de propostas,
  alimentada por `ORCAMENTO_DEFAULTS`.
- `lib/ia-cost-catalog.ts`: custo técnico de chamadas, modelos e infraestrutura
  de IA.
- `tests/unit/orcamento-precificacao.test.ts` e
  `tests/unit/sales-pricing.test.ts`: guardas contra regressão da régua.

## Premissas aprovadas

### Escopo automático

| Premissa | Regra |
|---|---|
| Adesão | Sempre 100% das pessoas da base; não há card editável |
| Jornada padrão | Jornada de 7 semanas e 1 competência |
| Ciclos e parcelas | Cada ciclo gera 2 parcelas; o prazo divide, não multiplica o projeto |
| Matrizes adaptadas | `máx(0, cargos − matrizes novas)` |
| Conteúdo | 48 peças por pessoa/ciclo: 12 vídeos, 12 podcasts, 12 textos e 12 cases |
| Reúso de conteúdo | `máx(1, pessoas ÷ cargos ÷ 4 perfis DISC)` |
| Vídeo | Faz parte do bloco de geração de conteúdo; avatar é opcional |

### Régua de preço — receita cobrada

| Item | Padrão |
|---|---:|
| Cotação USD→BRL | R$ 5,12, editável por cenário |
| Setup geral | R$ 2.000,00 |
| Pessoa por ciclo | R$ 300,00 |
| Unidade | R$ 2.000,00 |
| Matriz nova | R$ 1.000,00 |
| Matriz adaptada | R$ 500,00 |
| Workshop por unidade | R$ 15.000,00 |
| Desconto inicial | 0% |
| Margem-alvo | 50% |

### Custo interno de entrega

| Item | Padrão |
|---|---:|
| Custo da hora | R$ 500,00 |
| Implantação | 8 h |
| Matriz nova | 6 h |
| Matriz adaptada | 2 h |
| Workshop por unidade | 8 h |
| Mensagens por pessoa/ciclo | 25 |
| Custo por mensagem UTILITY | R$ 0,035 |
| Clientes ativos para rateio da infraestrutura | 2 |
| Contingência sobre custo operacional | 10% |
| Impostos sobre receita final | 20% |

### Comissão do cenário

As opções são mutuamente exclusivas e incidem sobre a receita final:

| Canal | Percentual |
|---|---:|
| RC | 20% |
| Consultor parceiro | 10% |
| Consultor integrador | 0% |

O padrão conservador é RC, 20%. Trocar o canal recalcula custo all-in, margem,
desconto máximo e custo por pessoa.

> Esta escolha pertence ao **cenário do deal desk**. Ela não altera o ledger
> financeiro de `sales_commission_events`, cuja política histórica do Portal do
> Representante continua em `lib/sales/commissions.ts`.

## Fórmulas

```text
one-time de tabela =
  setup geral
  + unidades × preço por unidade
  + matrizes novas × preço de matriz nova
  + matrizes adaptadas × preço de matriz adaptada
  + workshop, quando contratado

programa = pessoas × R$ 300 × ciclos
valor de tabela = one-time + programa
valor final = valor de tabela × (1 − desconto%)

custo operacional = IA + horas internas + mensagens + infraestrutura
contingência = custo operacional × 10%
comissão = valor final × percentual do canal
impostos = valor final × 20%
custo all-in = custo operacional + contingência + comissão + impostos

margem absoluta = valor final − custo all-in
margem % = margem absoluta ÷ valor final
parcela = valor final ÷ (ciclos × 2)
```

O desconto máximo é calculado antes da negociação: é o maior desconto que ainda
preserva a margem-alvo depois de custos, impostos e comissão. A exposição de
caixa considera a implantação concentrada no início e o recebimento parcelado.

## Matriz: preço não é custo

Não se somam preço e custo para formar “custo total”. Eles ficam em lados
opostos da margem:

| Matriz | Receita cobrada | Horas internas | Custo das horas | Contribuição isolada |
|---|---:|---:|---:|---:|
| Nova | R$ 1.000,00 | 6 h | R$ 3.000,00 | −R$ 2.000,00 |
| Adaptada | R$ 500,00 | 2 h | R$ 1.000,00 | −R$ 500,00 |

A conta atual pressupõe que setup e receita por pessoa cubram essa diferença no
projeto completo. Se a intenção comercial passar a ser “preço da matriz mais
horas cobradas”, a fórmula precisa mudar; hoje ela **não** cobra R$ 4.000 pela
nova nem R$ 1.500 pela adaptada.

## Investimento por pessoa versus custo por pessoa

São métricas diferentes e aparecem lado a lado na folha de decisão:

```text
investimento por pessoa = valor final do projeto ÷ pessoas
investimento por pessoa/ciclo = valor final ÷ pessoas ÷ ciclos

custo interno por pessoa = custo all-in ÷ pessoas
custo interno por pessoa/ciclo = custo all-in ÷ pessoas ÷ ciclos
```

O investimento por pessoa/ciclo normalmente fica acima de R$ 300 porque inclui
o rateio do setup. No cenário de R$ 5.569.000 para 3.000 pessoas e 6 ciclos:

- investimento: R$ 1.856,33 por pessoa no contrato e R$ 309,39 por
  pessoa/ciclo;
- custo interno: R$ 722,88 por pessoa no contrato e R$ 120,48 por
  pessoa/ciclo;
- os R$ 9,39 acima do preço-base de R$ 300 são o setup rateado por pessoa e
  ciclo.

## Alteração segura da régua

Ao mudar qualquer premissa comercial:

1. alterar `ORCAMENTO_DEFAULTS` ou a função pura correspondente;
2. conferir o impacto tanto no orçamento quanto em `simularMensalidade`;
3. atualizar os testes unitários com o novo cenário-base;
4. atualizar este documento, sem copiar a régua para outro `.md`;
5. rodar `npm run typecheck`, testes de precificação, build e smoke após o
   deploy.

O simulador de propostas ainda representa todos os cargos informados como
matrizes novas, pois seu formulário não recebe a divisão nova/adaptada. Se essa
divisão passar a fazer parte da proposta, o contrato de `PricingInput` também
precisa evoluir.
