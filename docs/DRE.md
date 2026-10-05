# DRE por tenant

Tela interna `/admin/vertho/dre` (menu Custos). Mostra, por cliente e por semana, a **receita por caixa**, o custo de IA medido e os custos lançados à mão. Pedido do dono em 05/10/2026.

## O que decidiu o desenho

- **Receita por caixa.** Uma parcela só vira receita quando alguém registra que o dinheiro entrou (`recebido_em` e `valor_recebido_brl`), e conta na semana dessa data. Parcela a receber é previsão e nunca é somada. O custo, ao contrário, é por competência semanal.
- **Os sócios veem e lançam.** `dre.view` e `dre.manage` são permissões do master e do sócio. É a única escrita do papel Sócio (`lib/permissions.ts`); a contrapartida é o rastro: toda escrita grava antes e depois em `admin_audit_log` (`dre.*`). O RH do cliente nunca chega aqui.
- **Horas de gente entram desde o início**, como lançamento manual (`categoria = horas`): horas × custo por hora, com o custo padrão do orçamento (R$ 500) gravado na própria linha.

## Princípio da tela: o custo de cada cliente é um PISO

A margem só é honesta se a tela disser o que não mediu. Cada linha de cliente carrega selos:

- **IA medida**: vem do ledger (`ia_usage_log`). Pode estar *provisória* (semana em curso ou câmbio estimado) ou *parcial* (chamadas sem preço no catálogo).
- **N custos sem lançamento**: categoria sem nenhum lançamento no período. Não quer dizer custo zero.
- **sem contrato**: custo sem receita.

O que **ainda não é medido** (fases seguintes): WhatsApp (a Meta cobra por mensagem desde 01/10 e o `pricing` do webhook é descartado), rateio de infraestrutura, e a IA de entrega sem `empresaId` no ledger (cerca de US$ 9 em 28 dias medidos em 05/10).

Margem sem receita é `null` ("—"), nunca 0% nem NaN.

## Dados (migration 276)

| Tabela | O que guarda |
|---|---|
| `dre_contratos` | O projeto vendido de um tenant: valor, início, situação e o **previsto congelado** do orçamento (`previsto`, cópia do `ResumoOrcamento` na criação: o `salvarOrcamento` ainda sobrescreve o cenário vivo). |
| `dre_parcelas` | Calendário de parcelas. Única fonte de receita. `recebido_em` e `valor_recebido_brl` andam juntos (check no banco). |
| `dre_lancamentos` | Custos manuais: horas, impostos, comissão, infra, whatsapp, terceiros, outros. **Semanais** (`semana_inicio`, a segunda-feira em Brasília) ou **mensais** (`mes_competencia`, dia 1; mig 280). Escopo `empresa` ou `plataforma`. |
| `dre_cambio_semanal` | USD→BRL de cada semana: `ptax_bcb`, `manual`, `herdado` ou `orcamento`. |
| `dre_custo_ia_semana` | Fechamento durável do custo de IA por (semana, natureza, tenant), com o câmbio **congelado** na linha. |

**`ON DELETE SET NULL` de propósito.** `ia_usage_log.empresa_id` é CASCADE: excluir um tenant apaga o custo histórico dele. Registro financeiro não pode ter esse destino nem travar `excluirEmpresa`. O vínculo vira NULL e o registro sobrevive, legível por `empresa_nome`. Como dois tenants excluídos teriam `empresa_id` nulo e colidiriam no índice único, o agrupador é `chave_empresa` (uuid em texto, gravado no nascimento e nunca alterado; `'sem-tenant'` para o que não tem empresa). `dre_parcelas.contrato_id` é RESTRICT: parcela recebida é registro financeiro, e a ordem de exclusão (parcelas antes do contrato) fica imposta pelo banco.

## Custo de IA: mesma fonte e mesma régua do e-mail semanal

`lib/dre/fechamento.ts` usa `coletarJanela` (RPC `custo_ia_agregado`) e `naturezaDaLinha` (`lib/custo-ia/classificacao.ts`): **operação** é cliente pagante; **P&D** é demo, slug não-cliente, trabalho sem tenant e fontes de medição. Não há RPC nova: duas rotas para o mesmo número divergiriam. A janela da DRE é a mesma do e-mail (segunda 00:00 BRT, fim exclusivo); há teste que compara as duas.

- **Fechado**: o cron `dre_fechamento_semanal` (segunda, `30 7 * * 1` UTC = 04:30 BRT, depois do e-mail das 04:00) refaz **sempre** a última semana encerrada (o Batch API pode gravar linha tardia) e fecha as 12 anteriores que estejam sem linha. Falha do banco ou da RPC lança (500), nunca vira semana em branco. `?dry=1` só lista.
- **Ao vivo**: a semana em curso (e qualquer uma sem fechamento) é calculada na hora pela tela, marcada provisória. Se a leitura falha, vira aviso na tela ("não é zero"), não zero.
- **Recalcular semana**: botão por semana encerrada (`dre.manage`).
- **Refazer não apaga o histórico do tenant excluído**: linha com `empresa_id` nulo e chave de tenant nunca é removida pelo recálculo (a RPC já não a enxerga).

## Custo lançado por semana ou por mês

Custo de infraestrutura, assinatura e comissão costuma chegar fechado por mês, então o lançamento aceita as duas periodicidades (mig 280):

- **Por semana:** entra inteiro na semana escolhida.
- **Por mês:** é **uma linha só** (`periodicidade = 'mensal'`, `mes_competencia` = dia 1, `semana_inicio` nulo) e a DRE o reparte nas semanas **na leitura** (`lib/dre/rateio.ts`), **por dia**: cada semana recebe a parte dos dias dela que caem no mês. Uma semana que cruza dois meses recebe uma fatia de cada (a semana de 28/09 tem 3 dias de setembro e 4 de outubro). Exemplo: R$ 3.000,00 de setembro de 2026 viram 600 / 700 / 700 / 700 / 300 nas semanas de 31/08, 07/09, 14/09, 21/09 e 28/09.
- **A soma das semanas é sempre o valor do mês.** O arredondamento é feito sobre o acumulado de dias, não semana a semana (arredondar cada fatia perde ou inventa centavo). Há teste de varredura de 36 meses × 8 valores.
- O rateio **não depende da janela exibida**: a fatia de uma semana é a mesma com 4 ou com 52 semanas na tela. A parte de um mês que cai antes da primeira semana com dado, ou depois da semana em curso, não entra na conta; a de depois aparece sozinha quando a semana chegar.
- Mês que ainda não começou é recusado (como a semana futura). Os dois campos andam com a periodicidade: o banco recusa mensal com semana e semanal com mês (`dre_lancamentos_periodo_coerente`).
- Horas também podem ser mensais ("20 h no mês"): o valor do mês é horas × custo por hora, calculado no servidor.
- Para a cobertura, o mensal conta como lançado se **alguma** semana dele cai no período exibido.
- A migration 280 é aditiva e deve ser aplicada **antes** do deploy do código: o código antigo continua gravando semanal sem saber das colunas novas, mas o código novo grava `periodicidade` em toda linha.

## Câmbio

Média simples da PTAX de venda dos dias úteis da semana (OData Olinda `CotacaoDolarPeriodo`; forma medida em 05/10/2026: um registro por dia útil, e `value: []` quando a semana ainda não tem dia útil).

Se o BCB não responde, o fechamento **não para**: herda a semana anterior (`herdado`) ou, sem semana anterior, usa a cotação do orçamento (`orcamento`), e registra a degradação (`dre-cambio-sem-ptax` em `degradacao_log`). O provisório é trocado pela PTAX na próxima rodada que a achar. Uma cotação `manual` (definida por sócio) nunca é sobrescrita; ao defini-la, o custo de IA já fechado da semana é reconvertido.

## Contrato, parcelas e previsto × realizado

Ao criar o contrato, o sócio pode ligar um orçamento salvo: o resumo é **copiado** para o contrato. O calendário é gerado a partir de `parcelas` e `parcela` do orçamento, com a data da 1ª escolhida na tela (o deal desk não tem datas); a última parcela absorve o arredondamento, então a soma é sempre o valor do contrato. Tudo é editável parcela a parcela.

A comparação mostra: IA orçada × realizada, pior saldo de caixa previsto × resultado de caixa acumulado, e o andamento do programa. **Só existe com um contrato em vigor por cliente**: com dois, o custo realizado é do cliente e o previsto é de um contrato só. O **custo total orçado não é comparado**, porque o `custoTotalBrl` inclui itens que a DRE ainda não mede (WhatsApp, infra rateada).

## Segurança

- `/admin/vertho/dre`: `carregarDRE` (`lib/dre/carregar.ts`) exige `dre.view` pela porta `requirePlataformaComContexto` (platform admin + permissão). O item de menu só esconde; o gate está na carga e em cada action.
- `actions/dre/*.ts` (todo export é endpoint HTTP) passam por `executarAcaoDre` (`lib/dre/acao.ts`): gate de plataforma + permissão, validação zod (valores normalizados a centavo, teto de R$ 1 bilhão), retorno padronizado sem vazar mensagem do banco. O ator vem da sessão, nunca do corpo. Ficam em `actions/` e não em `app/admin/**/actions.ts` porque o guard `admin-actions-require-auth` não reconhece `requirePlataformaSupabase`.
- O valor das horas é calculado no servidor em aritmética inteira (`valorDasHoras`): em ponto flutuante `0,15 × 3,30` dá 0,49 e o banco (`numeric`) confere 0,50.
- Sem `createSupabaseAdmin()` novo: as actions usam o client do gate e o cron injeta o dele.
- Testes: `tests/unit/dre-*.test.ts` e `tests/unit/security/dre-*.test.ts` (gate com os gates reais, falha de banco, auditoria, paginação, semana ao vivo). As 36 regras centrais da fase 1 e as 14 do custo mensal foram validadas por mutação (quebrar a regra e ver o teste falhar). Uma 15ª mutação do custo mensal sobreviveu porque a deduplicação que ela quebrava era código redundante, e o código saiu.

## Operação

1. Aplicar a migration: `node --env-file=.env.local scripts/apply-migration.mjs migrations/276-dre-por-tenant.sql` (decisão do dono: é DDL).
2. Backfill do custo de IA: a primeira execução do cron fecha as 13 semanas encerradas; para antecipar, `GET /api/cron?action=dre_fechamento_semanal` com o segredo do cron (`?dry=1` antes, para ver o que faria).
3. Cadastrar os contratos e as parcelas já recebidas na tela. Receita e lançamentos manuais começam quando forem lançados; só a IA tem histórico.

## Fora do escopo desta fase

- WhatsApp: gravar o `pricing` do webhook e uma tabela de tarifa (fase 2).
- Passar `empresaId` nos call-sites de entrega que não o passam, e ratear a infraestrutura (fase 3).
- Fechar o custo manual por semana (hoje o lançamento é livre e auditado, não "fechado").
