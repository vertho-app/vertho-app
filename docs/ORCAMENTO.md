# Orçamento e régua comercial

> Estado vigente em 14/09/2026. Este é o documento canônico da precificação
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

A tela calcula o cenário no navegador e o **salva** em `orcamento_cenarios`
(mig 253): nome, cliente em texto livre, as entradas que reproduzem a tela e a
folha de decisão congelada. Salvar não cria proposta — a proposta segue nascendo
no fluxo comercial, que usa a mesma régua-base por meio de `lib/sales/pricing.ts`.

## Orçamentos salvos

| Decisão | Regra |
|---|---|
| O que se grava | `entradas` (reproduz a tela) **e** `resultado` (congela a decisão do dia) |
| Por que os dois | A régua e o catálogo de IA evoluem. Só `resultado` seria uma foto sem reprodução; só `entradas` recalcularia com a régua nova e mostraria outro valor sem que ninguém tivesse decidido nada |
| Cliente | Texto livre, não FK para `sales_accounts`: o deal desk orça antes de o prospect existir no CRM |
| Escopo | Tabela **não** é multi-tenant (sem `empresa_id`). É ferramenta interna Vertho, como `board_paineis`. O isolamento é a rota `/admin/vertho/*` + grant `service_role` |
| Gate | `requirePlataformaSupabase`: `sales_channel.manage` na escrita, `sales_channel.view` na leitura |
| Exclusão | Definitiva, com `confirm` na tela e registro em `admin_audit_log` |
| Cenário antigo | `normalizarEntradas` preenche campo ausente com o default da régua e derruba chave de preset/jornada que não existe mais — sem isso, `PRESETS[preset].label` lançaria e a tela inteira morreria ao reabrir um orçamento velho |

## Conversão em proposta

Um orçamento salvo vira proposta em `sales_proposals` (mig 254), por
`actions/sales/proposals-admin.ts`. É um caminho **separado** do Portal do
Representante, e as diferenças são decisões, não omissões:

| | Fluxo do RC (`proposals.ts`) | Deal desk (`proposals-admin.ts`) |
|---|---|---|
| Dono | `representante_id` obrigatório | **Nulo** — proposta da Vertho, sem RC |
| Oportunidade | Exigida e aberta | Nenhuma (o deal desk orça antes do CRM) |
| Nome do cliente | Vem de `sales_accounts` | `cliente_nome`, texto livre do orçamento |
| Vigência | 12, 24 ou 36 (`CONTRACT_DURATIONS`) | **As parcelas do projeto** (`ciclos × 2 + 1`) |
| Comissão | 9% aquisição + 12% recorrente no aceite | **Nenhuma** — sem RC não há quem receba |
| Quatro olhos | RC submete, admin aprova | Quem cria aprova; `created_by_email` + `approved_by` registram |
| Autor | O RC | O platform admin |

### O mapeamento de vigência

Os dois lados tinham eixos incompatíveis: o orçamento parcela por **entrega**
(`parcelas = ciclos × 2 + 1` desde 02/10/2026, então uma jornada de 7 semanas são
3 parcelas) e a
proposta só aceitava 12/24/36. O mapeamento ingênuo — `monthly_value` = parcela
do orçamento com vigência 12 — multiplica o contrato por **6×**, e é sobre
`total_contract_value` que o aceite materializa comissão.

O mapeamento adotado (decisão de 14/09/2026: preservar as parcelas):

```text
contract_duration_months = parcelas do orçamento      (2 numa jornada de 7 semanas)
monthly_value            = valor de tabela ÷ parcelas
discount_requested       = desconto aplicado na tela
→ contract_value_gross   = valor de tabela
→ total_contract_value   = valor final do orçamento
```

O CHECK da coluna passou a `> 0 AND <= 360`; o dropdown do RC continua 12/24/36.
`tests/unit/orcamento-conversao.test.ts` fixa os dois lados: o total tem de bater
com o valor do projeto, e a vigência tem de ser as parcelas.

### Efeitos colaterais aceitos

- **Renovação**: `markProposalAccepted` calcula `renewal_date = início +
  contract_duration_months`. Com vigência 2, a renovação fica a 2 meses e
  `RENEWAL_SOON_DAYS = 90` acende "renovação próxima" imediatamente. É coerente
  com vender por projeto e não por assinatura — a coluna descreve o fim do que
  foi vendido.
- **Escopo revisado por gente**: `included_scope` vira os bullets que o cliente
  lê em `/proposta/[token]`. A tela pré-preenche com `escopoPropostaDoCenario`,
  mas o server exige texto não vazio: gerar e gravar sem revisão seria publicar
  texto comercial derivado de uma calculadora.
- **Documento sem RC**: `buildProposalDocument` já caía em
  `'Representante Vertho'`; com `cliente_nome` o nome do cliente também aparece.
- **Cliente é obrigatório na revisão** (05/10/2026). O painel de conversão e o de
  "Atualizar proposta" têm o campo **Cliente — aparece na capa**, pré-preenchido com
  o Cliente do orçamento, e as duas actions recusam sem nome (conta do CRM dispensa).
  Medido: a PROP-2026-0010 saiu com a capa sem destinatário porque o orçamento se
  chamava "Bluefit" mas o campo Cliente, então "(opcional)", estava vazio. O nome
  digitado vence o do orçamento e volta para ele quando estava vazio. **O nome do
  cenário do orçamento nunca vira destinatário**: é campo interno ("agressivo v3").
  Atualizar também serve de conserto: proposta criada antes da regra, sem nome,
  passa a exigir e a gravar `cliente_nome`.

### Exemplo de cenário da proposta (05/10/2026, mig 277)

O documento mostra um caso real das quatro perguntas ("Diagnosticar não é fazer prova").
Era UMA constante por segmento: uma expedição de caminhões chegou a uma rede de academias
que tinha ouvido "hipercustomizado", e ao trocar por um gerente de loja o defeito virou o
inverso para as outras propostas corporativas (PROP-2026-0008, com 113 visualizações,
entre elas). Agora o exemplo é gravado **na proposta** (`sales_proposals.cenario_exemplo`,
jsonb, nulo por padrão).

- **Onde se gera**: no painel de revisão (criar E atualizar), bloco "Exemplo de cenário":
  cargo, segmento, uma das 5 competências da matriz global de liderança e a ficha do cargo
  (opcional, colada). "Gerar exemplo" roda o caminho do Banco de Cenários (IA3): Sonnet 5.5
  gera, `gpt-5.6-terra` audita, até a nota 80 (até 3 rodadas, levando o feedback do auditor,
  e fica com a melhor). Uma rodada leva 1 a 2 min e custa centavos. O texto aparece
  **editável**; mexer nele marca o exemplo como "editado à mão" (a nota não vale mais).
  Detalhe do prompt: `docs/CATALOGO-PROMPTS-IA.md` §1.3.1.
- **Quem manda no que o cliente lê**: o servidor valida tudo por `normalizarExemploGravado`
  (allowlist, 4 perguntas, limites de tamanho) ao gravar e de novo ao montar o documento. Exemplo
  inválido recusa a criação/atualização inteira; no documento cai no padrão, nunca em texto
  pela metade. A **origem** (nota, modelos, cargo) é interna e nunca chega ao documento.
- **Atualizar**: campo ausente NÃO toca no exemplo; `null` remove (volta ao padrão); objeto
  substitui. Se a tela não conseguiu LER o exemplo atual ela avisa e não o apaga.
- **Sem exemplo próprio**: a proposta corporativa usa um caso neutro (líder de equipe,
  back-office, nota 92) e a de educação o da coordenação. O fecho é texto da casa e diz "este
  caso é só um exemplo", no substantivo do segmento (empresa ou instituição).
- ⚠️ **Sem ficha**, a IA parte do nome do cargo e do segmento e inventa a rotina típica;
  é ilustrativo e a tela mostra "sem ficha do cargo". Com a ficha real do cliente o
  vocabulário é o dele, que é o que "hipercustomizado" promete. A ficha colada **não** vai para
  a auditoria nem para o banco (pode ter dado do cliente): só a marca de que existiu.
- O custo entra nas tasks `ia3_cenarios`/`ia3_check`, sem `empresaId` ("Plataforma Vertho (sem
  tenant)"): quem lê a média por cenário da IA3 deve saber que ela inclui estes.

### A propriedade que não pode ser perdida

Cada action de `proposals-admin.ts` exige `representante_id IS NULL`. Sem isso o
arquivo viraria atalho para um admin aprovar, enviar ou aceitar a proposta **de
um RC** por cima do fluxo que existe para impedir exatamente isso. Proposta com
RC continua sendo operada só pelo Portal do Representante.

## Fontes únicas

- `lib/orcamento/precificacao.ts`: premissas, fórmulas puras e políticas de
  comissão do cenário.
- `lib/orcamento/cenario.ts`: o formato do cenário salvo — tipos, defaults e
  `normalizarEntradas`/`normalizarResumo` (a fronteira entre o jsonb e a tela).
- `app/admin/vertho/orcamento/page.tsx`: composição dos custos operacionais e
  interface do deal desk.
- `actions/orcamento/cenarios.ts`: salvar, listar, carregar e excluir.
- `actions/sales/proposals-admin.ts`: conversão em proposta e ciclo de vida sem RC.
- `components/sales/proposal-deal-desk-panel.tsx`: a UI desse ciclo de vida, na
  página da proposta.
- `migrations/253-orcamento-cenarios.sql`: a tabela de cenários.
- `migrations/254-proposta-do-deal-desk.sql`: proposta sem RC e vigência do projeto.
- `lib/sales/pricing.ts`: sugestão automática no formulário de propostas,
  alimentada por `ORCAMENTO_DEFAULTS`.
- `lib/ia-cost-catalog.ts`: custo técnico de chamadas, modelos e infraestrutura
  de IA.
- `tests/unit/orcamento-precificacao.test.ts`,
  `tests/unit/orcamento-cenario.test.ts`, `tests/unit/orcamento-acoes.test.ts` e
  `tests/unit/sales-pricing.test.ts`: guardas contra regressão da régua e do
  cenário salvo.

## Premissas aprovadas

### Escopo automático

| Premissa | Regra |
|---|---|
| Adesão | Sempre 100% das pessoas da base; não há card editável |
| Jornada padrão | Jornada de 7 semanas e 1 competência |
| Ciclos e parcelas | Cada ciclo gera 2 parcelas, mais 1 (`ciclos × 2 + 1`); o prazo divide, não multiplica o projeto |
| Duração do programa | Ciclos × 2 meses (`mesesDoPrograma`), uma a menos que as parcelas |
| Simuladores | Pessoas com acesso a cada um (vendas, atendimento, liderança); zero = fora do escopo; nunca acima das pessoas do programa |
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
| Simuladores | No card próprio, um preço por simulador (seção Simuladores abaixo) |
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
| Simuladores | Treinos, turnos e custo por simulador no card próprio (seção Simuladores abaixo) |
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
parcela = valor final ÷ (ciclos × 2 + 1)
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

## A folha de decisão acompanha a rolagem

Desde 02/10/2026 (pedido do Rodrigo: ajustar algo embaixo sem subir para ver o impacto), a
folha de decisão fica presa ao topo da tela em telas largas (`xl`), com a altura da tela e
rolagem própria: valor, parcela e margem ficam à vista, e o gráfico de caixa, "Salvar" e
"Virar proposta" se alcançam rolando dentro dela. O `xl:sticky` já existia e não funcionava
porque o shell do admin prendia o `sticky` a um contêiner que não rolava. A regra do shell
está em `docs/REORGANIZACAO-ADMIN.md` (Rolagem do shell e `sticky`).

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
3. lembrar que **os orçamentos já salvos não mudam junto**: `resultado` segue
   congelado no valor do dia, e `entradas` recarrega com a régua nova apenas nos
   campos que o cenário não gravou. Se a mudança precisa valer para cenários
   antigos, isso é uma decisão de migração de dados — não um efeito colateral
   silencioso;
4. se a mudança cria ou remove um campo de cenário, atualizar
   `EntradasOrcamento`/`ResumoOrcamento` e `normalizarEntradas` juntos: é o que
   faz um cenário de seis meses atrás continuar abrindo;
5. atualizar os testes unitários com o novo cenário-base;
6. atualizar este documento, sem copiar a régua para outro `.md`;
7. rodar `npm run typecheck`, testes de precificação, build e smoke após o
   deploy.

O simulador de propostas ainda representa todos os cargos informados como
matrizes novas, pois seu formulário não recebe a divisão nova/adaptada. Se essa
divisão passar a fazer parte da proposta, o contrato de `PricingInput` também
precisa evoluir. A conversão do deal desk **não** tem essa limitação: ela leva
`cargos` e o cenário completo. A divisão novas/adaptadas entra no PREÇO, mas não
no texto que o cliente lê.

### O rascunho de escopo que o cliente lê (17/09/2026)

`escopoPropostaDoCenario` gera os bullets de `/proposta/[token]`. Regras do
Rodrigo, travadas em `tests/unit/orcamento-conversao.test.ts`:

- número sempre como #.### ("1.000 pessoas"), exceto valores em reais;
- matrizes só pelo total ("50 matrizes de competência"), sem a divisão entre novas
  e adaptadas, e sem repetir "50 cargos mapeados" na linha de pessoas (é o mesmo
  número: uma matriz por cargo). Por votação, a linha diz "definidas por votação
  dos colaboradores";
- conteúdo sem quantidade: "Vídeos, podcasts, textos e casos personalizados para
  cada pessoa". O documento também deixou de dizer "N conteúdos por pessoa a cada
  ciclo";
- workshop em linha própria ("Workshop presencial para definir, com a equipe, as
  competências de cada cargo"), e não no fim de "cargos mapeados". Sem "da
  instituição" (05/10/2026): o gerador não conhece o segmento, o tipo de cliente só
  é escolhido depois no formulário, e uma rede de academias leu "equipe da
  instituição". Singular e plural dizem a mesma coisa;
- um simulador por linha ("Simulador de vendas para 100 pessoas"), antes do Mentor
  IA. O documento também tem a seção "Simuladores incluídos", logo ANTES do escopo,
  lida do orçamento (só a contagem de acessos, nunca o preço).

### Orçamento editado depois de virar proposta (17/09/2026)

A conversão é de mão única e o server recusa converter de novo. Até esta data,
editar o orçamento depois não chegava à proposta: um orçamento real ganhou simuladores
e passou a valer R$ 30.000 a mais, enquanto a proposta derivada seguia no valor antigo, e
o documento misturava as duas versões (métricas lidas do orçamento ao vivo, valor
da proposta).

Agora o orçamento convertido tem **"Atualizar proposta com este orçamento"**
(`atualizarPropostaDeOrcamento`). Regrava escopo (revisado no mesmo painel),
valor, parcela, vigência, desconto e condições a partir do orçamento **salvo**,
pela mesma conta da conversão (`numerosDoOrcamento`). Não toca em número,
contato, tipo de cliente, link público nem status. Recusa proposta com RC e
proposta aceita, perdida ou substituída, e repete essas travas no próprio
`update` (o cliente pode aceitar pelo link entre a leitura e a escrita). Update
que não casa linha é erro, não sucesso. Audita o antes e o depois do valor.

### Simuladores (17/09/2026)

Os três simuladores do produto (`SIMULADORES` em `lib/simuladores/acesso-cargo.ts`)
entram no orçamento por **acesso**: uma pessoa em dois simuladores conta duas
vezes, porque preço e custo são por pessoa POR simulador (`acessosSimuladores`).

- **Preço** (`calcularProjeto`): acessos × preço por pessoa/ciclo × ciclos,
  recorrente como o programa e sujeito ao mesmo desconto.
- **Custo** (`custoSimuladoresBrl`): acessos × treinos por pessoa/ciclo × custo do
  treino × ciclos × cotação. Entra no custo operacional **mesmo com preço zero**:
  simulador dado de graça continua consumindo IA.
- **Escopo do cliente**: uma linha por simulador incluído, antes do Mentor IA
  ("Simulador de vendas para 1.200 pessoas").
- **Cenário salvo antes** abre com todos os simuladores em zero.
- ⚠️ As chamadas dos simuladores no ledger não gravam `colaborador_id`: dá
  para medir custo por treino, não por pessoa.

#### Card próprio, uma régua por simulador (02/10/2026)

Pedido do Rodrigo: tudo de simulador num card só (seção 02 da tela), com preço,
treinos, turnos e custo separados por simulador. Até aqui eram um preço e um
custo de treino para os três, espalhados pelo escopo, pela régua e pelo custo de
entrega, e o custo era o do atendimento, o mais caro: a margem de vendas e de
liderança saía pior do que é.

Cada simulador tem `ConfigSimulador` (`configSimuladores` nas entradas do cenário),
com os três campos editáveis; os dois custos de IA do treino são da plataforma:

| Campo | Vendas | Atendimento | Liderança |
|---|---:|---:|---:|
| Preço por pessoa/ciclo | R$ 0 | R$ 0 | R$ 0 |
| Treinos por pessoa/ciclo | 6 | 6 | 5 (jornada de 5 encontros) |
| Turnos por treino | 8 | 8 | 8 |
| Custo fixo por treino (US$), **da plataforma** | 0,10 | 0,166 | 0,09 |
| Custo por turno (US$), **da plataforma** | 0,0075 | 0,0069 | 0,005 |
| **Custo por treino com 8 turnos** | **0,16** | **0,22** | **0,13** |

🔒 **Os custos de IA do treino não são campos do orçamento** (decisões do Rodrigo,
02/10/2026: primeiro o custo por turno, depois "o mesmo vale para custo fixo /
treino"): moram em `CUSTO_FIXO_TREINO_USD` e `CUSTO_TURNO_USD`, fora de
`ConfigSimulador`, e a tabela só os exibe ("fixo da plataforma"). Cenário salvo
enquanto eles eram editáveis (02/10, a partir de `0288ab0b`) tem as chaves no jsonb:
elas são descartadas na leitura e a conta usa sempre as constantes (teste com
mutação: honrar o valor gravado derruba o caso). O que o orçamento decide é preço e
uso (pessoas, treinos, turnos); o custo de cada chamada é medição.

`custoTreinoUsd` = fixo + turno × turnos. O fixo é o que roda uma vez por treino
(vendas: criador do cenário e avaliação do gerente; atendimento: avaliação pela
matriz de 30 descritores; liderança: abertura, consequências e avaliador); o turno
é a conversa (vendas: cliente, moderador e intenção; atendimento: a pessoa
atendida; liderança: o personagem). Os números são o pior caso medido no ledger
entre 13 e 24/09/2026, **só com ensaios da equipe**: nenhum colaborador real tinha
usado os simuladores. Recalibrar quando houver uso.

O card é uma **tabela**: parâmetros nas linhas, um simulador por coluna, resultados
embaixo na mesma grade. A primeira versão (um painel com seis caixas por simulador)
quebrava os rótulos em 3 ou 4 linhas e desalinhava os campos numa tela um pouco
mais estreita (print do Rodrigo, 02/10). O campo de pessoas tem teto no próprio
input: antes o texto podia mostrar 250 com a conta usando 100.

O card mostra, por simulador, o custo por treino, o custo por pessoa/ciclo, o
**preço mínimo** para a margem-alvo (`precoMinimoSimuladorBrl`: custo ×
(1 + contingência) ÷ (1 − impostos − comissão − margem), antes de desconto) e a
margem no preço informado (`margemSimuladorPct`, a inversa). Com impostos de 20%,
RC de 20% e margem de 50% sobram 10% da receita: o mínimo é 11× o custo. A folha
de decisão ganhou a linha "Simuladores" na composição do valor, que antes somava
no total sem aparecer.

Cenário salvo antes de 02/10 (as 3 linhas de `orcamento_cenarios` naquele dia
tinham preço de R$ 30 ou R$ 50): o preço e os treinos únicos de `pricing` passam
para cada simulador, porque preço é decisão comercial. O custo por treino antigo
não é herdado: cada simulador abre com o seu, como o resto do custo de IA.

Testes: `tests/unit/orcamento-simuladores.test.ts` (validado por mutação em
02/10: os três simuladores com a régua do atendimento derruba 2 testes; o projeto
ignorando os simuladores derruba 3; o cenário antigo perdendo o preço derruba 1).
O documento da proposta não recebe preço nem custo de simulador
(`sales-proposta-documento.test.ts`).

### Duração do programa (17/09/2026)

`mesesDoPrograma(ciclos)` = ciclos × 2 (até 02/10, igual a `parcelasPorCiclos`). Antes a
calculadora estimava por semanas (7 × ciclos ÷ 4,345), e uma proposta real dizia
"8 meses de programa" ao lado de "10 parcelas". A infra é rateada por essa
duração (5 ciclos: +R$ 996 a +R$ 1.992 de custo, menos de 0,13 ponto de margem
num projeto de sete dígitos). O documento da proposta deriva a duração dos
`ciclos`, não do `resultado.mesesPrograma` gravado, porque cenário salvo antes
desta data congelou a conta antiga.

### Uma parcela a mais (02/10/2026)

Regra do dono: `parcelasPorCiclos(ciclos)` = ciclos × 2 + 1
(`PARCELAS_ALEM_DO_PROGRAMA`). A partir daqui parcelas e duração deixam de ser o
mesmo número: 5 ciclos são **10 meses de programa** pagos em **11 parcelas**.
`mesesDoPrograma` não mudou, então a infra continua rateada pelos meses de
entrega e a curva de exposição distribui o custo variável em 10 meses enquanto
recebe em 11. O orçamento salvo carrega as parcelas do dia em
`resultado.parcelas`, e a conversão em proposta lê esse valor: cenário salvo
antes de 02/10 continua com `ciclos × 2` até ser salvo de novo.

**Na capa do documento, "meses de programa" é o número de prestações** (regra do dono,
05/10/2026, vendo a PROP-2026-0010: a capa dizia "10 meses de programa" e o investimento
"11×"). `buildProposalDocument` troca o `mesesPrograma` derivado dos ciclos pelo
`contract_duration_months` da própria proposta (= parcelas no projeto), a mesma fonte do
cartão "Parcelas": os dois números do documento não podem divergir. Só o documento muda;
a calculadora segue rateando infra e curva de exposição pelos meses de entrega acima.
Parcelas ausentes ou inválidas na proposta caem nos ciclos. A capa também deixou de
escrever o tipo do cliente depois do nome ("· Empresa", "· Escola").
