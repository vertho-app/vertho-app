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
- 🔴 *Ponto cego fechado em 10/08:* "o batch loga lá" só vale para quem passa por
  `lib/ai-batch.ts`. O roteiro de vídeo montava request cru direto na Batch API e
  ficava **fora do ledger**: **0 de 169 vídeos** registrados em `ia_usage_log` —
  e o roteiro é a chamada de LLM mais cara do produto. Ou seja, o painel "Real
  medido (ledger)" vinha subestimando o custo de IA, sem nada indicar a falta.
  Agora o roteiro passa por `submitClaudeBatch` com `ledger:{feature:'conteudo_video'}`.
  **A classe:** custo só aparece no painel se a chamada passar por um dos dois
  caminhos instrumentados — ao auditar custo, a pergunta não é "quanto o painel
  mostra?", é **"que chamada não passa por aqui?"**. Ver `docs/FMEA-PIPELINE.md` §F-I14.
  ⚠️ *Não medido:* quanto o custo real sobe quando os vídeos voltarem a ser gerados
  — não há histórico no ledger para comparar (as 169 gerações antigas nunca entraram).

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

**Resultado 3 — veredito Sonnet 5 (braço do piloto):**
- **Tokens/tarefa +40% a +68%** vs 4.6 (o "+30% do tokenizer" era otimista) +
  **output ~2×** (tokens de *thinking* entram como output).
- **Confiabilidade PIOR:** 9 falhas "Unterminated string in JSON" no braço 5 vs
  **0** no 4.6 — o thinking come o budget de `max_tokens` e **trunca o JSON
  estruturado** das extrações.

> 🔴 **REVISADO em 10/08/2026 — metade deste veredito caiu.** Ele tinha dois
> pilares e o de custo era `GA ($3/$15) = +60%/colab`. **Não existe esse GA: o
> $2/$10 do Sonnet 5 é o preço padrão.** `Medido:` conferido na doc oficial de
> pricing em **12/08/2026**, que traz a nota textual — o intro anunciado até
> 31/08/2026 *"is now the standard price"* e o aumento p/ $3/$15 em 01/09/2026
> *"will not occur"*. (Em 10/08 a mesma conclusão tinha sido tirada por leitura,
> sem citar a fonte; agora tem procedência.) O custo medido é o definitivo, e no PDI
> o Sonnet 5 saiu **21% MAIS BARATO** que o 4.6 ($0,127 vs $0,161 em 5
> competências) — a inflação de +16% de output é mais que compensada pelos 33% a
> menos por token. A frase "o preço intro é isca" está morta; não a cite.
>
> O pilar de **confiabilidade continua de pé, mas é POR TAREFA**, não global. O
> truncamento aparece onde `max_tokens` é apertado e o thinking disputa o mesmo
> teto (as extrações do piloto). **No PDI não se reproduziu**: 18 execuções (9
> modelos × 2 cenários, 2 e 5 competências, teto de 64k) deram JSON válido, todas
> as competências na ordem, zero truncagem — inclusive Sonnet 5 em `effort: high`
> com 13.041 tokens de saída. Ver `_resumo.md` das rodadas 07-08/08.
>
> **Decisão hoje:** a troca volta a ser decidível caso a caso. Onde o teto é
> folgado, custo agora favorece o Sonnet 5; onde é apertado, o achado de
> truncamento manda e o 4.6 fica. O que falta para o PDI é só o julgamento de
> qualidade de escrita (leitura cega), não custo nem robustez.

**~~Decisão em aberto p/ o dono — `acumulada_check` (Luna 401)~~ — FECHADA em 25/08/2026.**
As opções eram: (a) consertar a permissão da chave sk-proj no dashboard OpenAI;
(b) repointar o check p/ um modelo confiável (muda o custo da Onda 0); (c) fallback no 401.

**Fechou por (b), sem ninguém decidir isso explicitamente:** a padronização de
22/07 moveu TODAS as dupla-checagens para `gpt-5.6-terra`, e com isso o Luna saiu
de todos os defaults de produção. `Medido:` 25/08 — `gpt-5.6-luna` não aparece em
`DEFAULT_TASK_MODELS`; sobra só como opção de dropdown, fallback do radarbett
(dormant, atrás de gate) e allowlist do chat-simulador. Nenhum caminho vivo
dependia mais do 401 — a "decisão em aberto" estava aberta contra um problema que
já não existia.

**E o 401 também não reproduz mais.** `Medido:` 25/08/2026, 6 chamadas a
`gpt-5.6-luna` com a MESMA forma da produção (`/v1/chat/completions`,
`max_completion_tokens`, system+user, chave `sk-proj-` do `.env.local`):
**6 de 6 → HTTP 200**, contra as 4-de-6 falhas registradas na S2. Sem repro, a
causa raiz (permissão de modelo no projeto OpenAI vs. rotação de chave) fica sem
veredito — mas o Luna deixa de ser bloqueio para adoção futura em F2
(classificação/micro-saída de alto volume).

⚠️ O que NÃO foi medido: qualidade. O `_comparar-auditor-mb.ts` registra que o
Luna **reprovou** como auditor de módulo-base onde o Terra passou. Liberar o Luna
por disponibilidade não o promove a auditor — segue valendo para tarefa de
classificação curta, e sob a regra cross-família (se o classificador `pulse_classify`
for para Luna, `pulse_audit` não pode ficar em OpenAI; o guard em
`tests/unit/ai-dual-familia.test.ts` derruba o par).

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
| S2 piloto | ✅ medido | coorte 10 no simulador → custo real $1,44/colab, cache morto **no sintético** (cacheR≈0; no tráfego real é 19,7% — ver leitura de 27/07), Sonnet 5 GA +60% + trunca JSON, 2 bugs prod (9909b534) |
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

---

## 27/07 · Primeira leitura do ledger acumulado (S2, parcial)

O ledger deixou de ser promessa: **6.345 chamadas registradas, 25/06 → 25/07,
$100,99**. Tudo abaixo é `Medido:` (SQL direto em `ia_usage_log`, 27/07).

| Origem | Chamadas | Custo | % do input lido do cache |
|---|---|---|---|
| `wrapper` (tráfego real) | 2.847 | **$82,02** | **19,7%** |
| `simulator` (coorte sintética da S2) | 3.439 | $16,74 | **0,1%** |
| `batch` | 49 | $2,23 | 0% |

**Correção de leitura — "o cache está MORTO" era do piloto, não da produção.**
O `cacheRead=0` medido na S2 vale para a coorte sintética (0,1% acima, e faz
sentido: cada colab sintético abre conversa nova). No tráfego real o cache já
lia antes da rodada de S3/S4: **socrático 51,1%** do input vindo de cache
(53,3% antes de 20/07 vs 50,5% depois — ou seja, **o ganho não veio do
`systemSuffix`**, que foi promovido por QUALIDADE, não por cache), **BETO
90,2%**, tira-dúvidas 34,0%. As chamadas sem cache nenhum são as de autoria
one-shot (`modulo_base_autor`, `acumulada_*`, os checks) — onde não há prefixo
a reaproveitar mesmo.

**🔴 O achado acionável: 77% do custo está `untagged`.** 2.552 chamadas sem
`taskKey` somam **$77,80 dos $100,99**. A adoção incremental da S1.2 cobriu os
fluxos de chat (que eram o eixo de maior $ *estimado*), mas o dinheiro real está
concentrado fora deles — e hoje não dá para dizer em quê. **Próxima fatia da S2
não é esperar mais tráfego: é etiquetar os call-sites de `untagged`**, senão o
ledger responde "quanto" e nunca "onde".

## 31/07 · O `untagged` tem endereço — e não é onde se procurava

`Medido:` (SQL em `ia_usage_log`, 31/07). O `untagged` cresceu para **3.306
chamadas / $97,88 — 78% do total**. A novidade não é o número, é o recorte:

| Recorte do `untagged` | Valor |
|---|---|
| `claude-sonnet-4-6` via `wrapper` | 2.812 chamadas · **$87,28** (89% do untagged) |
| com `empresa_id` / `colaborador_id` / `trilha_id` / `semana` | **0** · zero em todos |
| output médio | **1.474 tokens** |
| concentração | 13-15/07 = $59,49 · 27-28/07 = $18,81 |

**Nenhuma atribuição preenchida + output longo + concentrado em poucos dias = não
é tráfego de usuário, é autoria/geração em lote por script.** Tráfego de pessoa
passa `colaboradorId`; estas 2.812 não passam nada. As datas batem com as
rodadas de geração de conteúdo (13-15/07) e com a faxina + semana 5 do Ibipeba
(27-28/07).

📌 **O call-site era `actions/conteudos.ts`** (`gerarConteudoIA` e as expansões).
✅ **Etiquetado em 31/07** — 6 chaves novas: `conteudo_gerar` (fallback),
`conteudo_expansao_pdf`, `conteudo_personalizacao`, `conteudo_tags`, `kit_nucleo`
e `kit_desafio`, todas passando `empresaId` (o eixo cuja **ausência** foi o que
permitiu rastrear a origem).

🔑 **Como isso passou tanto tempo despercebido:** `gerarConteudoIA` **já
calculava um `taskKey`** (`conteudo_video`/`_podcast`/`_texto`/`_case`) — só que
para escolher o MODELO em `getModelForTask`, sem repassar ao ledger. Não faltava
nome nem decisão: faltava um argumento. Procure fios soltos assim antes de supor
que a instrumentação "não foi feita".

**A leitura acima é o baseline.** Como o número foi acumulado *antes* das
etiquetas, o `untagged` histórico não encolhe — o que muda é que a **próxima**
rodada de geração aparece nomeada. Reler `feature × modelo` depois da próxima
geração de conteúdo é o que fecha o ciclo.

⚠️ **Contra-exemplo útil, para não repetir o erro de mira:** em 31/07 etiquetei
o bloco Chat Fase 3 (`conversa_fase3`, `chat_fase3_eval`, `chat_fase3_audit`,
`chat_simulador`) porque uma proposta de redesenho queria baratear aquele fluxo.
**Isso não move o `untagged` em um centavo** — o chat da Fase 3 nunca executou
(`sessoes_avaliacao` e `mensagens_chat` com 0 registros). A etiqueta ali serve
para a PRÓXIMA execução ter número; o dinheiro de hoje está na geração de
conteúdo. **Regra: antes de otimizar um fluxo, confirme que ele roda e quanto
ele custa — nesta ordem.**

**Cobertura de preço:** 1.136 chamadas (18%) com `cost_usd` NULL — modelo fora do
catálogo. O painel já sinaliza via `custo_conhecido_frac`, então **os $100,99 são
piso, não total**. Fechar o catálogo é pré-requisito da reconciliação ≤5% com o
billing.

**Última chamada registrada: 25/07.** Sem tráfego novo desde então — o gate de
"1 dia de volume real" continua dependendo do próximo ciclo de tenant ativo.

---

## 05/08 · Refresh do catálogo de modelos (Opus 5 / Sonnet 5 / GPT 5.6 Sol·Terra·Luna / Gemini 3.6 Flash)

Seletores admin migrados (commit `c61f612d`) — nova lista: Sonnet 5, Opus 5,
GPT 5.6 Sol/Terra/Luna, Gemini 3.6 Flash. Após a reversão (ver tensão abaixo):
geração volta a `claude-sonnet-4-6`, roteiro de vídeo em `claude-opus-5`,
checks continuam `gpt-5.6-terra`, fallback de provedor `AI_FALLBACK_MODEL` →
`gpt-5.6-terra` (código + env Vercel, redeploy aplicado).

- **Suponho (NÃO medido):** preços de `claude-opus-5` ($5/$25) e
  `gemini-3.6-flash` ($1,50/$9) no `lib/ia-cost-catalog.ts` são ASSUMIDOS
  (faixa do antecessor), aguardando tabela oficial. A reconciliação com o
  billing fica comprometida até confirmar — e as 1.136 linhas `cost_usd` NULL
  acima lembram o custo de catálogo desatualizado.
- **⚠️ Tensão com o Resultado 3 (piloto, acima) — RESOLVIDA no mesmo dia:** o
  refresh moveu os defaults para Sonnet 5 a pedido explícito do dono, mas ao
  fechar a rodada o conflito com o veredito medido (tokens +40–68%, output ~2×,
  9 truncamentos de JSON vs 0, +60%/colab a preço GA) foi flagrado — **decisão
  do dono: defaults revertidos para Sonnet 4.6**. Os modelos novos (Sonnet 5,
  Opus 5, GPT 5.6 Sol, Gemini 3.6 Flash) continuam SELECIONÁVEIS nos dropdowns
  para teste manual. Exceções que ficaram nos modelos novos (sem veredito
  contra): `conteudo_video` em Opus 5, extrações/briefs em Gemini 3.6 Flash,
  checks em GPT 5.6 Terra e `AI_FALLBACK_MODEL=gpt-5.6-terra`. Lição: reler
  este doc ANTES de migrar defaults de IA.
- **⚠️ Luna:** o `gpt-5.6-luna` teve 401 intermitente (4/6) com a chave
  sk-proj no piloto. Agora é fallback do radarbett e par cross-LLM do Gemini
  3.6 Flash nos presets. Se o 401 não foi resolvido no dashboard OpenAI,
  esses caminhos falham de forma intermitente.
- **Varredura:** o catálogo de modelos NÃO é fonte única — trocar modelos
  exige varrer 5 seletores + whitelist de rota + ~15 defaults soltos (mapa na
  memória `project_catalogo_modelos_ia`). `MODELOS_DISPONIVEIS`
  (`lib/ai-tasks.ts`) é o mais próximo de canônico, mas não é importado pelos
  outros seletores.

---

## 07-11/08 · Eval vivo do PDI em 9 modelos, e o `untagged` etiquetado

### Eval: 18 execuções, 9 modelos × 2 cenários

Harness: `scripts/_pdi-modelos.ts` (sucessor do `_pdi-4-modelos`), prompt REAL via
`buildRelatorioIndividualPrompt`, custo/tokens lidos do `ia_usage_log` — o ledger
também **confirma qual modelo serviu**, porque o `callAI` tem fallback de provedor e
sem isso um resultado caído no fallback seria comparado com o rótulo errado.
Cenários: 2 competências **com** blueprint (Elda·Ibipeba, ações fixas — mede só
redação) e 5 competências **sem** blueprint (persona fictícia — o modelo também
monta o sprint). Artefatos em `Downloads/pdi-modelos-2026-08-0{7,8}/`.

**Nenhum modelo truncou: 18/18** com JSON válido, todas as competências na ordem e
sprint completo — inclusive Sonnet 5 em `effort:high` com 13.041 tokens de saída.
A hipótese que motivou o teste de volume (Sonnet 5 truncando como truncou na
extração de Módulo-Base, Resultado 3 acima) **não se reproduziu no PDI**. O
truncamento é **por tarefa**: aparece onde `max_tokens` é apertado e o thinking
disputa o mesmo teto, não onde o teto é 64k.

**Nenhum critério automático separou os modelos.** JSON válido, contagem e ordem
bateram em todos os nove — o que sobra é qualidade de escrita, e essa decisão foi
para leitura cega (artefato `e8161cfa-fead-4bee-a9d1-fac9c9df0421`, 9 PDIs
anonimizados A–I sobre persona fictícia).

### Calibração do `ia3_check` — 25/08/2026: é o `erro_grave`, não a escala

`scripts/_calibrar-ia3-check.ts`. O controle do piloto tinha achado que cenários
guardados com 92 voltavam com 38–60 pelo caminho idêntico ao da produção. Três
hipóteses, e o script separou as três.

**(C) O check É reprodutível.** Mesmo cenário, 3 re-checks: 58, 60, 60 —
amplitude de **2 pontos**. Não é ruído; a divergência significa alguma coisa.

**(B) Diverge em TODOS os tenants**, não só na ACME Demo (que tinha o override
para o `gpt-5.4` morto): Ibipeba −30, Teste Piloto −37, Boehringer −38, Elo −32,
Macaé −29, mas também ACME −8, Bett −13, UniAnchieta −2. Espalhado demais para
ser o override.

**A causa real é o `erro_grave`,** que é binário e trava a nota em 60:

| guardada | nota bruta | `erro_grave` | delta |
|---:|---:|---|---:|
| 88 | **60** | **true** | −28 |
| 92 | 87 | false | −5 |
| 97 | 88 | false | −9 |

Com `erro_grave=false` o delta é −5/−9 — variação normal entre auditores. **Toda
a divergência vem do flag disparando.** Não houve deriva de escala.

🔑 **E o flag não é sustentado pelo próprio texto do modelo.** No caso que
disparou, a justificativa diz *"O instrumento tem metadados detalhados,
descritores mapeados e perguntas abertas com intenção diagnóstica clara"* — texto
elogioso junto de `erro_grave=true` e nota 60. O modelo levantou uma bandeira que
o raciocínio dele mesmo não apoia.

⚠️ **Onde isso fere a doutrina do projeto:** o comentário de
`normalizarResultadoCheckIA3` diz *"Clamp erro_grave×nota + status derivado EM
CÓDIGO"*. Mas o código só deriva o **status** a partir da **nota** — e quem
domina a nota é um **booleano declarado pelo modelo**, sem lastro dimensional.
Os nove critérios de erro grave são majoritariamente subjetivos ("trade-off muito
fraco", "teatral demais", "resposta genérica suficiente"), então cada auditor
traça a linha em outro lugar e a nota inteira vira refém disso.

**~~Remédio proposto: derivar `erro_grave` em código~~ — REFUTADO no mesmo dia.**

A hipótese acima ("bandeira sem lastro") foi tirada de UM caso, olhando só a
justificativa. `scripts/_medir-erro-grave-ia3.ts` mediu os dois elos em 8
cenários e derrubou os dois:

| | resultado |
|---|---|
| clamp `if (erro_grave && nota > 60)` ATUA? | **0 de 8** — nunca |
| `erro_grave` disparou COM dimensão baixa? | **5 de 5** — sempre |
| `erro_grave` SEM lastro dimensional? | **0** |

O modelo já devolve a nota baixa junto do flag (`nota = 60`, e o clamp exige
`> 60`), então **derivar `erro_grave` em código não mudaria nota nenhuma**. E o
flag nunca esteve desamparado: as dimensões que o sustentam são
`cobertura_descritores = 0`, `poder_discriminante = 0`, `contencao_sobriedade = 2`.

**O que sobra, então:** o auditor de hoje simplesmente pontua mais baixo, com
justificativa dimensional. Não é flag quebrado, não é deriva de escala, não é
ruído (reprodutibilidade ±2). A pergunta volta a ser *qual dos dois auditores
está certo* — e isso nenhuma medição de auto-consistência responde.

🔑 **A pista acionável que sobrou:** `contencao_sobriedade` é a dimensão MAIS
BAIXA em quase toda a amostra (4, 6, 2, 5, 2, 6, 5). Ou os cenários do acervo são
elaborados demais para uso real, ou o Terra pesa demais essa dimensão.

### Três famílias auditando os mesmos cenários — 25/08/2026

`scripts/_ia3-check-3-familias.ts`. Quatro cenários, três auditores, nenhum deles
da família que GEROU (Claude), então sem auto-preferência.

**Unânime no diagnóstico:** as três apontam `contencao_sobriedade` como a
dimensão mais fraca — 10 de 11 checks. O Terra NÃO está enviesado nisso: o acervo
é elaborado demais para uso real.

**Mas a NOTA diverge brutalmente sobre os mesmos textos:**

| auditor | nota média | sobriedade média | veredito com o limiar atual |
|---|---:|---:|---|
| `gpt-5.6-terra` | **65,8** | 2,8 | tudo `revisar` |
| `qwen3.8-max` | **85,3** | 4,7 | `aprovado_com_ressalvas` |
| `gemini-3.7-flash` | **95,5** | 9,5 | quase tudo `aprovado` |

No mesmo cenário ("Conselho de Classe em Colapso"): Terra 60, Gemini 98, Qwen 84
— os três dizendo que a sobriedade é o ponto fraco.

🔴 **As famílias concordam sobre O QUE está fraco e discordam sobre QUANTO pesa.**
Com limiar ABSOLUTO (≥90 aprovado, ≥80 ressalvas), o mesmo cenário é aprovado,
com ressalvas ou reprovado dependendo apenas de quem auditou. **`status_check`
não é propriedade do cenário — é do auditor.** A padronização de 22/07 no Terra
tornou o limiar coerente daí para frente e invalidou a comparação com tudo que
veio antes; é isso, e não deriva de escala, que produziu o −38 da calibração.

⚠️ **Isto DERRUBA a recomendação de `ia3_check` → Gemini 3.7 Flash** que a grade
de modelos trazia para o bloco de auditoria de alto volume (por preço e
velocidade). Como auditor, o Gemini 3.7 dá média **95,5**: aprovaria praticamente
tudo. Auditor que não reprova não é auditor, e isso vale mais que $0,75/1M.

**Critério que fica no lugar do preço:** promover auditor passa a exigir **taxa
de reprovação contra um conjunto conhecido**, não índice de leaderboard nem custo
por token. O Terra fica no `ia3_check`.

### Piloto E1 (Qwen × Sonnet 4.6 em cenários) — 25/08/2026: INCONCLUSIVO, e o motivo importa

`scripts/_piloto-qwen-e1-cenarios.ts` gera cenários com os dois modelos SEM
persistir e usa o `ia3_check` (Terra, cross-família de ambos) como juiz.

**Números:** Sonnet 4.6 média 63,00 (4/4 `revisar`, 68s) · Qwen 80,00 (3 de 4 em
`aprovado_com_ressalvas`, 331s). Parece vitória do Qwen. **Não conte como uma.**

Antes de rodar ficou fixado que o Sonnet 4.6 tinha que sair perto de 88 — o piso
da produção no mesmo tenant — para a medição valer. Saiu 63. O controle
(`_piloto-controle-harness.ts`) re-checou cenários JÁ PERSISTIDOS pelo mesmo
caminho: os quatro guardados com **92 voltaram com 38–60, delta médio −38**.

A chamada do piloto é idêntica à de `checkCenarioIA3Core` (mesmo prompt, modelo,
teto e normalização), então não é o harness que erra: **a nota guardada e a nota
de hoje não estão na mesma escala.** A suspeita principal é o auditor — a ACME
Demo tinha override de `ia3_check` para `gpt-5.4`, que morreu (403) e saiu na
migration 227; se aquelas notas de 92 vieram dele, o limiar absoluto
(`>=90 aprovado`, `>=80 ressalvas`) está sendo aplicado a notas de auditores não
calibrados entre si.

⛔ **Enquanto isso não fechar, `status_check` não é comparável no tempo** — e a
pergunta deixa de ser sobre o Qwen. O próximo passo está escrito no controle:
repetir a amostra ATRAVESSANDO tenants. Se só a ACME Demo divergir, é dela; se
divergir em todos, é do auditor de hoje contra o histórico.

Dois achados do piloto que independem disso:

1. **`descricao`, não `contexto`.** A 1ª rodada deu 58 nos DOIS modelos porque o
   `cen` montado em memória usava `contexto`; `montarCheckIA3Prompt` lê
   `cen.descricao`, e o rename só acontece dentro de `persistirCenarioIA3`. O
   auditor recebeu seis cenários sem enunciado. Defeito que deprime os dois lados
   por igual não parece defeito — parece empate.
2. **Qwen estoura o orçamento da plataforma no E1 síncrono.** 331s de média (contra
   68s), e na 1ª rodada 2 de 4 morreram em `UND_ERR_HEADERS_TIMEOUT` — o teto de
   headers do undici, 300s, que fica ABAIXO do `AbortSignal` e por isso ignora o
   `timeoutMs`. As rotas de admin têm `maxDuration` de 300s: não é "lento", é
   inviável nesse caminho. Só entraria por Trigger.dev ou Batch.

### Painel cego cross-família — 25/08/2026 (a leitura humana SEGUE PENDENTE)

`scripts/_pdi-leitura-cega-painel.ts`. Os 9 corpos são extraídos do artefato com
o `data-slug` removido (o slug é o gabarito do botão "revelar"), e o payload é
conferido contra qualquer nome de modelo — se vazar, o script **aborta** em vez
de rodar cego-de-mentira. Quatro juízes, um por família, teto 16k, 300s.

🔑 **O viés foi MEDIDO, não ignorado.** Todo juiz disponível é também
concorrente: dos 9 textos, 4 são Claude, 3 GPT, 1 Gemini, 1 Kimi. Então o script
calcula, por juiz, a posição média que ele deu à própria família contra as
outras, e publica um agregado **neutralizado** — cada texto pontuado só por
juízes de OUTRA família.

| Juiz | própria família | outras | veredito |
|---|---:|---:|---|
| `gpt-5.6-sol` | 3,33 | 5,83 | 🔴 favorece a própria em 2,5 posições |
| `gemini-3.7-flash` | 4,00 | 5,13 | sem viés claro |
| `kimi-k3` | 5,00 | 5,00 | sem viés claro |
| `qwen3.8-max` | — | — | **sem texto próprio no conjunto: juiz neutro** |

**Ranking neutralizado** (1 = melhor): C `opus-5 high+thinking` **1,00** ·
A `sonnet-5` **3,00** · H `sonnet-5 high` 5,50 · E `sonnet-4-6` 5,75 ·
F `kimi-k3 low` 6,00 · B/D `luna low`/`gemini-3.6` 6,67 · G/I `terra high`/`luna high` 7,00.

Três coisas que isto move:

1. **C foi primeiro para os QUATRO juízes** — inclusive o neutro (Qwen) e o
   enviesado a favor da OpenAI. É o achado mais robusto do conjunto.
2. **Sonnet 5 (3,00) acima do 4.6 (5,75)** — os quatro pins de saída longa
   deixam de estar apoiados só em custo. Fraco, mas na direção do que já estava
   decidido, e não contra.
3. **`sonnet-5` bateu `sonnet-5 high`** (3,00 vs 5,50): mais esforço não
   escreveu melhor. Pagar `effort: high` em PROSA não se justifica com este dado.

⚠️ **O que isto NÃO é.** n=4, juízes LLM, e os quatro primeiros lugares são todos
Claude — o que pode ser qualidade ou pode ser um viés sistemático de estilo que
todo juiz LLM compartilha. Não dá para separar as duas hipóteses com juiz LLM
nenhum. **A leitura humana continua sendo o veredito**, e o artefato está intacto
para ela; isto é insumo que diz por onde começar (C e A) e o que já dá para parar
de pagar (`effort: high` em prosa).

⚠️ **Dois juízes falharam na primeira rodada, e as duas falhas ensinam:**
`kimi-k3` gastou **3.997 de 4.000 tokens em raciocínio** e devolveu conteúdo
VAZIO com HTTP 200 — pego pelo `conteudoOuFalhaAlto` (25/08); antes ele viraria
`""` silencioso e o juiz entraria na apuração como se tivesse votado. E
`qwen3.8-max` estourou os 120s do timeout padrão, exatamente como os ~21 tok/s
medidos previam. Modelo que raciocina precisa de teto folgado; modelo lento
precisa de timeout próprio.

**A única métrica objetiva que discriminou foi densidade** — bytes de markdown
legível ÷ tokens de saída, isto é, quanto do que se paga vira texto que a pessoa lê:

| Run (5 competências) | out tok | US$ | Latência | Bytes/tok |
|---|---:|---:|---:|---:|
| `gpt-5.6-luna` low | 4.416 | **0,031** | **31s** | **3,39** |
| `gpt-5.6-terra` high | 4.580 | 0,081 | 42s | 3,21 |
| `gemini-3.6-flash` | 4.873 | 0,054 | 34s | 2,97 |
| `gpt-5.6-luna` high | 6.809 | 0,046 | 50s | 2,37 |
| `kimi-k3` low | 7.983 | 0,145 | 200s | 2,44 |
| **`claude-sonnet-4-6`** (produção) | 8.908 | 0,161 | 183s | 2,65 |
| `claude-sonnet-5` | 10.348 | 0,127 | 104s | 1,58 |
| `claude-opus-5` thinking+high | 11.270 | **0,342** | 151s | 1,77 |
| `claude-sonnet-5` high | 13.041 | 0,147 | 116s | **1,20** |

O `sonnet-5 high` queima 13.041 tokens e entrega **menos texto** que o `luna low`
entrega com 4.416 — a inflação não vira conteúdo, vira overhead. O `opus-5` custa
2,4× o `sonnet-5` e **não** é mais prolixo: teto de referência, não candidato.

> ⚠️ **`effort` em Claude era ignorado até 08/08.** `options.reasoningEffort` só
> virava `reasoning_effort` no ramo OpenAI-compatible; no ramo Anthropic era
> descartado. Pedir "opus-5 em high" rodava o modelo em esforço **padrão** e
> devolvia resultado com o rótulo `high` — pior que um erro, porque a tabela mente.
> Corrigido para `output_config.effort` (GA na geração 5). O efeito é medido: o
> mesmo prompt no mesmo `sonnet-5` passou de 6.959 para 9.766 tokens ao ligar
> `high` (+40%).

### O `untagged` etiquetado — e o fio solto no receptor

77,3% do custo em 90 dias ($99,46 de $128,64) era `feature='untagged'`. Etiquetados
os call-sites que dominam: os 3 relatórios de 64k (`pdi_individual`,
`relatorio_gestor`, `relatorio_rh` — o maior custo por chamada da base), IA1/IA2 com
retries, IA3, cenário B, blueprint, evolução, reavaliação, extrações dos chats, e os
3 fallbacks síncronos das tasks Trigger (marcados `source:'batch-sync'`, para lote
degradado a preço cheio não se confundir com síncrono por opção).

**Achado no caminho:** o tipo `AIRun` de `lib/ai-batch.ts` declarava 5 parâmetros e a
implementação de `run` desestruturava 4; `syncFallback` chamava `callAI` sem o 5º.
Os dois call-sites que **já etiquetavam certo** (`conteudo_gerar`, `kit_desafio`)
gravavam `untagged` sempre que o lote caía no síncrono — ou seja, **exatamente nos
dias caros**, que são os que se quer explicar. O guard que existia lia o **emissor**
(o call-site, por regex) e passava verde enquanto o fio estava solto no **receptor**.
Guarda nova, validada por mutação: `tests/unit/integrations/ai-batch-taskkey.test.ts`.

Também separadas as três conversas que gravavam sob a mesma etiqueta
(`evidencias_socratic` cobria socrático, missão e analítico, que têm nº de turnos e
custo diferentes) — semana de conteúdo e semana de aplicação agora são distinguíveis
no ledger.

## 16/08 · Refino de Módulo-Base custa 2× a geração (e ainda compensa)

Rodada do manuscrito DIR10 → `C014` (Macaé), medida no `ia_usage_log`:

| Etapa | Chamadas | Custo | US$/módulo |
|---|---|---|---|
| Autoria (`modulo_base_autor`, `source='batch'`) | 24 | 2,235 | **0,093** |
| Refino (`modulo_base_autor`, `source='wrapper'`) | 15 | 2,707 | **0,180** |
| Auditoria (`modulo_base_auditor`, GPT-5.6 Terra) | 39 | 1,221 | 0,031 |
| **Total dos 24 módulos** | | **6,16** | |
| Micro-conteúdos (texto+case+layout+expansão PDF) | 36 | 1,66 | 0,104/conteúdo |

**Os 15 refinos custaram mais que as 24 gerações.** A causa é estrutural, não de
prompt: `refinarModuloCore` chama o wrapper SÍNCRONO, então paga preço cheio,
enquanto a autoria em lote pega o −50% da Batch API. O input também é maior — o
refino manda o módulo inteiro mais o feedback da auditora.

**Mesmo assim vale**, porque o alternativo é módulo parado: 13 de 14 reprovados
recuperados numa passada (a maioria 4,9 → 10) por US$ 2,71, contra regerar do zero
sem garantia de acertar o mesmo ponto. O que **não** vale é tratar refino como rotina
barata de "melhorar nota boa".

**Otimização óbvia e não feita:** o refino é o candidato natural a `submitClaudeBatch`
— é assíncrono por natureza (ninguém espera na tela) e roda em lote de N módulos.
Cortaria ~US$ 1,35 por manuscrito reprovado pela metade. Mesma família do
`submitOpenAIBatch` pendente para a auditoria.

⚠️ **`conteudo_expansao_pdf` pagou por um PDF que não nascia** (4 chamadas, US$ 0,26):
a expansão roda ANTES do render, e o render falhava por fonte (F-I18 do
`docs/FMEA-PIPELINE.md`). Etapa cara que alimenta um artefato opcional deveria
conferir se o consumidor existe antes de gastar.
