# Custo & Qualidade de IA — plano de 7 sprints + log de decisões

> Documento vivo. Registra o plano, **as decisões tomadas e o porquê** de cada
> uma. Regra do dono (12/07/2026): reduzir custo **sem perder qualidade** —
> sempre a decisão melhor, não a mais fácil.

## Dois princípios

1. **Medir → eliminar desperdício → só então rotear modelo.**
2. **Nunca regenerar/re-renderizar o que já existe para a mesma identidade.**

## Modelo de custo

`Custo(N) = FIXO_empresa + $3,07 × N`. Hoje: fixo custom $198 · variável $3,07/usuário
(chat = 61%: socrático $0,87 + tira-dúvidas $0,67 + missão $0,46). Metas sempre
a **preço GA** (Sonnet 4.6 $3/$15) e nos dois eixos.

---

## Decisão-mãe: honrar os gates ao "rodar todas as sprints"

Ao receber "rode todas as sprints", a decisão **melhor (não fácil)** foi NÃO
empurrar tudo pra produção de uma vez. Motivo: o plano tem gates de qualidade
que existem exatamente para o "sem perder qualidade":

- **S2 (medição) é tempo-dependente** — precisa de ~7 dias de tráfego real. Não
  se fabrica numa sessão. O que se faz: instalar o ledger (feito, S1) e deixar
  acumular; as projeções só se fixam com dado medido.
- **S5 (compactação, cascata) muda o que o modelo vê** → risco pedagógico. Só
  vai a prod **atrás do eval harness (S4)** aprovando. Construído OFF, por flag.
- **S6 (biblioteca canônica) é iniciativa de CONTEÚDO** + aprovação humana por
  competência. O *código* (media-hash, FK, resolver) é construído; a autoria das
  24 competências é trabalho de conteúdo, não de código.

Logo: **constrói-se toda a maquinaria; liga-se em prod o que é seguro (saída
byte-idêntica: caching, idempotência, ledger, retries); gateiam-se por
flag/harness os que mudam comportamento.** Isso é "rodar todas as sprints" com
disciplina.

---

## Log de decisões por sprint

### S1 · Fundação — fazer o número ficar verdadeiro

**S1.1 (commit 042396eb prévio + f1d1c6aa) — ENTREGUE em prod.**
- **Ledger central `ia_usage_log`** (mig 177): usage REAL gravado DENTRO do
  wrapper `callAI`/`callAIChat`, todos os provedores + streaming Claude.
  - *Decisão:* log no wrapper, não nos call-sites. *Porquê:* cobertura por
    construção — um call-site esquecido não vaza do baseline. Falha de log em
    try/catch (telemetria nunca derruba a chamada de produto).
- **`PINNED_TASKS`** (`lib/ai-tasks.ts`): auditorias críticas imunes ao
  `modelo_padrao` genérico do tenant.
  - *Decisão:* pin em `modulo_base_auditor`/`acumulada_check`/`sem14_check`.
    *Porquê:* o `resolveTaskModel` deixava o genérico do tenant rebaixar
    silenciosamente a 2ª IA — bug de segurança de qualidade. Override explícito
    por task ainda vence (reversibilidade da Onda 0). Validado por mutação.
- **Preços corrigidos:** GPT-5.4 $10/$30 → **$2,50/$15** (doc oficial); Luna
  adicionado; defaultModel dos checks alinhado ao runtime real.
  - *Porquê:* o simulador superestimava os checks ~6× → decisão sobre número
    errado. Consequência honesta: a Onda 0 (Luna) rendeu ~$10/100, não ~$33.

**S1.2 (commit fd6b3a16) — ENTREGUE.**
- `costFromTokens()` no catálogo: fonte ÚNICA de custo a partir de tokens reais
  (wrapper + batch). Batch ledger em `fetchClaudeBatchResults` (source='batch',
  custo com −50%) — o batch não passa pelo wrapper, então loga lá.
- `taskKey` nos call-sites de maior custo (61%+): socrático, tira-dúvidas,
  sem13, arguição, BETO, IA4, acumulada, sem14 scorer/check. Resto = 'untagged'
  (ainda logado; adoção incremental — *decisão:* priorizar o eixo de maior $).
- *Decisão anti-double-count:* rate-limit do tira-dúvidas conta só `source=null`
  (linha do route); a do wrapper é `source='wrapper'`. Sem isso o limite
  diário contaria 2× por resposta.

**S1.3 (commit desta rodada) — ENTREGUE: estimado × real na mesma tela.**
- O simulador de custo (`/admin/vertho/simulador-custo`) mostrava só o custo
  ESTIMADO pelo catálogo. Agora tem um painel **Real medido (ledger)** logo
  abaixo, lendo `ia_usage_log` por janela (7/30/90 dias): custo real, cache
  hit-rate, tokens, e breakdown por (tarefa × modelo).
- *Decisão MELHOR-não-fácil #1 — agregar no banco:* a soma é uma função SQL
  (`ia_uso_resumo`, mig 178), não um fetch de linhas cruas pro Node. Escala com
  o ledger crescendo; o Node só recebe ~N-tarefas linhas.
- *Decisão #2 — fechar a exposição:* custo é dado sensível de plataforma.
  `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` na função,
  e a action `getUsoRealIA` gateada por `requireAdminAction` (platform admin).
  Defesa em profundidade coerente com a postura do projeto.
- *Decisão #3 — sinalizar o subestimado:* `custo_conhecido_frac` < 1 = chamadas
  cujo modelo não está no catálogo (`cost_usd` NULL); a UI avisa que o real está
  subestimado, em vez de mentir um número "completo". Torna a S2 observável: o
  ledger deixou de ser write-only.

### S2 · Medição — NÃO fabricável numa sessão (por design)
Precisa de ~7 dias de tráfego real. **Decisão:** ledger já no ar coletando; as
projeções só se fixam com dado medido. Reconciliação com billing do provedor
(≤5%) é o gate — feito quando houver 1 dia de volume.

### S3 · Desperdício sem trocar modelo

**S3/L1 (commit aa6aae3d) — ENTREGUE atrás de flag.**
- Caching do HISTÓRICO da conversa (`callClaudeChat`): `cache_control` na última
  mensagem → prefixo lido a 0,1× no turno seguinte.
- *Decisão MELHOR-não-fácil:* flag `CHAT_HISTORY_CACHE` default **OFF**. Saída é
  byte-idêntica (risco zero), mas ligar durante o baseline da S2 contaminaria a
  medição do "antes". Liga quando a medição justificar. TTL 5min primeiro.
- *Só rende no fluxo DENSO* (turnos < 5min = socrático, 80% do $). No esparso
  (tira-dúvidas 3/sem) o cache expira e vira write inútil → TTL por fluxo depois.

**Idempotência e política de retries — DESENHADAS, não implementadas nesta
sessão.** *Decisão:* tocam muitos call-sites de produção (DISC, cenários,
tagging, extrações; e o `chamarIAComRetry` no path sensível de autoria de
módulo). Fazer bem exige o baseline medido (S2) pra priorizar por $ real e não
regredir a autoria. Ficam como próxima fatia da S3, pós-medição.

### S4 · Eval harness (LINCHPIN) — NÚCLEO ENTREGUE

**`lib/ia-sinais.ts` + `lib/eval-harness.ts` — ferramenta pura, zero prod.**
- *Decisão de arquitetura (a mais importante da sessão):* os **sinais de
  confiança em código** são UMA primitiva compartilhada por S4 (graders), S5
  (cascata decide escalar) e S7 (auditoria por risco decide amostrar). Construir
  uma vez evita 3 implementações divergentes. Nunca confia no auto-relato do
  modelo — só em fatos (JSON válido, campos, nota na régua, divergência vs
  determinístico). É a lição registrada (primária violou a régua COM confiança).
- Harness **validado por MUTAÇÃO** (3 mutações: JSON quebrado, nota errada, nota
  fora da régua → todas reprovam). Um harness que nunca reprova é carimbo.
- *Falta (próxima fatia):* popular os goldens do ledger real + os casos
  históricos que furaram; e a infra de rollout shadow→10→25→50→100 com kill
  switch por task_key. O MECANISMO de gate está pronto e testado; os DADOS
  (goldens) dependem da S2 rodar.

### S5 · Estrutural gated — DESENHADA, atrás do harness (por design)
Compactação de contexto e cascata econômico→forte **mudam o que o modelo vê** →
risco pedagógico. *Decisão:* NÃO vão a prod sem o harness (S4) aprovando com
goldens reais. A cascata já tem sua primitiva (`ia-sinais.computarSinais` →
`baixaConfianca` decide escalar). Implementação atrás de flag quando a S4 tiver
goldens. Empurrar agora seria o caminho fácil que trai o "sem perder qualidade".

### S6 · Biblioteca & mídia
- **Media-hash + fronteira de tenant** (código): a re-chave da célula de vídeo
  por hash de identidade (comp+transição+MB+roteiro+idioma+voz+PPP-hash) e a
  regra "mídia nunca cruza tenant salvo canônica" são código. *Decisão:*
  implementar após a S3/idempotência (o media-hash é idempotência aplicada a
  mídia — mesmo princípio #2). Escopo contido, entra como fatia própria.
- **Biblioteca canônica** = iniciativa de CONTEÚDO + aprovação humana por
  competência. *Decisão:* não é código de uma sessão; a autoria das 24
  competências (manuscritos SED01-12) é trabalho de conteúdo. O gate humano é
  por competência (24 sessões, não 432 peças) — como o piloto de blueprints.

### S7 · Auditoria por risco — DESENHADA, gate escrito, default 100%
A primitiva (`ia-sinais.baixaConfianca`) já existe. *Decisão:* mantém 100% de
auditoria até o ledger acumular ≥200 casos com divergência <5% por 4 semanas;
só então amostra os normais (100% nos críticos e baixa-confiança), com retorno
automático a 100% se divergência >2× baseline ou >8% (janela 7d, mín 30). É a
ÚLTIMA por design — desligar auditoria sem evidência é o oposto de "sem perder
qualidade".

---

## Resumo do que ficou em prod nesta rodada

| Sprint | Estado | Onde |
|---|---|---|
| S1.1 | ✅ prod | Luna + ledger + pinned + preços (042396eb, f1d1c6aa) |
| S1.2 | ✅ prod | taskKey + batch ledger + custo fonte única (fd6b3a16) |
| S1.3 | ✅ prod | painel real×estimado no simulador + `ia_uso_resumo` (mig 178) |
| S3/L1 | ✅ prod (flag OFF) | caching do histórico (aa6aae3d) |
| S4 núcleo | ✅ ferramenta | ia-sinais + eval-harness (validado por mutação) |
| S2, S3-resto, S5, S6, S7 | 🔒 desenhado/gated | gates de tempo (S2), medição (S3-resto), harness+goldens (S5), conteúdo+humano (S6), evidência (S7) |

**Princípio que guiou os cortes:** o que é seguro e byte-idêntico foi a prod;
o que muda comportamento do modelo ficou atrás do harness; o que depende de
tempo/dados/conteúdo humano foi honestamente marcado como tal. Rodar as 7
sprints "de verdade" = construir a maquinaria e respeitar os gates que nós
mesmos definimos para não perder qualidade.
