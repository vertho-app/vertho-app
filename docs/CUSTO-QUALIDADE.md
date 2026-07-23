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

### S2 · Medição — PILOTO DE COORTE SINTÉTICA (sem esperar tráfego orgânico)

Sem volume real, **geramos a carga**: 10 colabs sintéticos no acme-demo (5
arquétipos DISC × 2 braços) rodando o simulador de temporada headless
(`lib/season-engine/simulador-core.ts`), populando o ledger com `source='simulator'`.
Custo é determinístico dado o input → tokens/cache/custo são REAIS. Aluno em
Haiku (overhead netável, `sim_aluno`); mentor no modelo do braço.

**O piloto pagou por si antes de terminar — 2 bugs de produção latentes:**
1. **Wrapper quebrava com adaptive-thinking-default** (Sonnet 5/Opus 4.8+):
   retornava `content[0].text`, mas o bloco `thinking` vem em `content[0]` →
   `undefined.trim()`. Corrigido (`extractClaudeText`) e **deployado** (`9909b534`).
   Teria quebrado QUALQUER roteamento p/ Sonnet 5 em prod.
2. **`gpt-5.6-luna` 401 intermitente** (4/6) com a chave sk-proj → o
   `acumulada_check` (Onda 0) falharia nos fechamentos reais sem ninguém ver.
   Aluno voltou p/ Haiku; **`acumulada_check` precisa de correção à parte** (é
   uma DECISÃO em aberto — ver abaixo).

**Resultado 1 — custo real dos fluxos de chat (mentor+extração, só tokens):**
- Sonnet 4.6 = **$1,44/colab** (socrático+missão+qualitativa+extrações; exclui
  Tira-Dúvidas/BETO, que o simulador não dispara).
- Estimativa do catálogo p/ os mesmos fluxos ≈ $1,33 → catálogo estava ~8% BAIXO.
  Calibração boa; o `$3,07/usuário` do modelo se sustenta.

**Resultado 2 — o cache está MORTO (`cacheRead=0` em 100% das chamadas).**
- *Causa-raiz medida:* o system prompt do socrático/missão/qualitativa **embute
  a instrução do turno** (`instrucaoTurn[turnIA]`) → o bloco marcado com
  `cache_control` muda a cada turno → escreve cache novo toda vez, nunca lê.
- *Efeito hoje:* ~5% de desperdício puro (write a 1,25× sem read). Pequeno.
- *Oportunidade perdida (grande):* nessas chamadas o INPUT domina (socrático
  in≈2800/out≈250). Um prefixo estável (persona+régua+desafio+nome, ~1500 tok)
  cacheado ao longo dos 6-12 turnos de UMA conversa leria a 0,1× nos turnos 2..N.
- **Ação S3 (a de maior valor medido):** reestruturar os prompts de chat —
  prefixo estável no system cacheado, instrução volátil do turno movida para a
  mensagem do usuário. Depois re-medir (o piloto vira o teste de regressão do
  cache: `cacheRead` tem que sair de 0). NÃO é "ligar `CHAT_HISTORY_CACHE`" — é
  consertar a ESTRUTURA antes.

**Resultado 3 — veredito Sonnet 5 (braço do piloto, sob preço intro):**
- **Tokens/tarefa +40% a +68%** vs 4.6 (o "+30% do tokenizer" era otimista) +
  **output ~2×** (tokens de *thinking* entram como output).
- Custo: **intro ($2/$10) ≈ empata** (+7%/colab); **GA ($3/$15) = +60%/colab**.
- **Confiabilidade PIOR:** 9 falhas "Unterminated string in JSON" no braço 5 vs
  **0** no 4.6 — o thinking come o budget de `max_tokens` e **trunca o JSON
  estruturado** das extrações.
- **Decisão: NÃO trocar para Sonnet 5.** Pior em custo (GA) E em confiabilidade
  de saída estruturada. O preço intro é isca. Só reconsiderar se um teste com
  goldens REAIS (S4, Ibipeba) mostrar ganho qualitativo grande E as extrações
  ganharem budget de tokens. ⚠️ A qualidade em colab SINTÉTICO é evidência fraca
  (o aluno é sintético) — o veredito de custo/confiabilidade é sólido; o de
  qualidade fina fica p/ os goldens reais.

**Decisão em aberto p/ o dono — `acumulada_check` (Luna 401):**
(a) consertar a permissão da chave sk-proj no dashboard OpenAI; (b) repointar o
check p/ um modelo confiável (muda o custo da Onda 0); (c) fallback no 401. É
decisão porque afeta a economia da Onda 0.

### S3+S4 · Cache do chat socrático — VALIDADO pelo harness (a S4 fez o trabalho)

O piloto mediu que o cache do chat estava MORTO (a instrução do turno e o
grounding, voláteis, ficavam no prefixo cacheado e o envenenavam). Duas
tentativas de correção, e a S4 (painel cego de juízes) foi o juiz:

1. **History caching** (instrução+grounding → cauda da mensagem, cachear
   system+histórico): a medição de CUSTO adorou (−34% input, cacheR cresce). Mas
   a **S4 REPROVOU** — A/B com painel Gemini+Haiku, não-inferioridade POR PERFIL,
   pegou **degradação sistemática do perfil D** (ON 3,0 vs OFF 3,75). Mover a
   instrução p/ a mensagem tira a autoridade dela. *Lição:* o custo não veria
   isso; só o painel viu (juiz ÚNICO tinha até dito "ON melhor" — mascarou).
2. **systemSuffix** (instrução FICA no system, bloco 2; grounding no bloco 1
   cacheado): **S4 PROMOVEU** — 24 casos, 4 perfis DISC, ON não-inferior em
   CS/D/I/S (total OFF 3,42 → ON 3,65). A degradação do D sumiu.

**Entregue:** o socrático usa systemSuffix (`socratic.ts` devolve system[persona+
grounding] + systemSuffix[instrução]); o grounding virou ESTÁVEL por conversa
(query por competência+descritor, sem as últimas mensagens) para o bloco 1
cachear. O ganho materializa em produção quando o RAG tem conteúdo (grounding não
vazio → bloco 1 > 1024). Missão/qualitativa já estavam em systemSuffix.

*Decisão-chave documentada:* a alavanca de custo só entra se a S4 aprovar. Aqui
ela BARROU a versão mais econômica e aprovou a que preserva qualidade. É
literalmente o "sem perder qualidade" em ação.

### S2 (orgânico) — ainda pendente
O piloto dá o baseline dos fluxos guiados pelo mentor. Falta o tráfego real p/
Tira-Dúvidas/BETO (iniciados pelo usuário) e p/ a densidade temporal do cache
(a coorte roda em sequência = melhor caso). Reconciliação com billing ≤5% quando
houver 1 dia de volume real.

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
| S2 piloto | ✅ medido | coorte 10 no simulador → custo real $1,44/colab, cache MORTO (cacheR=0), Sonnet 5 GA +60% + trunca JSON, 2 bugs prod (9909b534) |
| S4 núcleo | ✅ ferramenta | ia-sinais + eval-harness (validado por mutação) |
| S2, S3-resto, S5, S6, S7 | 🔒 desenhado/gated | gates de tempo (S2), medição (S3-resto), harness+goldens (S5), conteúdo+humano (S6), evidência (S7) |

**Princípio que guiou os cortes:** o que é seguro e byte-idêntico foi a prod;
o que muda comportamento do modelo ficou atrás do harness; o que depende de
tempo/dados/conteúdo humano foi honestamente marcado como tal. Rodar as 7
sprints "de verdade" = construir a maquinaria e respeitar os gates que nós
mesmos definimos para não perder qualidade.

---

## 22-23/07 · Dupla-checagens → GPT 5.6 Terra (decisão do dono) + trava de regeneração

**O quê:** os 7 auditores 2ª-IA (ia3_check, ia4_check, cenarios_b_check,
acumulada_check, sem14_check, pulse_audit, modulo_base_auditor) padronizados em
**GPT 5.6 Terra ($2,50/$15)** — decisão de QUALIDADE do dono (22/07), não de
custo. Todos com default por task + **pinned** em `lib/ai-tasks.ts`; sweep nos
5 tenants com override antigo (incluía o alias morto `gpt-5.4` do acme-demo).

**Achado no caminho:** o override ia3/ia4_check salvo em Configurações → IA era
**config morta** — o runner usava um picker com defaults hardcoded e nada lia o
sys_config. Agora o picker dual hidrata de `resolveTaskModel` e os fallbacks
hardcoded dos cores (check-ia4, cenários B) resolvem pela task.

**Δ custo (rotulado):** IA3/IA4 check ≈ neutro (Terra = preço do GPT-5.4 REAL,
$2,50/$15); acumulada+sem14 Luna→Terra ≈ **+$0,04/colab** sobre os $3,07;
auditoria de módulo $0,65→$0,68 (108 mods ≈ $74). Encerra a exposição ao 401
intermitente do Luna. Espelhos (painel interno + artefato) atualizados 23/07.

**Trava de regeneração (23/07, classe de bug):** "regenerar com feedback"
SOBRESCREVIA a versão boa antes de conhecer a nota da nova (88pts→58pts com um
clique, medido na UniAnchieta). Agora champion/challenger nos cenários A E B:
candidata gerada em memória → auditada → **só aplica se nota ≥ atual**
(`travaRegeneracao`, validada por mutação). Prompt de regen ganhou regras
anti-inflação (o gerador corrige crítica ADICIONANDO conteúdo — 2ª rodada do
refino estourou contenção por isso). Corolário p/ qualquer loop de refino
nosso: **quem regenera nunca pode destruir a campeã sem medir a candidata.**

**Batch dos dois lados (22/07):** `lib/ai-batch.ts` ganhou a Batch API da
OPENAI (−50%) — IA3 em lote roda geração em batch Claude e checks em batch
GPT; molde pronto pro IA4. Trigger: runtime **node-22** obrigatório
(supabase-js ≥2.108 exige WebSocket nativo; redeploy rebundla as tasks com o
node_modules ATUAL — upgrade de dependência do app pode quebrar task que nem
mudou).
