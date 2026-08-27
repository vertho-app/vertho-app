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
