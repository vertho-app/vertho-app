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

---

## 26/08/2026 — O auditor de tetos estava cego, e três números do plano estavam errados

Três painéis externos revisaram o plano de substituição de modelos. Nove achados
procediam, um caiu — e o mais grave nenhum dos três encontrou: **o instrumento
que produziu as folgas de teto media 4 de 36 tarefas e fechava sem denominador.**

`scripts/_auditar-tetos-vs-saida.ts` terminava com a linha

```
1 task(s) com folga < 2,5x
```

sem dizer *sobre quantas*. Cinco cegueiras empilhadas, todas silenciosas:

| # | Cegueira | Efeito medido |
|---|---|---|
| 1 | `.limit(50000)` no ledger | devolvia **1.000 de 15.451** linhas — o cap de `max-rows` do PostgREST não se desliga pelo `.limit()`, e as 1.000 eram as mais ANTIGAS |
| 2 | teto que não é literal numérico | `IA4_MAX_TOKENS`, `req.maxTokens` → `continue`. A `ia4_avaliacao`, com truncamento medido, era invisível ao auditor dela |
| 3 | `obs.length < 3` | 28 tasks descartadas em silêncio |
| 4 | três populações somadas | produção + **simulador** (4.435 linhas) + scripts de piloto |
| 5 | `taskKey` computada | `conteudo_*` sai de um call-site com chave por ternário; feature que só existe no ledger nunca entrava no universo, e a reconciliação fechava mesmo assim |

A cegueira 4 tem um caso exemplar: em `ia3_cenarios` o p95 "de produção" era
**13.795**. A produção real é **3.270** — os 16.735 do topo eram **10 chamadas de
um piloto de Qwen** gravadas no ledger com a MESMA `taskKey`. Instrumento nosso
decidindo teto de produção.

**Depois da correção:** 24 de 43 tasks avaliadas, ledger inteiro paginado, as três
populações separadas, e o relatório abre pela cobertura. Um teto irresolvível
agora é FALHA, não silêncio; a reconciliação (`avaliadas + sem tráfego + sem teto
legível = total`) denuncia balde escondido.

### O que mudou nos números

| Task | O plano dizia | Medido | Veredito |
|---|---:|---:|---|
| `conteudo_texto` | 1,1× | **2,11×** | errado — o teto é 8.000, não 4.096 (o call-site bifurca por formato) |
| `conteudo_case` | 1,5× | **2,83×** | errado — já está folgado, não precisa de nada |
| `ia3_cenarios` | 2,1× | **1,88×** | otimista — p95 contaminado pelo piloto |
| `conteudo_podcast` | 1,7× | 1,68× | certo |
| `acumulada_primaria` | 2,0× | 2,01× | certo |
| `ia3_check` | 2,0× | 2,00× | certo |

E **quatro tarefas apertadas que o plano não via**: `temporada_extracao` **1,03×**
(a pior da base, 2 chamadas já encostando no teto), `blueprint_audit` 1,92×,
`beto` 2,17×, `conteudo_personalizacao` 2,30×.

### Censura ≠ folga

`ia4_avaliacao` tem p95 = **16.000** = o teto ANTIGO, com **59 de 388** chamadas
paradas nesse valor exato. Um p95 censurado é PISO, não estimativa: aplicar
"2,5× o p95" ali só reproduz o corte. O auditor agora detecta censura pelo
**pico** (muitas chamadas no mesmo valor exato) e não pelo teto vigente — senão
subir o teto faz a censura histórica desaparecer do relatório sem ter sido
resolvida. Essa task precisa de um lote sem censura antes de qualquer número.

### "Subir o teto é quase de graça" — errado na geração 5

O docblock do próprio auditor afirmava isso. Na geração 5 o thinking é
`{type:'adaptive'}` **sem budget próprio** (`actions/ai-client.ts:355`), então
`max_tokens` é o único limite do raciocínio: subir dá mais espaço para pensar, e
pensamento é cobrado. No 4.6, com `budget_tokens` explícito, a frase valia — e é
exatamente nos modelos para os quais o plano migra que ela deixa de valer.
**Mas isso NÃO inverte a decisão** — e a versão anterior desta seção errava ao
concluir "dimensionar pelo p95, nunca dobrar por segurança". Custo maior por
raciocínio é **condicional**; desperdício por teto curto é **certo**.

### A régua do teto: erre para CIMA (decisão do Rodrigo, 26/08)

Teto alto com custo maior é preferível ao risco de quebrar um JSON. A assimetria
está medida na própria base, em `ia4_avaliacao` no Sonnet 5:

| | n | custo | saída média |
|---|---:|---:|---:|
| completaram | 238 | US$ 26,06 | 10.242 |
| **truncaram em 16.000** | **59** | **US$ 9,67** | 16.000 (o teto) |

As 59 consumiram **27% do gasto da tarefa e entregaram zero** — JSON cortado no
meio não é resposta parcial, é parse quebrado. E custaram **mais por chamada**
(0,164 contra 0,110) exatamente por correrem até o teto. Um teto folgado teria
somado ~4k tokens a cada uma: cerca de **US$ 2,36 para evitar US$ 9,67** de
desperdício puro, antes do retrabalho e do risco de persistir artefato corrompido.
**Retorno de 4:1 em errar para cima.**

Consequências operacionais:

- `FOLGA_MINIMA` passou de 2,5× para **3×**, e o teto sugerido é o maior entre
  **3× o p95** e **1,5× o máximo observado** — quem quebra o JSON é a cauda, não
  a média, e o p95 por definição deixa 5% de fora.
- **`n` pequeno pede MAIS folga, não menos.** Com n=2 o "p95" é o máximo de duas
  chamadas: a cauda ainda não apareceu. O auditor agora sugere 1,5× extra nesses
  casos — o contrário do reflexo de "só subo com dado".
- **O limite real do teto não é o preço, é a LATÊNCIA** contra o `maxDuration` de
  300s da rota. `modulo_base_autor` já tem p95 de 227s. Onde o teto generoso
  ameaça o relógio, a resposta é Trigger.dev/Batch — nunca encolher o teto.
- ⚠️ **Subir teto pode trocar o caminho de código.** Acima de 8.192 o ramo Claude
  sai de `messages.create` para `messages.stream`, com outra leitura de uso e
  outra detecção de truncamento. Das sugestões atuais, cinco cruzam esse limiar.

### Duas correções de rota no de-para

**`22.1`/`22.2` → Claude era impossível.** 22.1 manda VÍDEO por `inlineData`
(`lib/gemini-video.ts:89`) e 22.2 manda ÁUDIO (`trigger/extracao-video.ts:53`);
Claude não ingere nenhum dos dois. O comentário em `gemini-video.ts:18` é de
**25/08** e mantém o 3.6 de propósito. Voltaram para o bloco Mídia.

**`3.2`/`3.3` não se movem pela tabela.** `app/api/chat/route.ts` resolve o
avaliador por `sys_config.ai.modelo_padrao` e o auditor por const hardcoded —
nenhum passa por `resolveTaskModel`. Editar `DEFAULT_TASK_MODELS` não os toca.

### Dois furos de Dual-IA fechados

**1. O chat da fase 3.** O auditor é `gpt-5.6-terra` desde 05/08 (o comentário em
`PARES_FORA_DA_TABELA` ainda dizia `gemini-3.1-flash-lite`, e um painel externo
leu daqui e repetiu o id morto). Com o gerador vindo de um **dropdown de admin**,
bastava escolher qualquer GPT para gerador e auditor caírem na mesma família —
sem erro, sem log, sem teste, porque o par está fora da tabela. Agora o auditor é
calculado (`auditorCrossFamilia`) e `tests/unit/chat-dual-familia.test.ts`
exercita **toda** opção do dropdown.

**2. O fallback de provedor.** `AI_FALLBACK_MODEL` é um knob ÚNICO e vale
`gpt-5.6-terra` — o auditor de 6 dos 9 pares. Num outage da Anthropic, todo
gerador Claude cairia na família do próprio auditor, e o efeito não seria falhar:
seria **aprovar** com o mesmo modelo dos dois lados. Agora `callAI` e `callAIChat`
usam `fallbackRespeitandoDual`, que exclui a família do parceiro e devolve `null`
quando não há substituto — falhar é o comportamento correto.
⚠️ O guard pegou que a primeira correção tinha ido só no `callAI` e deixado o
`callAIChat` com o knob direto: a armadilha dos dois caminhos, de novo.

### O headline virou faixa

| Cenário | Δ 90 dias |
|---|---:|
| Caso-base (saída igual à medida hoje) | −$34,72 |
| Saída do Sonnet 5 inflando 31% (medido na IA4) | **−$20,30** |
| Se a S4 reprovar A, D1 e D2 | −$28,96 |

Um total único seria o melhor caso vendido como expectativa. E para dimensionar o
que está em jogo: enquanto a faixa discute **$20–35 em 90 dias**, `cena_turno` +
`cena_extracao` em Opus 5 gastaram **$37,88 em 3 dias**. O ganho deste plano é de
RISCO — truncamento, auditor que reprova, Dual-IA preservada —, não de dólar.

### Em aberto, declarado

- **Checks do bloco C** (`pdi_check`, `relatorio_check`) continuam **não existindo**.
  O exercício nasceu de "os artefatos irreversíveis não têm auditor" e o plano
  otimiza os modelos DENTRO desse buraco. Fica para depois, por escrito.
- **`AI_FALLBACK_MODEL` na Vercel** é *Sensitive* e ilegível. O código agora é
  seguro qualquer que seja o valor (a escada corrige a família), mas o valor real
  segue desconhecido — canário pendente.
- **`untagged` = 3.630 chamadas (33% da produção)** sem `taskKey`. Não é teto que
  falta, é etiqueta no call-site.
- **`ia4_avaliacao`**: lote sem censura antes de redimensionar o teto.

### Fase 1 APLICADA — 26/08/2026

Doze tetos subidos pela régua nova (`max(3× p95, 1,5× o máximo)`), depois de
canário real nos 12 modelos do dropdown. `5 de 24` tarefas abaixo de 3× viraram
`2 de 24`.

| task | de | para | latência p95 | nota |
|---|---:|---:|---:|---|
| `temporada_extracao` | 2.000 | **8.000** | 42s | 3 call-sites com tetos diferentes (8000/3000/2000) unificados |
| `conteudo_texto` / `conteudo_case` | 8.000 | **12.000** | 90s / 69s | mesmo ternário |
| `conteudo_podcast` | 4.096 | **8.000** | 43s | outra ponta do mesmo ternário |
| `ia3_cenarios` | 6.144 | **10.000** | 71s | cruza 8.192 → passa a usar STREAM |
| `acumulada_primaria` | 8.000 | **12.000** | 80s | cruza 8.192 → STREAM |
| `ia1_top10` | 8.192 | **14.000** | 23s | n=2, então +1,5× por "erre para cima" |
| `blueprint_audit` | 4.000 | **7.000** | 42s | |
| `ia3_check` | 4.096 | **7.000** | 29s | |
| `acumulada_check` | 6.000 | **8.000** | 26s | |
| `conteudo_personalizacao` | 2.000 | **3.000** | 25s | |
| `beto` | 500 | **1.000** | 9s | |

**Duas ficaram de fora, por motivos opostos:**

- `modulo_base_autor` (2,99×) — **latência**, não folga. p95 de **227s** contra o
  `maxDuration` de 300s: 76% do relógio consumido. Subir 3% de folga comprando
  risco de timeout é o trade errado. Se precisar de mais teto, a saída é
  Trigger.dev, não um número maior na mesma rota.
- `ia4_avaliacao` (2,00×) — **censura**. p95 = 16.000 = o teto antigo, com 59 de
  388 paradas nesse valor exato. Precisa de um lote sem censura antes.

### Canário de contrato: 35 de 36

`scripts/_canario-contrato-modelos.ts`, chamada real, 12 modelos × 3 combinações
(base · `effort:high` · `cachedUserPrefix`). Todos aceitaram o corpo.

A única reprovação foi **minha, não do modelo**: `claude-sonnet-4-6 [cache]`
devolveu o JSON certo dentro de uma cerca, depois escreveu *"Wait, I need to
return only valid JSON without code fences"* e repetiu o objeto. Não é
truncamento nem efeito do cache — é o modelo se autocorrigindo, e ocorreu em 1
de 3 execuções idênticas.

O canário reprovou porque tinha um parser **próprio**. A produção usa dois, e
nenhum é esse: `extractJSON` (leniente, 48 call-sites) recupera isso na
estratégia 2; `parseJsonIA` (estrito, 10 call-sites) lançaria. E a interseção
entre os 10 call-sites estritos e os que usam `cachedUserPrefix` é **vazia**.

Corrigido: o canário agora mede pelos dois parsers reais e distingue "só o
leniente salva" (aviso) de "irrecuperável" (bloqueia). Instrumento que não lê
pelo consumidor inventa um problema que o produto não tem — e esconde um que ele
tem.

### 26/08 (cont.) — IA4 e módulo-base: a premissa de latência estava errada

**"Por que o teto da IA4 é 16.000?"** — não é. É **32.000 desde 25/08**; os
16.000 do relatório são o **p95 histórico**, de quando o teto era 16.000, e
nenhuma chamada rodou desde 15/08. O número que parecia teto era cicatriz.

**Onde eu errei:** segurei o `modulo_base_autor` dizendo "p95 de 227s contra os
300s da rota — 76% do relógio". Fui conferir a pedido do Rodrigo e **nenhum
caminho que executa essa task tem 300s**:

| caminho | limite |
|---|---:|
| `app/api/internal/modulo-from-video/route.ts` | `maxDuration = 800` |
| `trigger/gerar-modulos-manuscrito.ts` (+ Batch API) | `maxDuration = 3600` |
| `trigger/estruturar-material.ts` · `trigger/extracao-video.ts` | Trigger |

Os 227s eram **6% do orçamento, não 76%**. O 300 era premissa herdada de um
comentário — inclusive um comentário em `lib/modulos-base/pipeline.ts` que
justificava o próprio teto por "os 300s da rota síncrona".

**A distinção que resolve o medo de teto alto:** no call-site que importa, quem
limita o relógio é o **`timeoutMs`** da chamada, não o `max_tokens`. Com o tempo
fixo em 180s, teto maior não alonga nada — só dá espaço para o JSON **fechar**
em vez de ser cortado. São dois parâmetros que limitam coisas diferentes, e
confundi-los é o que faz alguém "economizar" teto achando que protege latência.
Evidência local contra o medo: `pdi_individual` roda em **64.000** e tem p95 de
saída de **7.393** — teto folgado não produz saída inflada.

**Aplicado:**

| task | de | para | |
|---|---:|---:|---|
| `ia4_avaliacao` | 32.000 | **64.000** | fluxo crítico; alinha com `pdi_individual` e os relatórios, que já rodam nesse teto no mesmo modelo — valor provado na API |
| `modulo_base_autor` (2 sites) | 32.000 | **64.000** | unifica a taskKey: as outras 2 chamadas já rodavam em 64k |
| `cenarios_b` (3 sites) | 6.144 | **32.768** | unifica com o 4º site, que já usava 32.768 para a MESMA operação |

**`0 de 24` tarefas abaixo de 3×.**

**O limite real da IA4 nunca foi o teto.** `actions/fase3.ts` avalia em **laço
sequencial** dentro de uma Server Action, uma chamada por colaborador, p95 de
156s cada — três colaboradores já passam de 300s. Quem tem orçamento para lote é
`trigger/gerar-ia4-batch.ts` (3600s + Batch API); a action síncrona serve caso
avulso. Isso é anterior às mudanças de hoje e continua em aberto.

**Duas lacunas declaradas:**

- **O ledger não registra contexto de execução.** `source` distingue batch de
  síncrono, não rota de Trigger — então "estamos perto do timeout?" não é
  respondível pelo dado, só lendo o `maxDuration` de quem chama. Foi por isso
  que a premissa errada sobreviveu.
- **`arguicao` tem tetos divergentes DE PROPÓSITO** (2.048 no turno de conversa,
  4.096 na avaliação final). O conserto não é unificar — é **partir a taskKey**,
  senão o p95 dela continua sendo uma mistura de duas operações. O auditor agora
  classifica isso como divergência intencional, com justificativa obrigatória,
  em vez de repetir um aviso que ninguém pode resolver.

### 26/08 — a IA4 síncrona delega, e o ledger passa a saber o orçamento

**Delegação.** `rodarIA4` avaliava em laço sequencial dentro de uma Server
Action, p95 de 156s por volta. Duas voltas já passam de 300s — e não é hipótese:
em 11/08 a action estourou no meio de um lote e deixou **58 de 72** respostas com
avaliação gravada e **sem check**, estado que nenhuma tela alcançava depois.

Acima de `IA4_MAX_SINCRONO = 1`, a action delega para `enqueueIA4Batch` →
`gerar-ia4-batch` (3600s + Batch API, −50%). O limiar é derivado, não escolhido:
`1 × 156s` cabe em 300s, `2 × 156s` não. Se o enfileiramento falhar, **falha
alto** — cair no laço síncrono seria escolher o caminho que sabemos que trunca,
justamente no volume em que ele trunca.

**Contexto de execução no ledger (mig 230).** Duas colunas novas:

| coluna | o que é |
|---|---|
| `runtime` | `trigger` · `rota` · `action` · `script` · `desconhecido` |
| `orcamento_ms` | o `maxDuration` daquele contexto, quando conhecido |

`orcamento_ms` é o **denominador** que faltava: sem ele, `latency_ms` sozinho não
responde "estamos perto do timeout?". Foi essa ausência que deixou minha premissa
errada sobre `modulo_base_autor` sobreviver — 227s são **76% de uma rota de 300s
e 6% de uma task de 3600s**, e nada no dado dizia qual dos dois era.

🔑 **Declarado, nunca farejado.** A alternativa seria detectar por env var do
Trigger, e a documentação não expõe nenhuma para isso — seria depender de detalhe
não documentado. `lib/execucao-contexto.ts` usa `AsyncLocalStorage`: quem conhece
o orçamento o declara (a task sabe seu `maxDuration`), e quem não declara entra
como `desconhecido` — cobertura que falta, visível, em vez de número inventado.
`fracaoDoOrcamento` devolve `null` sem orçamento, e `null ≠ 0`: é o que impede
ler "não declarado" como "sobra tempo". Acima de 80% do orçamento, o wrapper
avisa na trilha quente.

Provado ponta a ponta por `scripts/_probe-contexto-ledger.ts` — guard prova que o
código chama, só a linha gravada prova que o valor chegou:

```
runtime=trigger       orcamento_ms= 3600000  latency=1552ms  → 0% do orçamento
runtime=desconhecido  orcamento_ms=       —  latency=2846ms  → sem orçamento
```

**Dois guards da casa pegaram o meu diff, e os dois estavam certos:**

- `task-retry-guard` exige `run: async (…{ ctx })`; eu tinha trocado por
  `run: (…) =>`. Reescrevi para manter o padrão — não afrouxei o guard para
  acomodar meu estilo.
- `error-nao-checado-guard` acusou o insert do ledger como site novo (a
  allowlist é por **fingerprint**, e eu mudei o conteúdo do insert). O conserto
  não foi allowlistar: o insert **passou a checar o `error`**. Um ledger que
  perde linhas em silêncio não perde log — perde o dado que decide teto, modelo
  e custo, e esta sessão inteira mostrou o que conclusão sobre ledger incompleto
  produz. A allowlist encolheu de 214 para 213 arquivos (982 → 981 sites).

### 27/08 — o ledger passa a dizer ONDE nasce o `untagged`

`untagged` é **3.630 chamadas, 33% da produção**, sendo **3.109 em Sonnet 4.6 =
US$ 96,27**. Todas com `empresa_id` NULL — ou seja, sem atribuição de tenant
também. É o achado F13 de 09-10/08, ainda aberto, e a razão de não fechar é
estrutural: etiquetar os call-sites conhecidos resolve os de hoje, não os de
amanhã.

**A allowlist estática diz quais sites EXISTEM sem etiqueta; não diz quais
RODAM.** E o tráfego recente tem uma assinatura só — input ~2.100, saída ~2.200,
42s, todo dia, sempre Sonnet 4.6 — o que significa que um punhado dos 52
responde por quase tudo. Escolher qual etiquetar primeiro sem medir é chute.

Mig 231: `origem_codigo`, preenchido **só quando falta `taskKey`**, com a cadeia
de nomes de função (`lib/origem-chamada.ts`).

**Nome de função, não `arquivo:linha`** — em produção o código é bundlado e o
stack devolve `chunks/1234.js:56`, que muda a cada deploy. Nome de função
sobrevive ao bundle.

**Três defeitos que só apareceram medindo:**

1. **Captura no lugar errado.** Dentro de `registrarUsoIA`, depois de vários
   awaits, o resultado era `main` — não o call-site. Causa: `return callAI(...)`
   em posição de cauda numa função async faz o V8 **elidir o frame** do
   chamador. A captura mudou para a **entrada** de `callAI`/`callAIChat`, onde a
   pilha ainda é síncrona.
2. **Filtro de ruído por caminho.** A 1ª versão testava a linha inteira do stack
   contra `/ai-client|origem-chamada/` — em teste descartava qualquer chamador
   cujo ARQUIVO tivesse esse nome (o próprio teste sumia, resultado sempre
   `null`); em produção, bundlado, não descartaria nada. Agora filtra por **nome
   de função**, que serve nos dois.
3. **`run`/`handler`/`main` na lista de genéricos.** Zerava exatamente o que mais
   importa: numa task do Trigger o quadro externo É `run`; numa rota, `handler`.

⚠️ E a asserção que verifica o item 1 **falhou duas vezes em ser um teste**:
a primeira passava também com a captura movida para depois do await; a segunda
falhava nos dois estados. As duas pela mesma causa boba — o comentário que
explica a regra contém a palavra "await", e a asserção procurava a palavra crua.
Corrigida para comparar **índices** contra uma âncora concreta
(`await resolveAILocale`). Pego por mutação; sem ela teria ido para produção
verde e inútil.

**Redução aplicada:** `lib/pulse/dual-ai.ts` (−2). Eram par Dual-IA **declarado
em `DUAL_IA_PARES`** e mesmo assim caíam em `untagged` — a única coisa que o
ledger não conseguia confirmar era justamente que o par roda em famílias
diferentes. Allowlist: 52 → 50, +1 fixture do probe = **51**.

**Um call-site que NÃO vale etiquetar:** `actions/fase4.ts:53` gera PDI e grava
na tabela `pdis`, que tem **0 linhas** e cujo único leitor é o próprio
`fase4.ts`. Etiquetar deixaria o ledger mais bonito sem melhorar nada — o que
essa linha pede é decisão sobre remover, não uma `taskKey`.

### 27/08 — as dez trocas "sem gate": duas já feitas, duas aplicadas, seis não são tabela

Fui aplicar a faixa sem gate (P + B + F1 + F2, dez linhas) e o de-para se
desfez sob inspeção:

| | quantas | o que são |
|---|---:|---|
| **já em produção** | 2 | `3.3` (auditor do chat já é Terra desde 05/08) e `15.5` (`sem14_check` já pinado em Terra) |
| **troca limpa de tabela** | 2 | `11.5` `conteudo_tags`, `18.1` `pulse_classify` |
| **NÃO fazer** | 1 | `19.5` — ver abaixo |
| **exigem CÓDIGO, não tabela** | 5 | `16.4`, `8.3`, `12.5`, `16.5`, `16.6` |

As duas primeiras estavam no de-para porque ele foi construído sobre
`docs/CATALOGO-PROMPTS-IA.md`, que está atrás do código — a mesma classe de erro
que o painel externo cometeu ao repetir o id morto do meu comentário.

E os cinco de código são o achado maior: o painel apontou `3.2`/`3.3` como
"requer código"; medindo, **metade da faixa** é. `12.5` e `8.3` nem passam
`taskKey`; `16.5`/`16.6` chamam `getModelForTask(null, 'modulo_base_autor')` —
tomam emprestada a etiqueta do AUTOR, então mudá-los pela tabela moveria o autor
junto; `16.4` compartilha `taskKey` com o autor pela mesma razão.

**`19.5` sai da lista.** O extrator de evidências da cena usa `MODELO_PESADO`
(Opus 5) com `reasoningEffort: 'high'`, e o comentário inline diz **"é aqui que
a nota nasce"** — decisão de 25/08. Rebaixá-lo por −$5,22 é a mesma classe de
erro já apontada duas vezes nesta rodada. (Se um dia for para mexer, o alvo é
Sonnet 5, não 4.6: com saída média de 4.184 tokens, bem acima do pivô, ele sai a
**$5,22** contra $7,84 do 4.6 e $13,06 do Opus — mais barato E melhor que o
destino que o plano propunha.)

### 🔴 O pino do auditor não bastava — 8 de 10 pares Dual-IA cediam

Ao adicionar `pulse_classify` à tabela, o guard mostrou algo maior. Todo auditor
está pinado; **nenhum gerador estava** (só `ia4_avaliacao`). Como
`sys_config.ai.modelo_padrao` sobrescreve qualquer task não pinada, bastava um
admin escolher no dropdown um modelo da família do auditor para os dois caírem
juntos:

```
ia3_cenarios=gpt-5.6-sol       colidiu com ia3_check=gpt-5.6-terra
cenarios_b=gpt-5.6-sol         colidiu com cenarios_b_check=gpt-5.6-terra
acumulada_primaria=gpt-5.6-sol colidiu com acumulada_check=gpt-5.6-terra
sem14_scorer=gpt-5.6-sol       colidiu com sem14_check=gpt-5.6-terra
modulo_base_autor=gpt-5.6-sol  colidiu com modulo_base_auditor=gpt-5.6-terra
pulse_classify=gpt-5.6-sol     colidiu com pulse_audit=gpt-5.6-terra
```

Não falha: a auditoria segue rodando e **aprovando**, com o mesmo modelo dos dois
lados, sem erro e sem log.

A saída **não** foi pinar os oito — isso tiraria do tenant a escolha de modelo em
metade do produto. `resolveTaskModel` passa a **calcular** a invariante: se o
padrão do tenant colidir com a família do parceiro, ele é ignorado e a task fica
no seu default, com aviso. Quem cede é o gerador; o auditor segura o pino,
porque é ele que existe para ser independente.

⚠️ **Quase reportei isto como buraco antes de ser verdade.** A primeira versão do
teste dava `ReferenceError: MODELOS_DISPONIVEIS is not defined` e eu li as três
linhas vermelhas como achado. Teste que ERRA não é teste que encontrou algo — o
`ia4_avaliacao`, que aparecia na lista, na verdade estava protegido pelo pino.

### 27/08 — o check do bloco C existe: `pdi_check`

O exercício inteiro nasceu de "os artefatos IRREVERSÍVEIS não têm auditor", e
depois passou três dias otimizando modelos **dentro** desse buraco. O PDI é o
caso mais agudo: sai em PDF, vai para a pessoa avaliada, e nada conferia o que o
gerador escreveu.

**Duas camadas** (`lib/relatorios/pdi-audit.ts`, puro, no molde de
`lib/blueprint/audit.ts`):

**1. Estrutural — código, determinístico, grátis.** Confere as promessas
LITERAIS do prompt. Não é opinião:

| check | o que trava | severidade |
|---|---|---|
| `sprint-do-blueprint` | o prompt manda `acao_principal ← acao_principal (igual)`; se o modelo reescreveu, o PDI promete um movimento que a trilha não sustenta | **fail** |
| `gap-sem-acao` | competência com `flag` (N<3) sem `melhorar`/dicas — a pessoa lê que está abaixo e não recebe caminho | **fail** |
| `sem-competencias` | zero competências não é aprovação | **fail** |
| `checklist-3` | o prompt exige EXATAMENTE 3 itens | warn |
| `perfil-2a-pessoa` | o prompt diz "NUNCA em 3ª pessoa" e dá o exemplo do erro | warn |
| `jargao-ingles` | termos que o prompt proíbe no texto entregue | warn |

O que um `===` resolve não deve custar uma chamada de IA — e os **números** do
PDI já estavam protegidos por overlay; o que estava sem rede era a **prosa** e o
**sprint**, que é o que a pessoa lê e executa.

**2. Semântica — 2ª IA, cross-família.** `pdi_check` em `gpt-5.6-terra` contra o
gerador em `claude-sonnet-5`. Procura afirmação sem lastro na evidência, análise
genérica, recomendação desproporcional ao gap e contradição interna. Cada achado
exige o TRECHO literal — achado sem citação não conta.

Custo estimado: ~US$ 3,32/90 dias sobre as 78 gerações medidas.

**Três decisões que o histórico deste projeto ditou:**

- **Roda ANTES do PDF.** Depois seria auditar coisa já entregue. Travado por teste.
- **Falha do auditor NÃO vira `pass`.** Resposta que não parseia, ou exceção na
  chamada, entram como check `fail` dizendo que a auditoria não rodou. "N ok, 0
  erros" ≠ aprovado.
- **Sem blueprint, o check de sprint AVISA** em vez de passar por vacuidade —
  ausência de fonte não é aprovação.

⚠️ E a auditoria **não derruba a geração**: o PDI já foi pago, e o veredito é
informação sobre ele, não pré-condição. Mas é PERSISTIDO em
`relatorios.conteudo.auditoria` — auditoria sem rastro é a que ninguém lê.

**Validado por mutação, 7 vezes:** 4 nos checks estruturais (sprint sem
comparar, gap virando aviso, jargão voltando a casar substring, sem-blueprint
passando) e 3 no wiring (veredito não persistido, catch virando `pass`,
auditoria depois do PDF).

⚠️ **Ainda não rodou de ponta a ponta em produção** — o teste cobre o módulo e o
consumidor, mas gerar um PDI real custa e escreve. A primeira geração é a prova
que falta.

### 27/08 — a instrumentação de orçamento cobria zero do tráfego real

Um dia depois da mig 230, medi: **145 de 145 chamadas de produção entraram como
`runtime: 'desconhecido'`.** Eu tinha instrumentado duas tasks do Trigger, e
**nenhuma delas carrega tráfego** — a instrumentação existia e não cobria nada.
É a mesma classe do guard que não roda no CI: só prova o que se observou fazer.

**Quatro rotas envolvidas**, cada uma declarando o próprio `maxDuration`:
`api/chat`, `api/temporada/reflection`, `api/temporada/evaluation`,
`api/temporada/tira-duvidas`.

**E de onde vem o tráfego do Modo Cena:** de **scripts** (`_cena-fase0.ts`,
`_cena-reextrair.ts`), não de rota nem de action. Os 1.087 `cena_turno` em Opus 5
que eu apontei como "o item mais caro da plataforma" são **rajada de
desenvolvimento**, não carga de produção. Isso rebaixa a prioridade de mexer
neles — e é exatamente o tipo de coisa que só aparece perguntando por onde a
chamada entra.

**Guard novo** (`tests/unit/security/rota-orcamento-guard.test.ts`): rota que
chama IA declara contexto, e o orçamento declarado **bate com o `maxDuration`
real** — denominador que mente é pior que denominador ausente.

⚠️ A primeira allowlist tinha **11 entradas — toda rota com `maxDuration`** — e o
próprio guard mostrou que **10 delas nem chamam IA**. Era falsa dívida, e
allowlist inflada ensina a ignorar allowlist. Sobrou **uma**:
`chat-simulador`, que não declara `maxDuration` — então não há orçamento a
declarar, e inventar um número faria o denominador mentir. Declarar
`maxDuration` ali é decisão de produto, não de instrumentação.

### 27/08 — `arguicao` partida em duas

O auditor de tetos reportava `arguicao` com 2.048 / 2.048 / 4.096 e eu havia
classificado como **divergência intencional**, anotando que o conserto real era
partir a `taskKey`. Feito: `arguicao_turno` (conversa, teto 2.048) e
`arguicao_avaliacao` (JSON de evidências, teto 4.096).

Divergência tolerada é aviso que nunca sai — e aviso que nunca sai é ignorado
junto com o resto. A entrada saiu de `DIVERGENCIA_INTENCIONAL`, que volta a ser
último recurso em vez de arquivo morto.

⚠️ **E nenhuma das duas estava em `AI_TASKS`.** A etiqueta `arguicao` marcava o
ledger sem constar do catálogo: não era roteável por `getModelForTask`, não
aparecia na tela de modelos, e rodava no `FALLBACK_GLOBAL` **sem ninguém ter
decidido isso** — o mesmo padrão de `pulse_classify` e `conteudo_tags`. As duas
foram declaradas com o valor incumbente (`claude-sonnet-4-6`), tornando a
escolha visível sem trocar nada.

As linhas históricas do ledger seguem com `feature = 'arguicao'`: o p95 daquele
período continua sendo mistura das duas operações, e só o tráfego novo separa.

### 27/08 — guard: toda `taskKey` declarada, e vice-versa

Em UM dia apareceram **três** etiquetas que resolviam modelo por omissão —
`pulse_classify`, `conteudo_tags` e `arguicao`. Três no mesmo dia não é
coincidência, é padrão. O guard fecha as duas direções:

- **usada e NÃO declarada** → o operador não consegue configurar o que roda
- **declarada e NÃO usada** → o operador configura o que não roda

A segunda é pior: a primeira só limita, a segunda **mente**.

🔴 **E foi a segunda que mordeu.** `AI_TASKS` declarava `ia4_avaliar`; o código
sempre rodou `ia4_avaliacao`. A tela de configuração itera `AI_TASKS` e grava
`ai.modelos[task.key]` — então o modelo que o operador escolhia para a IA4 ia
para uma chave que `resolveTaskModel` nunca consultava. **Escolha
silenciosamente descartada, na tela feita para escolher.** Latente hoje (nenhum
tenant tem override desde as migrations 227/229), mas viva. Corrigido nos dois
lugares: o catálogo e o mapa da tela.

**20 tarefas declaradas** que rodavam fora do catálogo — incluindo `sem14_check`
e `acumulada_check`, que constam de `DUAL_IA_PARES`. Declarar não troca nada (o
modelo efetivo segue vindo de `DEFAULT_TASK_MODELS`/`FALLBACK_GLOBAL`): só torna
a escolha **possível**. ⚠️ A tela de configuração ganha 20 linhas.

**Duas listas, ambas só encolhem:** 3 instrumentos (probe/canário — medem, não
são tarefas do produto) e 6 órfãs `temporada_*`, que estão na tela e **nada lê**.
Tirá-las é decisão de produto; ficam declaradas até alguém decidir.

⚠️ A primeira lista de instrumentos tinha 6, e 3 delas (`probe_cache_hist`,
`pdi_compare_0708`, `pdi_compare_4modelos`) só existem no **ledger**, de rodadas
passadas — o script sumiu do repo. Allowlist com entrada que não corresponde a
código nenhum é a mesma classe de guard sobre alvo morto.

### 27/08 — `pdi_check` rodou de verdade, e achou o que devia

Primeira geração real, no tenant de **demo** (ACME, resetado toda madrugada pelo
fixture — o artefato criado é transitório por construção). Três execuções, e as
duas primeiras acusaram **defeito do instrumento, não do PDI**:

**1ª — `String(d.feedback)` virou `"[object Object]"`.** `DadoComp.feedback` é
tipado como `string` e recebe o objeto que a IA4 devolve
(`{tom_base, resumo_geral, mensagem_positiva…}`); com `strict: false` no
tsconfig, ninguém acusa. O auditor recebia nível, nota e lixo, concluía
corretamente "afirmação sem lastro" para TUDO, e o veredito era `fail` por culpa
da evidência que EU montei.

**2ª — evidência certa nas competências, e sobraram achados sobre o DISC.**
Porque eu mandava só `dadosComps`, e o gerador também recebe o perfil
comportamental. O auditor estava certo de novo: aquilo, para ele, não tinha
lastro.

**3ª — a evidência passou a ser O PROMPT QUE O GERADOR RECEBEU.** Qualquer
reconstrução diverge da entrada real por construção, e toda divergência vira
falso positivo — que ensina a ignorar o veredito, o que é pior que não auditar.
Usando o `user` do gerador, auditor e gerador olham a mesma coisa por definição.

**E aí o achado real, na primeira execução limpa:**

> *"tem dificuldade genuína com pressão e improviso"* — a evidência traz os
> índices DISC, mas não relata dificuldade de Bruna com pressão ou improviso.

O PDI **infere dificuldades pessoais a partir do perfil DISC e as afirma como
fato** sobre a pessoa — num documento que vai para ela. Mais duas do mesmo tipo
("sentir desconforto quando precisa empurrar uma decisão", "você raramente
promete o que não pode cumprir") e um elogio comparativo sem base ("senso
crítico que muitos representantes demoram anos para desenvolver").

É exatamente a classe que o bloco C não tinha quem pegasse, e a régua do produto
já proíbe: *"Perfil CIS/DISC NÃO altera nota — influencia APENAS o tom"*. Aqui
ele não estava alterando a nota: estava virando **afirmação sobre a pessoa**.

⚠️ Isto é um achado sobre o PROMPT do PDI, e o conserto é dele — não do auditor.
Fica registrado; a decisão é de quem escreve o prompt.

### 27/08 — IA4 sem censura: o número que faltava desde 25/08

`scripts/_medir-ia4-sem-censura.ts`, 15 avaliações reais em Ibipeba, teto já em
64.000, **sem persistir** e com `source: 'medicao'`.

| | |
|---|---:|
| min · p50 | 7.175 · 10.675 |
| **p95** | **18.537** |
| max | 18.537 |
| acima dos 16.000 antigos | **2 de 15 (13%)** |
| no teto de 64.000 | 0 |
| custo | US$ 1,93 |

**Os 16.000 nunca foram o comportamento do modelo — eram a régua.** As duas
maiores (18.537 e 18.151) teriam sido cortadas no meio de um JSON de avaliação
de competência de uma pessoa real; a terceira (15.857) escapou por **143
tokens**. Os 13% batem com os 19,9% históricos.

A folga hoje é **64.000 ÷ 18.537 = 3,45×** — acima da régua de 3× e sem exagero:
a própria régua (`max(3× p95, 1,5× o máximo)`) sugeriria 56.000. O "erre para
cima" acertou, e agora por medida em vez de aposta.

**Três decisões de desenho que tornam o número confiável:**

- **Não persiste.** Reavaliar sobrescreveria a nota de gente real por um motivo
  de instrumentação. O núcleo é partido em MONTAR/CHAMAR/PERSISTIR de propósito;
  o script usa os dois primeiros e para.
- **`source: 'medicao'`**, fora da população que o auditor de tetos usa. Sem
  isso eu repetiria o erro que encontrei ontem, quando 10 chamadas de um piloto
  de Qwen inflaram o p95 do `ia3_cenarios` de 3.270 para 13.795.
- **O ledger é a fonte**, não o texto retornado: `output_tokens` e truncagem vêm
  da linha gravada.

⚠️ n=15 fecha "o teto antigo cortava" e "o novo não corta". Não fecha o p95 com
precisão — a cauda além de 18.537 continua não observada.

### 27/08 — `pdis` removida, e o `chat-simulador` ganhou orçamento

**Tabela `pdis` (mig 233).** Conferido antes de apagar: **0 linhas, nenhuma FK
(entrando ou saindo), nenhuma view, nenhuma policy**, único leitor era o próprio
escritor, e nenhum `.tsx` chamava `gerarPDIs`.

⚠️ **Mas a ordem importava.** `gerarPDIs`/`gerarPDIsDescritores` eram exports de
um arquivo `'use server'` — ou seja, **endpoints HTTP chamáveis** (gatados por
`ai.audit.regenerate`) mesmo sem botão nenhum. Apagar a tabela sem apagar o
código trocaria "gasta IA à toa" por "500 em produção". Código e DDL saíram no
mesmo commit.

O que a tabela guardava — `objetivos` derivados do relatório — é hoje o
Development Blueprint (`objetivos_30_dias`). Antecessor superado.

⚠️ E a migration ia ser a **232**, número que estava livre quando comecei; o
Rodrigo criou a 232 em paralelo no meio do trabalho. Renumerada para 233 — é
exatamente por isso que a régua manda conferir o maior N **no instante de criar
o arquivo**, não no início da rodada.

**Duas allowlists encolheram como consequência**, e é o tipo certo de encolher —
dívida que some porque o código saiu: `error-nao-checado` 974 → **968** sites (6
fingerprints de `fase4.ts`), e `ia-taskkey` 28 → **27** arquivos.

**`chat-simulador`.** Não declarava `maxDuration`, então herdava o default da
plataforma — e sem saber qual, "estamos perto do timeout?" não tinha resposta.
A medição decidiu: `sim_aluno` tem p95 de 13,5s mas **máximo de 94s em 2.570
chamadas**, e é o maior consumidor de chamadas da base. Um pico desses podia
estar sendo cortado sem ninguém saber. Declarado 300s (folga de 3,2× sobre o
pior caso) e envolvido em `comContexto`.

**A allowlist do guard de orçamento está VAZIA:** todas as 5 rotas que chamam IA
declaram contexto.

### 27/08 — modelo melhor × prompt melhor: o experimento que decidiu

Com o `pdi_check` de pé, "Opus 5 entrega PDI melhor que Sonnet 5?" deixou de ser
opinião. Experimento **pareado** (mesma pessoa nos dois braços, mesmo auditor,
mesma evidência, sem persistir, `source: 'experimento'`), 6 sujeitos em Ibipeba.

**Resultado: nenhuma direção.**

| | Sonnet 5 | Opus 5 |
|---|---:|---:|
| achados semânticos (6 sujeitos) | 39 | 38 |
| pareado | melhor em 2 | melhor em 3 · 1 empate |

⚠️ **E o piloto de 3 sujeitos tinha dito o contrário** — 2 de 2 a favor do Opus.
Na rodada completa, um desses pares **inverteu** (5×6 depois de ter sido 6×5),
com a mesma pessoa e os mesmos modelos. Isso mede a variância entre execuções:
**±1 achado, do mesmo tamanho do efeito procurado.** O script recusa concluir
abaixo de 5 pares discordantes justamente por isso — sem essa trava, eu teria
reportado "2 de 2 a favor do Opus" como sinal.

**Dois achados operacionais no caminho:**

- Uma chamada morreu em `APIUserAbortError`: o teto de tempo do wrapper são
  120s, e o **Opus 5 mede 101-103s** contra 58s do Sonnet em produção. Chamada
  que morre por relógio cria **viés de sobrevivência** — some a execução mais
  longa, que é a mais provável de ter mais achados. Os dois braços passaram a
  rodar com `timeoutMs: 300s`.
- `pdi_individual` **não passa `timeoutMs`**, então roda nos mesmos 120s. Hoje o
  p95 é 75s; subir para Opus 5 encostaria no teto.

### E então o prompt, que era a causa

Os **12 PDIs** deram veredito `fail`, nos dois modelos. Não é o gerador que
falha: é o pedido. O prompt já dizia, nos princípios inegociáveis:

> **#3** DISC/CIS deve aparecer como leitura contextual, **não como diagnóstico fechado**
> **#9** **Não invente** comportamento, resultado ou contexto que não esteja sustentado

E o schema, logo abaixo, exigia `"pontos_atencao": ["2-3 áreas de atenção do
perfil"]` a partir de `D=.. I=.. S=.. C=..`. 🔑 **Cota vence regra em prosa** — o
modelo tem de entregar o campo, então infere. E o que sai é a leitura de manual
de C/S alto: *"tem dificuldade genuína com pressão e improviso"*, sobre uma
pessoa, num documento que vai para ela.

**Correção:** cota `2-3` → `0 a 3, e VAZIO se o perfil não sustentar. NÃO
preencha por cota`; `descricao` deixou de pedir "como o seu perfil influencia o
seu desempenho" e passou a pedir tendência em forma de hipótese, com os padrões
proibidos nomeados; e o princípio **#10** — o perfil é hipótese, não observação,
e score DISC não é evidência de comportamento.

**Medido nos mesmos 6 sujeitos, mesmo modelo, mesmo auditor:**

| | antes | depois |
|---|---:|---:|
| achados semânticos | 39 | **22** |
| por sujeito | 7·5·6·6·9·6 | 3·4·3·2·5·5 |

**−44%, com 6 de 6 na mesma direção** (teste de sinal: p = 0,016). Quatro dos
seis caíram 3-4 achados, muito acima do ruído de ±1.

🔑 **A comparação que fecha o exercício:** o upgrade para Opus 5 moveu 39 → 38
(ruído) por **+US$ 24,85/mês**. A correção do prompt moveu 39 → 22 por **zero**.

⚠️ Melhorou, não resolveu: os 6 ainda dão `fail`, com 22 achados restantes que
não examinei. Modelo melhor não conserta prompt que pede a coisa errada — e
prompt corrigido não esgota o que o auditor tem a dizer.

## 29/08 — o ledger não cobria o TTS: 0 linha em 90 dias, e o custo era só aritmética

A pergunta que abriu a rodada era comercial ("vale trocar o TTS do Google por
Speechify?"), e ela morreu no primeiro passo: **não havia com que responder**.

```sql
select ... from ia_usage_log where model ilike '%tts%';   -- 0 linhas, 90 dias
```

Zero linha contra o que foi efetivamente gerado e **pago** no mesmo período:

| produção real (90 dias) | volume |
|---|---:|
| vídeos gerados (~4 min de narração cada) | 210 |
| podcasts / conteúdo final em áudio | 227 |
| personalizações nominais ("Olá, {nome}") | 1.136 |
| **linhas de TTS no ledger** | **0** |

O total do ledger no período era **US$ 380,09 em 17.047 chamadas**, e esse número
tinha cara de resposta completa. Não era: é o total do que passa por `callAI`.

### 🔑 A classe: instrumentação centralizada tem a fronteira do WRAPPER

O ledger nasceu dentro de `actions/ai-client.ts` — decisão correta, e o comentário
lá diz "cobertura por construção: o log vive AQUI, não nos call-sites". A cobertura
é por construção **para quem passa por ali**. `lib/gemini-tts.ts` fala HTTP direto
com o Gemini (é geração de áudio, não LLM de texto), então nunca esteve coberto.

O sintoma é traiçoeiro porque **a ausência se parece com um zero**: quem soma
`ia_usage_log` conclui que TTS não custa nada, em vez de concluir que TTS não é
medido. Mesma família do "não achei nada exige o denominador".

Corolário para a próxima instrumentação: **antes de somar um ledger, liste quem
ESCREVE nele.** Custo que não passa pelo wrapper não existe no ledger.

### O que passou a ser gravado

`lib/ia-ledger.ts` (novo) concentra o INSERT em `ia_usage_log`; `ai-client.ts` e
`lib/gemini-tts.ts` montam a linha e delegam. No TTS o registro vive em
`ttsGenerate`, ponto único por onde toda síntese passa — mesma decisão do wrapper.

Três detalhes que não são cosméticos:

1. **Tokens REAIS, não estimados.** O `usageMetadata` da resposta vinha sendo
   descartado. Sonda nos dois backends (29/08): `promptTokenCount` +
   `candidatesTokenCount`, com `candidatesTokensDetails[modality=AUDIO]`.
2. **`source` carrega o backend** (`tts:vertex` / `tts:aistudio`). `TTS_BACKEND` é
   *Sensitive* na Vercel: `env ls` mostra `Hidden` e `env pull` devolve
   `[SENSITIVE]`. Não existe leitura — o runtime é a única testemunha.
3. **Resposta 200 SEM áudio também grava** (`status = sem-audio:<motivo>`). Ela é
   cobrada no input e sumiria do custo. Não é hipotético: 13 vídeos morreram em
   `TTS: resposta sem áudio após 4 tentativas` até 18/08, pagos e invisíveis.

⚠️ **A armadilha do lookup exato.** `costFromTokens` faz busca EXATA no catálogo e
o id que a API cobra é `gemini-3.1-flash-tts-preview`, **com** o sufixo. Sem a
entrada nova em `lib/ia-cost-catalog.ts`, 100% das linhas novas nasceriam com
`cost_usd = null` — instrumentar o custo e não conseguir somá-lo.

### `Medido em produção` (29/08/2026, 18:43 Brasília)

Uma síntese real provocada pela rota de prewarm, no tenant de demonstração:

```
source=tts:vertex   feature=tts_podcast_pregerado   status=ok
model=gemini-3.1-flash-tts-preview
input=737 tok · output=5.940 tok de ÁUDIO · US$ 0,11954 · 94.286 ms
```

Duas coisas ficam decididas por esse registro:

- **Produção usa Vertex.** Era irrespondível por leitura de env.
- **A régua do catálogo estava certa:** ~US$ 0,12 por áudio de 4 min, contra
  US$ 0,1195 medido. A estimativa era boa; o que faltava era a medição.

Extrapolando o volume de 90 dias pela régua agora medida: **~US$ 52 por trimestre**
em TTS, contra US$ 380 de IA total. Não era o gargalo de custo, e segue não sendo.

### E a pergunta original (Speechify): NÃO, por enquanto

Preço de tabela do Speechify (ago/2026): US$ 10/mês com 1M de caracteres, overage
de US$ 10 a 6 por 1M. O volume atual (~0,5M chars/mês) cabe no plano de entrada.
**A economia potencial é da ordem de US$ 10/mês**, e o custo da troca não é o
plano: é perder a **direção de estilo em linguagem natural** (o vídeo passa um
`style` por tipo de cena, a devolutiva usa outro) e o **multi-speaker nativo**
(Mentor/Campo numa chamada só), além da calibragem de segmentação que foi ajustada
contra o comportamento do Gemini (pausa de 0,7s injetada em PCM porque o modelo
ignora `<break>`; `coalesceCurtos` porque fragmentos curtos fazem ele alucinar).

O que o Speechify vende de melhor é latência sub-300ms com streaming, para voice
agent ao vivo. O pipeline daqui é assíncrono (Trigger.dev, worker de render,
Whisper align depois): latência não é a métrica. E o `simba-3.2`, o modelo dessa
latência, **é só inglês** — pt-BR cai no `simba-multilingual`/`simba-3.0`.

`Suponho:` o único argumento que reabriria a decisão é **voz clonada** (zero-shot
self-serve), e aí é escolha de MARCA, não de custo. Lembrar que a voz feminina
está amarrada ao avatar HeyGen (Aoede desde 05/09/2026, escolhida com o avatar na mesa; antes Vindemiatrix no 3.1).

`Suponho (n=1):` a sonda deu ~25 tok/s de áudio no Vertex contra ~32 tok/s no AI
Studio para o MESMO texto. Se confirmar em volume, o Vertex é mais barato pelo
mesmo trabalho, não só menos limitado por cota. O ledger responde isso sozinho.

### Aberto

`ia_usage_log.runtime` saiu **`desconhecido`** na medição: a rota
`/api/internal/pregerar-podcast` não declara `comContexto`. Ela tem
`maxDuration = 300` e o podcast gastou 94s — **31% do orçamento** — mas o ledger
não sabe disso sozinho. Cobertura faltando, não chute (é o desenho de
`lib/execucao-contexto.ts`).

---

## 30/08 — o teto do caching é 19%, e o auto-cache por COMPRIMENTO paga write que ninguém lê

A rodada começou por um aviso da Anthropic no console: *"your prompt cache hit
rate is low — caching repeated content could save up to 22% of direct API
spend"*. A pergunta certa não é "como subir o hit rate", é **de que é feita a
conta** — e a resposta muda a decisão inteira.

### O denominador

`Medido:` 30 dias de `ia_usage_log`, `provider='anthropic'`, 4.892 chamadas,
**US$ 201,33**. Hit global **32,8%** (7,1M lidos do cache contra 12,3M frios).

| Componente | USD | % da conta |
|---|---:|---:|
| **Output** | **156,03** | **78%** |
| Input frio (não cacheado) | 41,86 | 21% |
| Cache write (1,25×) | 9,56 | 4,7% |
| Cache read (0,1×) | 2,57 | 1,3% |

**Cache só toca 21% da conta.** Se 100% do input frio virasse leitura a 0,1× —
impossível na prática — o corte seria ~US$ 37/mês, **18,7%**. Ou seja: os "22%"
do aviso são o **teto de cachear tudo o que é cacheável**, não uma expectativa. O
ganho realista desta rodada é de US$ 8 a 15/mês.

🔑 **A regra que sobrevive:** antes de investir em caching, decomponha a conta em
output / input frio / write / read. Onde output domina (aqui, 78%), as alavancas
são `reasoningEffort`, prompt que pede menos texto e **Batch — que hoje leva só
US$ 15 dos 201** (7%). Otimizar o cache com output dominando é polir 21% do
problema.

### Achado 1 · write órfão: o auto-cache lê COMPRIMENTO como ESTABILIDADE

A régua era `system.length > 4000 → cache_control`. Nos geradores de conteúdo ela
é falsa por construção: o system passa dos 4.000 chars **justamente porque foi
enriquecido** com módulo-base + kit (`actions/conteudos.ts:156-188`), que são
únicos por (competência × descritor × cargo × módulo × kit). O prefixo nunca
repete, e cada chamada paga o write de um cache que ninguém lê.

| Feature | Escritos | Lidos |
|---|---:|---:|
| `conteudo_texto` | 282.120 | **0** |
| `conteudo_podcast` | 276.536 | **0** |
| `conteudo_case` | 275.633 | 2.845 |
| `conteudo_video` | 234.545 | 75.366 |

O gate da S3 pedia **write-sem-leitura < 10%**; nessas três estava em ~100%, e
ninguém tinha olhado porque a métrica agregada (32,8% de hit) parecia saudável.
Write custa 1,25×: cachear prefixo que não repete é **pior** que não cachear.

Correção: `options.cacheSystem` em `actions/ai-client.ts`, honrado nos três
caminhos — síncrono, chat e **lote** (`lib/ai-batch.ts`). O lote não é detalhe: é
o caminho DEFAULT da geração de conteúdo, e opção honrada só no síncrono seria
consertar o gêmeo que não roda (§F-I14).

⚠️ **O opt-out é por feature, com o ledger na mão.** No MESMO call-site, o vídeo
LÊ (75.366 contra 234.545): desligar lá custaria mais do que economiza. Ficou de
fora explicitamente.

### Achado 2 · o lever caro existia e não tinha consumidor

`cena_turno` sozinha respondia por **34% de todo o input frio** (2,9M tokens,
US$ 14,07): o histórico da conversa era reenviado inteiro a cada turno, com gap
mediano de **25 s** entre turnos (bem dentro do TTL de 5 min). O mecanismo
(`options.cacheHistory`) existia no wrapper desde o piloto de history caching,
validado por probe — e o **único caller que o ligava era o tira-dúvidas**, que
custa US$ 0,13 em 30 dias.

Ligar na cena não muda o prompt: a relocação que mexeria no texto é a do
`userSuffix`, e a cena usa `systemSuffix`. O efeito é só o 2º breakpoint na
última mensagem do interlocutor. Mesma família do "config declarada não é config
aplicada" — ao achar um lever caro, a pergunta seguinte é **quem o consome**.

### O que ficou de fora, e por quê

| Feature | Input frio | Por que não mexi |
|---|---:|---|
| `modulo_base_autor` | US$ 2,53 | gap mediano **0 s** (disparo paralelo): nenhuma chamada acha o cache da outra. Só priming resolve, e custa uma rodada de latência para ~US$ 2/mês |
| `cena_extracao` | US$ 2,76 | gap mediano 267 s, perto do TTL de 5 min. Exigiria `ttl: '1h'` (write a 2×), decisão que precisa de medição própria |
| `blueprint_audit`, `kit_desafio_semana` | US$ 3,21 | zero cache hoje; system abaixo do mínimo cacheável |
| `untagged` | US$ 2,57 | 439 chamadas sem `taskKey` — não dá para decidir sem saber quem é |

### Guarda

`tests/unit/integrations/ai-cache-breakpoints.test.ts` (9 asserções) e
`tests/unit/cena-cache-historico.test.ts` (2). Toda asserção de ausência vem
pareada com o caso positivo — `toBeUndefined()` fica verde quando o caminho nem
foi percorrido. Validado por **mutação (4 mutações, 4 vermelhos)**: wrapper
ignorando a opção, cena sem a flag, lote ignorando o request do batch e call-site
sem repassar.

### Aberto

`Suponho:` o ledger cobre quem passa pelo wrapper (§29/08), então se a fatura da
Anthropic for materialmente maior que US$ 201/mês há consumo fora dele. **Não
medido:** `C:\GAS\Simulador` (copiloto PACE) chama a Claude direto em
`src/lib/ai-call.js` **sem nenhum `cache_control`** e sem gravar no ledger.

**Não medido ainda:** o efeito das duas correções. A verificação é comparar, daqui
a alguns dias, `frio` caindo e `lido` subindo em `cena_turno`, e `escrito` perto
de zero nos três `conteudo_*`.

## 01/09/2026 — relatório semanal de custo por tenant, por e-mail

Pedido do dono: um relatório com o custo de IA detalhado **por empresa/tenant**,
fechando na segunda às 04:00 de Brasília e enviado por e-mail na sequência.

**O que roda.** `lib/custo-ia/relatorio-semanal.ts` (coleta e agregação) +
`lib/custo-ia/email.ts` (o HTML, puro) + case `custo_ia_semanal` em
`app/api/cron/route.ts`, agendado como `0 7 * * 1` — 07:00 UTC = **04:00 BRT**.
A janela é a semana FECHADA em Brasília: `[segunda anterior 00:00, segunda
00:00)`, fim exclusivo. Fora do cron: `scripts/_custo-ia-semanal.ts`, dry-run por
padrão, com `--agora=ISO` para reprocessar uma semana passada.

**Por que uma função no banco (mig 238).** O PostgREST não faz `GROUP BY`, e a
alternativa era trazer as linhas cruas e somar em JS. Medido na semana 24–30/08:
**7.198 linhas brutas para 108 grupos** — paginar o teto de 1.000 em 8
requisições, com o modo de falha de esquecer a paginação sendo um relatório que
soma 1.000 linhas e se apresenta como a semana inteira. Conta parcial com cara de
conta fechada. `custo_ia_agregado(ini, fim)` devolve os 108 grupos e só
`service_role` a executa.

**Três coisas que o formato existe para não deixar concluir:**

1. **A fatia sem `empresa_id` não é descartada.** Medido em 30 dias: 3.988 das
   10.525 linhas (38%) não têm empresa, e valem **US$ 102,41 de US$ 291,40 (35%
   do dinheiro)** — autoria de conteúdo, evals, copiloto, simulador. Um "por
   empresa" que filtrasse nulo mostraria dois terços da conta com cara de conta
   inteira. Vai como bloco "Plataforma Vertho", somando no total.
2. **A nota de cobertura é fixa.** Vale a regra do §29/08: somar o ledger sem
   dizer quem escreve nele é confundir "não custou" com "não medimos". Hoje
   escrevem três: o wrapper, o TTS (desde 30/08) e o Batch.
3. **O aviso de mudança de INSTRUMENTO.** O TTS entrou no ledger em 30/08, então
   a comparação semana-a-semana que cruzar essa data mostra o áudio "aparecendo"
   sem que o gasto tenha mudado. `avisoInstrumento()` diz isso no e-mail
   enquanto a janela comparada tocar a virada, e se cala sozinho depois.

**O tamanho era um modo de falha silencioso.** A primeira versão do HTML era toda
inline, do jeito clássico de e-mail: **91 KB, dos quais 70 KB eram atributos
`style=`** repetidos em 420 células. O Gmail corta em ~102 KB e mostra "[Mensagem
truncada]" — a semana com mais tenants perderia a metade de baixo da tabela sem
erro nenhum. Com classes em `<style>`, o mesmo conteúdo cabe em **31 KB**; o que
varia por linha (a cor da variação) continua inline, porque ali a cor é
informação.

**Primeira execução (24–30/08, enviada 01/09).** US$ 106,86 · 7.198 chamadas ·
10 tenants + plataforma. Ibipeba **58,2%** (US$ 62,20, com `cena_turno` e
`cena_extracao` valendo 62% do gasto dela), plataforma **30,7%**, Macaé 7,4%; os
outros 7 somam menos de US$ 3. A conta foi conferida contra uma query SQL
independente antes de virar e-mail — os dois caminhos batem linha a linha.

⚠️ **A variação semanal aqui é volátil por natureza**, e ler `+314%` como
tendência é erro: o gasto é dominado por rajadas de autoria, não por uso
recorrente. As 8 semanas anteriores foram 91, 10, 26, 3, 119, 26, **106** e 36
(parcial) — a semana anterior à do relatório foi uma das mais baratas do
período. O número que sustenta decisão é a série, não o Δ de um par.

**Destinatários:** `CUSTO_IA_REPORT_EMAILS`, default `rodrigo@vertho.ai` no
código. **`ADMIN_EMAILS` não entra como fallback** — aquela env é fallback de
autorização de platform-admin, e usá-la para "receber relatório" promoveria quem
só devia ler um número. Mesma razão que criou `HEALTH_ALERT_EMAILS`.

**Cobertura:** `tests/unit/custo-ia-semanal.test.ts` (22 asserções). As que
importam: a janela em BRT com as duas bordas (domingo 23:59:59 dentro, segunda
00:00 fora), a fatia de plataforma entrando no total, o corte da cauda devolvendo
o resto somado, e base zero não virando divisão por zero.
## 01/09/2026 — as três telas de custo viraram duas, e o catálogo passou a ler a jornada

Havia **três** entradas de menu para o mesmo assunto: `Custos de IA`
(`/admin/vertho/simulador-custo`, viva, derivada de `lib/ia-cost-catalog.ts` +
ledger), `Plano de custo IA` (`/admin/vertho/custo-ia`, um HTML **estático** de
67 KB congelado em 12/08) e `Orçamento` (`/admin/vertho/orcamento`, comercial em
BRL). A terceira não é redundante — vende, não mede. A segunda era.

**O que a tela estática ensinava de errado**, medido contra o código em 01/09:

- Listava **três** jornadas (Piloto, Onboarding, Mentor DUO). O modo `jornada`,
  criado em 05/08 e hoje o formato do produto, **nunca apareceu** — a tabela era
  digitada à mão a cada revisão e o produto já tinha cinco modos.
- Afirmava `$3,07/colab`, com preços "jul/2026" e um plano de sprints que este
  doc já contava melhor e mais atualizado (as entradas de 29/08, 30/08 e 01/09
  nunca chegaram ao espelho). Doc velho ensina o errado, e este era um espelho
  que só espelhava para trás.

**O que só ela tinha foi para a tela viva**, calculado em vez de digitado:
custo por jornada (`custoColabNaJornada`) e infra fixa da plataforma
(`INFRA_FIXA`). O resto já vivia aqui.

### O `exec` do catálogo descrevia um desenho que não existe mais

Cada chamada `scaleType: 'colab'` agora declara `escala`: de que DIMENSÃO do
programa o número de execuções depende (semanas de conteúdo, missões,
competências, fechamento). As dimensões saem de `programa-config.ts` — a mesma
constante que a engine usa para montar a trilha —, então mudar um modo lá move o
custo sem ninguém reeditar número nenhum.

Ao decompor, duas premissas antigas caíram:

| chamada | `exec` no catálogo | pela config do DUO |
|---|---|---|
| `evidencias-socratic` | 72 (6 × **12** semanas) | 54 (6 × **9** `slotsConteudo`) |
| `tira-duvidas` | 36 | 27 |
| `evidencias-extracao` / `desafio` | 12 | 9 |
| `ia4-avaliacao` / `ia4-check` | **5** (5 cenários A) | **2** (1 por competência) |

As 12 semanas de conteúdo são de quando não havia semana de missão nem
fechamento em duas semanas; o DUO real tem 9 slots. E os 5 cenários A viraram 1
por competência: `Medido:` em 01/09, o modo `jornada` fecha em **1,44 respostas
por colaborador** (45 pessoas, tabela `respostas`), e a moda geral é 2 — as duas
competências do DUO. O `exec` continua no arquivo, sem alteração, para não mudar
em silêncio o que as telas mostravam; `execNaJornada` é a régua nova, e a
divergência entre as duas é visível de propósito.

Custo por colaborador com o preset padrão, pela régua nova:

| jornada | USD/colab | piso (sem BETO/PDI) |
|---|---|---|
| Jornada (7 sem · 1 comp) | 1,34 | 1,11 |
| Regular DUO (14 sem · 2 comp) | 2,59 | 2,35 |
| Regular single (14 sem · 1 comp) | 2,54 | 2,31 |
| Onboarding (10 sem · 5 comp) | 1,96 | 1,72 |
| Piloto | 0,77 | 0,53 |

O orçamento comercial passou a ter **seletor de jornada**: até aqui ele somava o
`exec` fixo para qualquer proposta, então uma jornada de 7 semanas entrava na
conta pelo custo de 14 com 2 competências — quase o dobro.

### A cobertura do catálogo, medida em dinheiro

O catálogo de custo e o registro de tarefas (`lib/ai-tasks.ts`) descreviam o
mesmo universo com chaves diferentes (`ia4-avaliacao` × `ia4_avaliacao`), então o
painel "real medido" nunca conseguiu confrontar linha a linha com a estimativa.
Cada item de custo agora carrega `taskKey`, e a tela cruza as duas pontas por
chamada.

O denominador que isso revelou, em 01/09: **66 tarefas declaradas, 18 com
estimativa de custo**. As 48 sem estimativa incluem o que mais gastou no
período — Modo Cena (7 features, US$ 47,7 em quatro dias de agosto), Blueprint
(US$ 34,2), Copiloto PACE (US$ 21,2), Kit, Arguição, PDI check. A tela mostra
isso como **percentual do gasto da janela**, não como contagem de tarefas: 40
tarefas sem estimativa que não rodaram custam zero, e uma que rodou muito custa
a conta.

Duas leituras da mesma janela (120 dias, US$ 418,07 em 17.889 chamadas):

- `untagged` caiu de **77% (julho) para 1–5% (agosto)** — o trabalho de 07-11/08
  funcionou. Quem olhar a janela de 90 dias ainda vê 26%, que é herança.
- As 1.126 chamadas com `cost_usd` nulo são **todas** de 13 a 20/07: modelos que
  entraram no catálogo depois. Desde 21/07 a cobertura de preço é 100%.

## 02/09/2026 — o relatório separa OPERAÇÃO de P&D

Pedido do dono depois de ver a primeira edição: a Ibipeba aparecia com **58,2%**
da semana, mas 62% do que estava no nome dela era o Modo Cena — experimento
nosso, usando os dados dela, sem nenhuma entrega para o cliente. Um número assim
não serve para precificar nem para conversar com o cliente.

**O efeito na mesma semana (24–30/08), sem mudar um centavo do total:**

| | antes | depois |
|---|---|---|
| Ibipeba | US$ 62,20 (58,2%) | **US$ 8,98** de operação |
| Plataforma | US$ 32,80 | US$ 23,45 — e vira o **maior item de operação** (52,9%) |
| P&D | não existia | **US$ 62,57 (58,6% da semana)** |

### A régua tem duas portas (`lib/custo-ia/classificacao.ts`)

**1. O `source`, que é declarado no call-site.** Esta porta não foi inventada
aqui: `lib/season-engine/simulador-core.ts` já marcava `source='simulator'` para
"isolar a rodada de medição do tráfego real", e chama o custo do aluno simulado
de **netável**. É a porta forte, porque carrega INTENÇÃO — o mesmo `ia3_check` é
operação quando o admin gera e é medição quando entra num braço de comparação.

**2. A feature**, para o que roda sob o `source` default (`wrapper`) — foi sob
ele que rodaram os US$ 47,74 do Modo Cena. Aqui a afirmação é "este motor não
tem consumidor de produção", e ela é conferida contra o código por
`tests/unit/security/custo-ia-pd-guard.test.ts`: o teste sobe o grafo de imports
e falha se `lib/season-engine/cena/` passar a ser importado por rota, action ou
task. **Validado por mutação** — um import da cena numa action derruba o guard e
a mensagem nomeia o consumidor. Sem isso, a lista seria a classificação que
envelhece calada, e o modo de falha é o pior possível: uma frente que entra em
produção continua fora do custo do tenant, para sempre, sem sintoma.

### Três erros que a medição pegou no caminho

**⚠️ `like 'cena_%'` casa `cenarios_b`.** Em SQL o `_` é curinga de um
caractere, então o padrão pegou `cenarios_b` e `cenarios_b_check`, que são o
fechamento da trilha — operação pura. Inflou o P&D em US$ 2,78 antes de eu
conferir feature a feature. A régua é lista explícita por isso.

**⚠️ Contar menção não é medir alcance.** A primeira versão do meu classificador
procurava a string da taskKey no código e subia os imports. Só que
`lib/ai-tasks.ts` é um CATÁLOGO que lista todas as taskKeys e é importado pelas
telas de admin: toda feature declarada lá virava "operação" sem nenhum caminho de
execução. O instrumento respondia "está no catálogo?", não "é alcançável?".

**⚠️ Declaração vence heurística.** A primeira `frenteDePD` testava prefixo
(`feature.startsWith('ia3_')`) antes do `source`, e um `ia3_check` disparado de
dentro do simulador virava "Medição da IA3" em vez de "Simulador de trilha" — o
gasto aparecia sob o assunto em vez de sob quem o causou. Hoje não há prefixo
nenhum: o que não está nos mapas cai em "Outras medições", lacuna visível em vez
de rótulo inventado.

### O que a separação revelou

`Medido:` 30 dias — operação **78,5%** (US$ 231,84), P&D **21,5%** (US$ 63,63).
Na semana de 24–30/08 a proporção inverte (58,6% de P&D), porque foi a semana da
bateria de cenas: 3.760 chamadas em 4 dias, tudo em `claude-opus-5`, num tenant
só. Não é tendência, é rajada.

🔑 E o item mais caro da OPERAÇÃO não é cliente nenhum: é a plataforma, com
52,9% da semana. Autoria de conteúdo, copiloto e o pipeline de IA que roda sem
`empresa_id`. Parte disso deve encolher com a correção de 01/09 que fez
`ia3_cenarios` e `ia2_gabarito` passarem `empresaId`.

## 07/09/2026 — TTS no 2.5 Flash: o que mudou no custo por episódio e por vídeo

A troca de motor (05/09, `gemini-3.1-flash-tts-preview` → `gemini-2.5-flash-tts`, ver
`PLANO-DERIVA-PODCAST-2026-09-04.md`) cortou o preço por token de áudio pela metade:
**US$ 0,0202 → 0,0101 por mil tokens de saída**, medido em 116 chamadas do ledger
(`scripts/_custo-tts-antes-depois.ts`). O que cada caminho paga depende de quantos
TAKES ele faz: o portão de deriva refaz a síntese quando a régua reprova, e, onde a
pessoa está esperando, refaz em PARALELO (2 takes sempre) para caber nos 300 s da rota.

| caminho | antes (3.1) | agora (2.5) | variação |
|---|---:|---:|---:|
| podcast personalizado pré-aquecido em lote (fundo, 1 take + ~7 % de retake) | US$ 0,12 | **US$ 0,06** | −50 % |
| podcast personalizado sob demanda (2 takes em paralelo) | US$ 0,13 (mediana de 14 episódios) | **US$ 0,11** (4 chamadas de 0,050-0,059 em 06/09) | −15 % |
| podcast base (botão do admin, 2 takes) | US$ 0,195 | ≈ US$ 0,10 (esperado; nenhum gerado desde a troca) | −50 % |
| devolutiva sob demanda ("Ouvir", 2 takes) | US$ 0,11-0,14 (fatiada em 6-8 chamadas) | **US$ 0,11** (2 × 0,055 em 06/09) | ≈ igual |
| devolutiva em fundo (1 take + ~21 % de retake do Iapetus) | US$ 0,11 | **US$ 0,07** | −40 % |
| vídeo: TTS (take único; era 14-21 chamadas por cena) | US$ 0,10-0,13 | **US$ 0,05** se aprova de primeira (3 de 5), 0,09 se refaz | ~−40 % |
| vídeo: total (HeyGen 0,47 + Whisper e box 0,04 + TTS) | ≈ US$ 0,62 | **≈ US$ 0,56-0,60** | −8 % |

Leitura: a redução real está no lote (pré-aquecimento, devolutiva em fundo), que é onde
mora o volume. Sob demanda o retake em paralelo compra a latência de uma tentativa só e
paga o segundo take sempre; ficou perto do custo antigo, com o portão de qualidade
incluído. Voltar o sob demanda para retake em série (US$ 0,06) é uma linha por caminho
(`retakeParalelo: false`), ao preço de mais 100-150 s de espera nos ~7 % de reprovação.
No vídeo o TTS caiu pela metade, mas era menos de 20 % da conta: o HeyGen domina.

O catálogo (`lib/ia-cost-catalog.ts`) foi atualizado com esses números e ganhou os itens
que rodavam "sem estimativa" no simulador: `tts_podcast_personalizado`,
`tts_podcast_pregerado` (opcional) e `tts_devolutiva`. O canário semanal (`canario_tts`,
~US$ 0,20/semana) segue fora do catálogo de propósito: é custo de plataforma, não de tenant.

## 07/09/2026 — demo e plataforma saem da operação, e sobram 2 clientes

Decisão do dono depois do primeiro relatório automático: **os tenants ACME e o
trabalho sem `empresa_id` não são operação.** A pergunta que o bloco por empresa
responde é "quanto custa atender este cliente", e ambiente de demonstração não é
cliente.

**Efeito na semana 31/08–06/09, sem mudar o total de US$ 75,26:**

| | antes | depois |
|---|---|---|
| Operação | US$ 69,12 (6 "clientes") | **US$ 23,78 — 2 clientes** |
| P&D e interno | US$ 6,14 | **US$ 51,48** |
| Plataforma | 55,7% da operação | frente própria, US$ 38,51 |

A terceira porta da régua (`lib/custo-ia/classificacao.ts`) tem duas fontes,
porque uma só não cobria:

- **`empresas.is_demo`**, do banco — a mesma coluna que o guardrail de envio já
  usa, então um demo novo entra na conta sem editar lista nenhuma.
- **`SLUGS_NAO_CLIENTE`**, no código, para o que `is_demo` não alcança.
  ⚠️ Medido: dos três tenants com "ACME" no nome, **`acme` tem `is_demo = false`**
  (só `acme-demo` e `escolas-acme` estão marcados). Uma régua que fosse apenas a
  coluna deixaria o ACME original contado como cliente pagante.

### A ressalva que vai no próprio e-mail

O custo de operação por cliente hoje é um **piso**. Dentro da fatia sem tenant
havia, nessa semana, cerca de **US$ 11 de ENTREGA** — `conteudo_layout_plan`
(US$ 4,30), `ia3_cenarios` (US$ 3,66), `modulo_base_auditor`, `ia2_gabarito`,
`cenarios_b_check`, `temporada_extracao` — que só está sem dono porque o
call-site não passou `empresaId`. Enquanto isso não for corrigido na origem, o
custo real de operar Macaé e Ibipeba é maior do que o relatório mostra, e o
e-mail diz isso na nota de cobertura em vez de deixar o número parecer completo.
O conserto é no ponto que dispara a chamada — o dono fechou dois desses em 01/09
(`ia3_cenarios` e `ia2_gabarito` passaram a etiquetar).

`Medido:` com a régua nova, 30 dias dão operação 78,5% / P&D 21,5%; a semana de
31/08–06/09 dá 31,6% / 68,4%. A proporção oscila muito porque autoria e
experimento vêm em rajada — a série sustenta decisão, o Δ de um par não.

## 07/09/2026 — os call-sites passam a dizer de quem é o custo

Consequência direta da separação operação × P&D: o custo por cliente era um
piso, porque chamada sem `empresaId` não some do total — ela **migra** para "sem
tenant". O cliente aparece mais barato do que é, e nada acusa: não há erro, não
há linha faltando, só um número menor.

**Medido antes de corrigir (30 dias):** US$ 45 em 13 call-sites. O campeão foi
`conteudo_layout_plan`, com **435 de 435 chamadas órfãs (US$ 11,47)**. Em quase
todos, o `empresaId` estava no escopo — em vários, usado na LINHA DE CIMA para
escolher o modelo com `getModelForTask(empresaId, ...)`. Não faltava informação;
faltava alguém conferindo.

| feature | órfão (30d) | onde estava |
|---|---|---|
| `ia4_check` | US$ 13,83 (68%) | `lib/check-ia4-core.ts` — 2 ramos |
| `conteudo_layout_plan` | US$ 11,47 (100%) | `lib/conteudo-layout-plan.ts` + 3 chamadores |
| `conteudo_video` | US$ 7,10 (100%) | `lib/video/gerar-roteiro.ts` — batch E síncrono |
| `blueprint_audit` | US$ 6,01 (100%) | `lib/blueprint/core.ts` |
| `modulo_base_autor` | US$ 4,46 (22%) | 7 call-sites |
| `modulo_base_auditor` | US$ 3,81 (100%) | `lib/modulo-base-auditor.ts` |
| `beto` | US$ 2,07 (100%) | `app/actions/beto.ts` |
| `temporada_extracao` | US$ 1,67 (98%) | rota de reflexão |

### Três padrões, e o que cada um ensina

**1. O gêmeo que etiqueta e o que não etiqueta.** `modulo_base_autor` no MESMO
dia (04/09): pelo caminho BATCH saiu com dono (91 chamadas, Macaé); pelo
síncrono, sem (25 chamadas). Idem `temporada_extracao`: a rota de *evaluation*
sempre passou `empresaId`, a de *reflection* nunca. Mesma feature, dois
caminhos, um só instrumentado — a família do "conserte o que RODA" do CLAUDE.md.

**2. Derivar em vez de propagar, quando o dado já está no objeto.** O auditor de
módulo-base tem 7 chamadores; em vez de sete parâmetros novos, o `empresaId` sai
da COMPETÊNCIA que a função já carrega (`comp.empresa_id`). Módulo ligado a
competência de empresa é custo dela; módulo canônico é acervo da plataforma, e
`null` ali é a resposta certa. Um call-site novo não tem como esquecer.

**3. Opcional é o que permite esquecer.** `planLayout` passou a exigir
`empresaId` no objeto de opções — aceita `null`, mas quem chama tem que dizer
qual é o caso. O typecheck pegou na hora os 4 call-sites de teste.

### O guard

`tests/unit/security/ledger-empresa-id-guard.test.ts` +
`config/ledger-sem-empresa-allowlist.json` (16 entradas, cada uma com motivo).
Varre `callAI`/`callAIChat` com `taskKey`, cobra `empresaId`, e a allowlist **só
encolhe**. **Validado por mutação nos dois sentidos**: tirar um `empresaId`
corrigido derruba o guard; deixar na allowlist uma entrada já resolvida também.

⚠️ Ele é textual, não semântico: vê se `empresaId` aparece nas opções, não se o
VALOR é o tenant certo — mesma limitação declarada dos guards de tenant.

**O que fica de fora por decisão, não por dívida:** `copiloto_*` (a conversa é
sobre um PROSPECT, que não é tenant), `chat_simulador` (já sai como P&D pelo
source) e `pulse_*` (bloco off-line desde 31/08). O resto da allowlist é dívida
com 0 linha no ledger em 30 dias — corrigir código que não roda seria trabalhar
em alvo morto.

### Um instrumento meu mentiu no caminho

O primeiro auditor que escrevi acusou 41 call-sites. O regex de `empresaId`
exigia `:` ou `,` depois do nome e **não reconhecia o shorthand** `{ ..., empresaId }`
— então `ia3_cenarios`, que o dono já tinha corrigido em 01/09, aparecia como
órfão. O número real era 25. Vale a régua de sempre: antes de agir sobre a saída
de um instrumento novo, confira um caso que você sabe a resposta.

## 09/09/2026 — o ruído do extrator: estável na NOTA, instável no NÍVEL

O painel de evolução compara a nota do mapeamento (T0) com a nota que o extrator
de conversa emite na semana de aplicação (T1) e carimba um veredito nos cortes de
**0,20** (parcial) e **0,50** (confirmada) de `lib/season-engine/convergencia.ts`.
Nada disso se sustenta sem saber quanto a **mesma conversa** varia quando é
repontuada — se repontuar já move meio ponto, o veredito é sorteio e o relatório
que o gestor lê descreve ruído como se fosse a pessoa.

**Como foi medido.** 11 conversas reais de Ibipeba (semana 4, aplicação; 10 em
`missao_feedback` e 1 em `analytic`), 57 pares conversa × descritor, repontuadas
**K=5** vezes com o prompt, o modelo (`DEFAULT_MODEL` = `claude-sonnet-4-6`, que é
o que a rota usa ao passar `aiConfig` vazio) e o validador **de produção** —
importados de `lib/season-engine/prompts/extrator-conversa.ts`, extraído da rota
nesta rodada justamente para que a medição não rodasse sobre uma cópia. A
identidade byte a byte do prompt contra o HEAD anterior é provada por
`scripts/_provar-extrator-identico.ts` (system 1.344 chars, user 2.198/2.201 nos
dois modos). 55 chamadas, 509 s, ~US$ 1,70, sem etiqueta de tenant (é P&D).
Script: `scripts/_medir-ruido-extrator.ts` (`--de-json` reanalisa o bruto sem
repagar a IA).

### O instrumento é estável na nota

| Medida | Por descritor | Pela média da conversa |
|---|---|---|
| desvio-padrão médio | **0,09** | **0,07** |
| amplitude média | 0,20 | 0,16 |
| amplitude máxima | 0,70 | **0,33** |
| pares com as 5 notas idênticas | 25/57 (44%) | — |

E não há deriva contra a rodada que está gravada em produção: viés **−0,04**,
diferença absoluta média **0,08**. O extrator de hoje é o mesmo de quando aquelas
conversas foram avaliadas.

**O que isso diz sobre os dois cortes** (a média por conversa é o que o relatório
agrega antes de comparar com o T0, então é o número que decide o veredito):

- **`CORTE_CONFIRMADA` = 0,50 está fora do ruído.** O maior salto que o ruído
  produziu sozinho foi 0,33, e "confirmada" ainda exige qualitativa positiva e
  alcançar N3. Um veredito de evolução confirmada não sai de ruído.
- 🔴 **`CORTE_PARCIAL` = 0,20 está DENTRO do ruído.** Ruído médio 0,16 e máximo
  0,33 na mesma conversa. Um delta entre 0,20 e 0,33 é indistinguível de
  repontuação, e é exatamente a faixa que hoje produz "evolução parcial".

### 🔴 Mas o NÍVEL exibido troca em 32% dos casos

**18 dos 57 pares (32%) mudam de nível entre as 5 rodadas** — e 10 dos 57 têm
nível diferente do que está gravado. A causa não é dispersão: é que o modelo emite
notas **quantizadas** e **34% delas caem exatamente sobre uma fronteira de nível**.

| Nota | % das 285 repontuações |
|---|---|
| 1,5 | 24,6% |
| 2,0 | **17,9%** ← fronteira N1/N2 |
| 2,5 | 26,7% |
| 3,0 | **15,8%** ← fronteira N2/N3 |
| outras (1,8 · 2,2 · 2,3 · 2,8 · 2,9 · 3,2 · 3,5) | 15,0% |

Com a nota em 2,00, **0,01 para baixo** já troca N2 por N1 (`nivelDaNota` usa
`Math.floor`): `gravada 2,0 (N2) → média 1,96 (N1)`. O nível é a leitura mais
frágil do relatório e é justamente a que vira texto na tela do gestor e no PDF
("N2 → N3"), enquanto a nota, que é estável, fica escondida.

### O que fica em aberto (decisão do dono, não mudei nenhuma régua)

1. **Elevar `CORTE_PARCIAL`** para acima do ruído medido (0,33+), ou manter 0,20
   aceitando que a faixa baixa de "parcial" é estatisticamente muda.
2. **Como exibir nível de descritor individual.** Três saídas: não exibir nível
   por descritor (só por competência, onde a média tem ruído de 0,07); exibir com
   faixa ("N2, no limite"); ou deslocar a fronteira para fora do valor modal
   (2,00 e 3,00 são os dois valores que o modelo mais emite).
3. **Pedir ao extrator uma nota menos quantizada** não resolve: a quantização vem
   do prompt pedir `1.0-4.0` e o modelo ancorar em meios-pontos. Mudar isso é
   mexer no instrumento, e aí a medição tem que ser refeita.

⚠️ Denominador: isto mede **Ibipeba, semana 4, 11 conversas**. É o único material
real de semana de aplicação com transcrição gravada na base — não há um segundo
tenant para replicar, e `acme` tem 1 conversa de semana 3. A conclusão vale para
o instrumento, não para "todos os tenants".

## 11/09/2026 — Haiku sai do ator sintético; Gemini 3.8 passa no canário

O Haiku 4.5 continuava hardcoded no único papel ativo que ainda o usava:
`sim_aluno`, o colaborador fictício do simulador de temporada. O Tira-Dúvidas,
apesar de quatro documentos dizerem Haiku, já rodava em Sonnet 4.6. No ledger de
90 dias, Haiku somava **1.940 chamadas / US$ 2,27 / 0,46%** do custo total; só
`sim_aluno` ainda corresponde ao runtime atual (1.661 chamadas / US$ 1,93). As
demais linhas eram experimentos já retirados do Modo Cena.

**Canário A/B cego:** quatro contextos representativos, um por trajetória
(`evolucao_confirmada`, `evolucao_parcial`, `estagnacao`, `regressao`), mesmos
prompts e posições A/B alternadas. GPT 5.6 Terra julgou fidelidade ao perfil,
realismo, coerência e contrato, sem receber o nome dos modelos.

Na primeira rodada, Gemini 3.8 ficou em **8,88**, contra **8,13** do Haiku, mas
os DOIS candidatos falharam no perfil de regressão na semana 13: narraram melhora
quando deveriam mostrar perda de fôlego. Era defeito do prompt, não critério para
escolher modelo. A instrução de regressão passou a explicitar a curva por semanas
e a proibir evolução consolidada no fim.

Na repetição após a correção:

| Modelo | Média | Veredito por caso | Violação grave |
|---|---:|---|---:|
| **Gemini 3.8 Flash (`low`)** | **9,25** | 3 vitórias + 1 empate | 0 |
| Claude Haiku 4.5 | 8,88 | 0 vitórias + 1 empate | 0 |

**Decisão:** `sim_aluno` vira task pinned em `gemini-3.8-flash`, com effort
`low` explícito e fallback central temporário em `gemini-3.7-flash`. O modelo é
resolvido por `getModelForTask`, então runtime e tela de configuração deixam de
divergir; override explícito por task preserva rollback. Haiku permanece no
catálogo apenas para precificar o histórico.

## 12/09/2026 — a conta decomposta, e o `effort` que a IA4 nunca passou

Rodada disparada pelo artigo da Anthropic sobre redução de custo. A primeira
pergunta foi qual das técnicas dele vale aqui, e a resposta só sai da
decomposição da conta — não da lista de técnicas.

**`Medido:` 30 dias de `ia_usage_log`: US$ 333,03.** Anthropic US$ 236,49 (71%),
OpenAI US$ 61,82, Gemini US$ 25,31. Dentro da parte Anthropic, **output ≈ US$ 185
(78%)**, input frio US$ 55, cache write US$ 16, cache read US$ 2,6. É a mesma
proporção de 30/08, então a conclusão daquela rodada segue valendo: caching
disputa os 22% restantes, e a alavanca é o que sai.

**O cache, aliás, já está no teto.** Onde funciona, funciona muito bem:
`cena_turno` tem **41 leituras por write** (economizou ~US$ 13,58 no mês),
`ia4_avaliacao` 9,05, `blueprint_gerar` 6,39. O write órfão que 30/08 mapeou ainda
existe (`conteudo_texto`, `conteudo_podcast`, `conteudo_case`, `kit_semanal`, todos
com `cache_read = 0`), mas o excedente real é **US$ 0,66/mês** — o write substitui
o input frio, então o desperdício é o adicional de 25%, não o write inteiro. Não é
alavanca. O TTL de 1 h que o artigo sugere não está em uso em lugar nenhum e não
deveria entrar: o write de 1 h custa 2×, e o problema aqui já é write sem leitura.

### O modelo novo é mais barato por token e mais caro por chamada

`Medido:` mesma feature `ia4_avaliacao`, 60 dias, sem tocar em nada:

| modelo | n | saída média | US$/chamada | latência |
|---|---|---|---|---|
| `claude-sonnet-5` | 378 | **11.567** | **0,1160** | 111 s |
| `claude-sonnet-4-6` | 101 | 5.584 | 0,0917 | 93 s |

O Sonnet 5 custa 33% menos por token de output (US$ 10 contra 15) e sai **26% mais
caro por chamada**, porque produz **2,07× mais saída**. O delta é thinking: na
geração 5 ele vem ligado por padrão e `output_config.effort` tem default `high`.

Isso não é novidade do projeto — é a mesma medição que barrou `modulo_base_autor`
no 4.6 (tokens +40-68%, Resultado 3 acima). O que faltava era o corolário: as
tasks que **já** migraram herdaram o `high` sem ninguém decidir isso.
`reasoningEffort` aparece em **15 call-sites** (Modo Cena, Copiloto,
`escola-brief`, simulador) e em **nenhum** dos dois maiores gastos:
`ia4_avaliacao` (US$ 32,96/30 d) e `blueprint_gerar` (US$ 28,24/30 d), 26% da conta
Anthropic.

### O sweep

`scripts/_sweep-effort-ia4.ts` (local, `scripts/_*.ts` é gitignored). 12 respostas
reais de Ibipeba **estratificadas por nível** (N3=2, N2=5, N1=5) × 3 braços × 3
rodadas = 108 chamadas, US$ 10,49. Usa as peças de produção (`buildIA4UserPrompt`,
`validarAvaliacaoIA4`, `consolidarNotasIA4`), não persiste nada e marca o ledger com
`source = 'sweep_effort'`. A estratificação é obrigatória: a base é 55 de 77 em N1,
e N1 é o caso fácil (regra 3 do `IA4_SYSTEM` manda dar no máximo N1 para resposta
vaga). Amostra aleatória concluiria que qualquer effort serve.

| braço | n | saída média | saída máx | US$/chamada | latência | nota | ruído (dp) |
|---|---|---|---|---|---|---|---|
| `high` (hoje) | 36 | 11.984 | 18.538 | 0,1323 | 111 s | 2,27 | 0,103 |
| `medium` | 36 | 8.256 | 13.754 | 0,0950 | 76 s | 2,27 | 0,070 |
| `low` | 36 | **5.175** | 7.333 | **0,0642** | **45 s** | 2,31 | 0,060 |

Zero erro, zero JSON inválido, zero reprovação da `validarAvaliacaoIA4`, zero
truncamento, 6 descritores nas 108. **A diferença de nota entre braços (0,00 e
+0,04) é menor que o ruído entre rodadas do mesmo braço.**

### 🔑 A divergência de nível é da fronteira da régua, não do effort

`medium` divergiu do baseline em 1 de 12 e `low` em 0 de 12 — o que não faz escada
e por isso mereceu ser aberto:

```
2a02acbd   high   2.17 / 2.04 / 2.13  → N2 N2 N2
           medium 2.00 / 1.98 / 1.93  → N2 N1 N1
           low    2.23 / 2.20 / 2.20  → N2 N2 N2
```

A nota está colada no corte N1/N2. Quem decide o nível ali é onde a nota cai em
relação ao degrau, não o effort. A prova é que **o `high` diverge de si mesmo**:
em `22d76b6d` as três rodadas de `high` deram N3, N3, N2. Instabilidade
intra-braço: `high` 1/12, `medium` 2/12, `low` 1/12.

É exatamente o padrão de 09/09 acima (o extrator de conversa: estável na nota,
instável no nível) e a mesma classe de `lib/nivel-regua.ts` — o ruído do modelo é
pequeno, o degrau é que o amplifica. Ao comparar dois modelos ou dois efforts pela
taxa de divergência de NÍVEL, medir antes quanto o braço de controle diverge dele
mesmo; sem isso, ruído de fronteira vira veredito sobre a configuração.

### Decisão e o que ficou por medir

**Não aplicado, a pedido do dono (12/09): a IA4 segue em `high`.** O que estava na
mesa: US$ 32,96 → 16,15/mês e latência 111 s → 45 s (a IA4 é a fase mais longa, e é
ela que segura a fila de Server Actions do admin — daí `IA4_MAX_SINCRONO = 1`);
`low` também derruba a saída máxima de 18.538 para 7.333 tokens, aposentando o
truncamento que levou `IA4_MAX_TOKENS` a 64.000.

⚠️ **Medi a NOTA, não o TEXTO.** `mediaDescritores` e `nivelGeral` são o que a
consolidação em código produz, mas metade do produto da IA4 é o feedback que o
colaborador lê: evidências citadas e recomendações de PDI não foram comparadas
entre braços, e `low` pode escrever mais raso com a mesma nota. Também: um só
tenant, e a base tem 2 N3 e **zero N4** — não há evidência no topo da régua.
`blueprint_gerar` tem o mesmo perfil (14.018 tokens de saída, sem `effort`) e
**não foi medido**.

### Dois achados laterais, os dois abertos

**O lote já existe e 80% não passa por ele.** O desconto de 50% do Batch API está
comprovado no próprio ledger: `ia4_avaliacao` US$ 0,063/chamada em batch (n=43)
contra 0,132 no síncrono (n=232); `blueprint_gerar` 0,074 (n=45) contra 0,143
(n=175). Migrar metade do volume síncrono das duas vale ~US$ 14/mês sem tocar em
prompt ou modelo. Falta descobrir por que o operador escolhe "Agora".

**🔴 CORRIGIDO NO MESMO DIA — e o erro vale mais que o achado.** A primeira versão
desta seção dizia: "o Copiloto roda num modelo que o código não escolheu";
`lib/ai-tasks.ts:193` declara `gpt-5.6-terra` (US$ 2/12), mas **75 de 75 chamadas**
de `copiloto_pesquisa_*` saíram em `gpt-5.5` (US$ 5/30) com `requested_model`
**nulo**, logo seria a env `OPENAI_WEB_SEARCH_MODEL` (`actions/ai-client.ts:474`)
vencendo o código. **Isso está errado.**

Duas medições derrubam: `git show 269fc845^:lib/copiloto/research.ts` mostra o id
**hardcoded** (`process.env.COPILOTO_RESEARCH_MODEL || 'gpt-5.5'`), e
`vercel env ls production` não tem **nenhuma** das duas envs. O commit que trocou
para Terra é `269fc845`, de **10/09/2026 20:25**; a última pesquisa do ledger é de
**09/09**, ou seja, nenhuma rodou depois da troca. Não havia nada a corrigir.

⚠️ Também errei ao dizer que `COPILOTO_RESEARCH_MODEL` "não existe no código". Ele
existe, em `lib/copiloto/research.ts` — eu havia grepado só `actions/ai-client.ts`,
que lê **outro** nome (`OPENAI_WEB_SEARCH_MODEL`) como 2º nível. São dois nomes
distintos no mesmo caminho, e como o `research.ts` sempre passa `model` explícito, o
segundo nunca decide nesse fluxo.

🔑 O dado que desmentia a hipótese estava na mesma query que a levantou — a coluna
`max(created_at)` dizia 09/09. Comparei o ledger com o código de HOJE e li a
diferença como conflito de precedência, quando era **defasagem temporal**. Regra
que fica: ao explicar por que o ledger mostra um modelo que o código não declara,
**cruzar a data da última chamada com `git log -S` do arquivo antes de culpar env**.
O código tem histórico; o ledger é um registro do passado, não do estado atual.

**E a causa do custo também não era o preço do token.** Metade da conta do Copiloto
é `web_search_call` a US$ 0,01 (`OPENAI_WEB_SEARCH_USD_PER_CALL`,
`lib/ia-cost-catalog.ts:157`), e quem decide o número de buscas é o **modelo**: o
5.5 fazia ~24 por chamada, o Terra faz 4-5, daí os **−68%** reais. Eu havia
projetado o ganho pela razão de preço por token (US$ 5/30 → 2/12), que é a parte
menor. Detalhe na memória `project_copiloto_custo_busca_web`.

### O instrumento mentiu antes de medir

A 1ª versão do script lia `avaliacao.descritores`; a chave real é
`avaliacao_por_descritor` (é a que `consolidarEPersistirIA4` usa).
`consolidarNotasIA4` recebia `[]` e devolvia nota 0,00 / N1 nos **três** braços, a
`validarAvaliacaoIA4` passava — ela olha a chave certa — e o relatório anunciava
"mesmo nível em 1/1". **Concordância perfeita produzida por métrica morta.** Só foi
pego porque uma resposta gravada como N3 saiu N1 no smoke de 3 chamadas; disparar
as 108 direto teria gasto os US$ 10,49 para provar nada. O script agora conta
`semDescritores` e bloqueia a leitura das colunas de nota quando há JSON válido com
zero descritor. Regra que fica: **antes de rodar o experimento caro, rodar 1 caso e
conferir se a métrica de qualidade se move** — métrica travada num valor constante
parece consenso.

## 12/09/2026 — o custo do Copiloto é BUSCA, não modelo

A tela de custo por chamada mostrava as 6 tarefas mais caras da plataforma, e 5
eram do Copiloto. A leitura óbvia ("o Copiloto é caro") está errada: **são as 6
únicas tarefas que fazem busca na web**, e ele é o único módulo que busca.

### A parcela que a estimativa não enxerga

A Responses API cobra a busca **separadamente**: US$ 0,01 por `web_search_call`
(`OPENAI_WEB_SEARCH_USD_PER_CALL`, `lib/ia-cost-catalog.ts`). `Medido:` ledger de
28/08 a 09/09, tudo em `gpt-5.5`:

| tarefa | US$ tokens | US$ busca | US$ real | buscas/chamada | in/chamada |
|---|---|---|---|---|---|
| `copiloto_pesquisa_empresa` | 6,04 | **4,91** | 10,94 | 22,3 | 27.691 |
| `copiloto_pesquisa_noticias_externas` | 5,04 | **5,32** | 10,36 | 24,2 | 32.418 |
| `copiloto_pesquisa_social_oficial` | 2,64 | **2,51** | 5,14 | 13,2 | 17.083 |
| `copiloto_pesquisa_pessoas` | 1,00 | **1,21** | 2,20 | 24,1 | 33.253 |
| `copiloto_pesquisa_pessoa` | 0,79 | **0,95** | 1,73 | 13,6 | 18.433 |

Metade da conta é a ferramenta, não o modelo — e é exatamente isso que a coluna
"est." da tela acusa com 1,7× a 2,1×: ela projeta só tokens, então não erra por
pouco, ignora uma parcela inteira.

A busca cobra **duas vezes**: a taxa, e os tokens do conteúdo das páginas que ela
injeta na entrada. O prompt enviado tem 1.367 caracteres e a entrada chega a 33
mil tokens. Entrada gigante em tarefa de busca não é prompt inchado.

**Um planejamento custava US$ 1,76** (22 planejamentos = US$ 38,70; a pesquisa é
79% disso). O resto da plataforma somou US$ 473,86 no mesmo período.

### Quem decide quantas buscas é o MODELO, e isso pesa mais que o preço do token

`Medido:` n=3 por braço, prompt de produção (`newsResearchPrompt`, Ford Slaviero):

| braço | buscas | US$ médio | faixa entre execuções | fatos |
|---|---|---|---|---|
| `gpt-5.6-terra` como está | 4-5 | **0,1513** | 0,1397-0,1731 | 7, 7, 7 |
| Terra + `max_tool_calls:4` + `search_context_size:'low'` | 4-5 | 0,1472 | 0,1376-0,1536 | 5, 5, 6 |
| `gpt-5.5` (do ledger) | 24,2 | 0,4708 | — | — |

🔴 **Teto de buscas: REPROVADO, não tentar de novo.** `max_tool_calls: 4` foi
**desrespeitado** (5 buscas em 2 das 3 rodadas); a economia de 2,7% cai **dentro
do ruído** (o braço sem teto varia 24% entre execuções idênticas); e a qualidade
piorou de forma consistente, 7 fatos nas três rodadas contra 5, 5 e 6.
`search_context_size: 'low'` não reduziu a entrada.

⚠️ Com **n=1 o resultado sai invertido** ("o teto encarece", porque aquela
execução fez 5 buscas contra 4) — o mesmo erro que a régua de variância do
projeto já documenta.

**A troca de modelo resolveu o que o teto não resolveria: −68% na trilha de
notícias** (0,4708 → 0,1513, commit `269fc845` de 10/09). A razão principal não é
o preço do token ($5/$30 → $2/$12): é o Terra fazer **4-5 buscas onde o 5.5 fazia
24,2**. A parcela de ferramenta caiu de US$ 0,242 para ~US$ 0,045 por chamada.
`Projeção (não medida):` se as outras quatro trilhas seguirem a proporção, o
planejamento vai de US$ 1,76 para ~US$ 0,55.

### Os dois alternativos testados

- **Muse Spark 1.3** (`api.meta.ai`, $1,25/$4,25): **não tem busca** —
  `tools:[{type:'web_search'}]` devolve `400 tools[0] did not match any supported
  type`. Sem busca ele responde de memória e **inventou** o CEO da empresa,
  citando o site dela como fonte; noutra chamada gastou 500 tokens (497 de
  raciocínio) e devolveu texto vazio.
- **Gemini 3.8 Flash** (`google_search`, $0,75/$3,75): **busca bem**, 4 a 6
  consultas no prompt real, e acertou o CEO. 🔑 Mas **busca e saída estruturada
  são excludentes nele**: com `responseMimeType:'application/json'`, ou pedindo
  "responda SOMENTE o JSON", faz **0 buscas em 3 de 3** e **inventa** os fatos,
  devolvendo um JSON bem-formado e falso. Com busca ligada, responde em markdown.
  Seria viável em duas chamadas (pesquisar + estruturar) a ~US$ 0,04 contra US$
  0,15 do Terra; **não adotado** — mais um caminho para falhar em cima de um custo
  que acabou de cair 68%.

### O que observar

O fallback da pesquisa é `gpt-5.6-sol` ($4/$20, quase o preço do 5.5): linha em
`gpt-5.6-sol` no ledger significa que o Terra está estourando o orçamento de tempo
e comendo a economia. E confirmar se as outras quatro trilhas caíram na mesma
proporção — só a de notícias foi medida.

## 12/09/2026 — custo de IA e orçamento deixam de disputar a mesma função

O centro FinOps (`/admin/vertho/simulador-custo`) ficou responsável por **medir e
projetar custo técnico**. O deal desk (`/admin/vertho/orcamento`) ficou responsável
por **formar preço e testar margem**. A distinção é estrutural: o primeiro lê o
ledger e o catálogo; o segundo incorpora escopo, pessoas, ciclos, horas internas,
mensagens, infraestrutura, contingência, impostos e comissão.

No FinOps, o seletor manual foi reduzido aos oito modelos homologados para
comparação — Sonnet 5, Opus 5, GPT 5.6 Sol/Terra/Luna, Muse Spark 1.3, Gemini 3.8
Flash e Kimi K3. O catálogo completo continua precificando histórico, TTS,
embeddings e fallbacks. A tabela real perdeu a coluna de cache isolada e ganhou
ordenação em todas as colunas úteis; tokens de cache continuam compondo os
cálculos, apenas não ocupam uma coluna própria.

No orçamento, a régua comercial e as fórmulas passaram a ter fonte única em
`lib/orcamento/precificacao.ts`, também consumida pela sugestão de propostas. A
folha de decisão agora separa **investimento do cliente** de **custo interno** por
pessoa e por ciclo. O investimento unitário inclui o setup rateado; o custo
unitário inclui IA, horas, mensagens, infra, contingência, comissão e impostos.

Premissas, fórmulas e a distinção entre preço e custo de matriz vivem no documento
canônico `docs/ORCAMENTO.md`; não repetir a tabela comercial neste log.

