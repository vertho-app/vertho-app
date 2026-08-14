# Gatilhos — arquivo tocado → conferência obrigatória

## 0. O que este arquivo é (e o que ele não é)

É uma tabela de **roteamento**: dado o que a mudança toca, quais conferências ela obriga.
**A régua mora no doc canônico; aqui só há o ponteiro.** Se um gatilho precisou de mais de duas
linhas para ser explicado, ele está no lugar errado — escreva no doc e deixe aqui o link. Duplicar
regra é como o repo acumulou doc que ensinava o errado (consolidação de 27/07).

Todo gatilho carrega a **consequência medida**, com data. Sem incidente real, não entra: tabela
inflada com hipótese deixa de ser lida. Ordem: as três primeiras áreas são as que mais mordem.

---

## 1. `migrations/*.sql`

- 🔴 **Conferir o maior N no INSTANTE de criar o arquivo** (`ls migrations/ | tail -5`), não no
  início da rodada — o dono cria migration em paralelo e a colisão nasce nessa janela (2× em 06/08).
  Renumerar sempre a sua. Guard: `tests/unit/security/migrations-numeracao-guard.test.ts`
  (varre o **diretório**, não `git ls-files`, porque a colisão nasce untracked).
- 🔴 `CREATE INDEX CONCURRENTLY` e qualquer DDL proibido em transaction **não vai** por
  `apply-migration.mjs` (ele manda o arquivo inteiro numa query = transaction implícita).
  Script statement-a-statement; template: `scripts/_criar-indices-escala.mjs`.
- Idempotência + `NOTIFY pgrst, 'reload schema'` no fim. Fluxo: skill `migrations`, `docs/SCHEMA-PROCESS.md`.
- Coluna nova "para corrigir algo": conferir o **schema atual** antes — a especificação do FMEA
  também envelhece (F-I4 pedia coluna que já existia).
- Antes de **deletar** conteúdo/linha: varrer referências **JSONB** (`temporada_plano`: `core_id`,
  `formatos_disponiveis[].id`) — não há FK que avise.

## 2. Arquivo `'use server'` (`actions/**`)

- 🔴 **Todo export novo vira endpoint HTTP** — o parâmetro que pula o gate é escolhido pelo
  **cliente**. Gate explícito em todo export, sem exceção. Guard:
  `tests/unit/security/use-server-internal-guard.test.ts` + a allowlist, que **só encolhe**.
- Precisa de caminho headless (script/seed/task/cron)? Núcleo **sem gate** em `lib/`, action gatada
  delegando. Modelos: `lib/blueprint/core.ts`, `lib/season-engine/*-core.ts`. Nunca flag `internal`.
- 🔴 Loop de IA **dentro** de action é bomba de 300 s, e Server Action é despachada **uma por vez
  por cliente** — loop no cliente trava a aba (medido: 100 s/item na IA4). Vai para Trigger.dev.
- Auditar exposição: `.next/server/server-reference-manifest.json` (o que o servidor aceita) ×
  grep do id em `.next/static/chunks/` (o que o browser publica).

## 3. Query que toca dado de tenant

- 🔴 Passar por **`tenantDb(empresaId)`**. Guards: `tenant-mutation-guard`, `tenant-read-guard`
  (allowlists que só encolhem; a **constante no topo de cada teste é a fonte da verdade** sobre
  cobertura — não o resumo em doc nenhum).
- 🔴 Colaborador por e-mail: **`findColabByEmail`**, nunca `.eq('email')` (pessoa em 2+ empresas).
- **Não conte com RLS**: o app roda service-role (`BYPASSRLS`) e as policies são decorativas por
  decisão (CLAUDE.md §Multi-tenant). Tabela nova de PII nasce protegida por **guard**, não por policy.
- 🔴 `if (error)` em **todo** await de query — supabase-js **retorna** `{ error }`, não lança.
  Mordeu 2× em 27/07 (Map vazio truthy; carimbo gravado com upsert falho).
- `.limit(1)` para "representar a empresa" está errado em empresa-rede (1 PPP por escola; Ibipeba: 11).
  Guard: `ppp-rede-guard`. Detalhe: `docs/FMEA-PIPELINE.md` F-I10.

## 4. IA (`actions/ai-client.ts`, prompts, troca de modelo, lote)

- 🔴 Só `callAI`/`callAIChat` ou `lib/ai-batch.ts`. **Zero request cru** — guard:
  `tests/unit/integrations/ia-request-cru-guard.test.ts` (allowlist vazia). O **contrato** da API
  muda entre gerações: request cru fica fora do fix (0 vídeos de 05/08 a 10/08, em silêncio).
- Trocar de modelo: ~26 arquivos + **os dois espelhos** de custo (`docs/CUSTO-QUALIDADE.md` e
  `/admin/vertho/custo-ia`) + grep de chamada crua (`api.anthropic.com`, `new Anthropic(`,
  `generativelanguage`) + conferir os parâmetros de raciocínio, não só o id. **Env da Vercel vence o código.**
- Geração de fundo em lote usa `lib/ai-batch.ts` (−50%). Não rodar na mesma janela dois lotes que
  compartilham **fornecedor** (o TTS do Vertex serve narração E podcast — auto-saturação, 12/08).
- `504` do gateway **não** prova trabalho perdido: medir pelo efeito **persistido** (8 de 10
  "falhas" estavam no Storage). `docs/FMEA-PIPELINE.md` F-V4.

## 5. `trigger/**`

- 🔴 Task **não sobe no `git push`** — `npx trigger.dev deploy` **manual**, e o path com espaço
  quebra o CLI (junction). Esquecer = código novo no site, task velha rodando.
- Região segue o Default do dashboard; trocar exige **redeploy**.

## 6. Entrega ao usuário (semana, kit, conteúdo, vídeo da trilha)

- 🔴 **Leia o CONSUMIDOR, não o campo gravado** (CLAUDE.md §"A forma GRAVADA ≠ o que é ENTREGUE"):
  `formatos_disponiveis` não contém vídeo · `desafio_texto` gravado é placeholder (o real vem do
  overlay do Kit) · quem a pessoa assiste é `videos_personalizados`, não `videos_gerados`.
- 🔴 **Dois caminhos? conserte o que RODA** — cache × live, gêmeo A × gêmeo B. Em 29/07 três
  correções corretas estavam no gêmeo errado no mesmo dia. Medir **pós-overlay**.
- Teste de paridade só vale se construir a entrada dos **dois lados de forma diferente**: o
  `kit-entrega-paridade` passava verde consultando o cache com a chave do brief.
- Bloco/horizonte novo entra com **0 kit** em silêncio — conferir a cobertura antes de anunciar.

## 7. WhatsApp / envio / canal

- 🔴 Cadência: 155 mensagens a 2 s derrubaram o número em 1min47 (11/08). Guards:
  `whatsapp-cadencia-guard`, `whatsapp-fila-guard`.
- 🔴 `sucesso` significa **"a Z-API aceitou"**, não "entregou". Não relatar entrega a partir disso.
- Ao mexer no envio, procurar **todos** os call-sites (eram cinco, não dois — 11/08).
- Tenant `is_demo` não envia nada real (`lib/demo/envio-guard`).

## 8. Auth, sessão, login

- 🔴 Refresh só no `proxy.js`; gate no cliente é **`getUser()`**, nunca `getSession()` — divergência
  entre as pontas = laço `/rota` ↔ `/login` (~3 req/s em prod, 22/07). Guard: `proxy-session-refresh`.
- **Importar colaborador ≠ dar acesso**: nenhum import cria `auth.users`. E-mail sem `createUser`
  devolve "Falha ao gerar link"; telefone com `login_por_whatsapp=false` responde sucesso e **não
  envia nada**. Rodar `docs/CHECKLISTS.md` §3 "Acesso da turma importada" antes de convidar turma.
- Abrir rota sem sessão é **allowlist explícita com o motivo ao lado** (`lib/videos-publicos.ts`),
  lookup com `hasOwnProperty` (nunca `in`), e apelido curto é **por tenant**.
- ⚠️ `ADMIN_EMAILS` são **duas réguas**: abre o layout de `/admin` e **nenhuma action** (403). A tela
  gira sem erro. E2E tem que usar e-mail da **tabela**.

## 9. Campo de formulário / UI (remover, renomear, trocar mecanismo)

- 🔴 **Que régua do servidor lê esse campo?** Tirar um toggle pode tornar uma classe
  **inalcançável** e matar um alerta em silêncio — nada no typecheck acusa (04/08).
- Trocar o mecanismo de uma tela **obriga a renomear a métrica**: manter o nome antigo medindo outra
  coisa é como um painel passa a mentir. `docs/CONARH52-SPRINT-CONSOLIDADO.md` §0.1.

## 10. Régua / nota / nível / scoring

- 🔴 Fonte única `nivelDaNota` (N4 é **acima de 3,5**, não floor). Estava em 10 cópias e a
  divergência vazava para o documento do cliente. Guard: `nivel-regua-guard`.
- Mudou a régua? `spec_version` congela o histórico. Motor: `lib/scoring::calcularFitUnificado`.
- DISC de kit/vídeo ancora na **1ª letra de propósito** (F-I8) — só camadas derivadas usam o combo.

## 11. Copy que sai para fora (mensagem, e-mail, tela pública)

- 🔴 Jargão do código vaza para o cliente ("porta" ≠ etapa). Guard: `tests/unit/conarh-mensagens.test.ts`.
- 🔴 Promessa cuja validade depende do **N** (confidencialidade, "só agregado") precisa de **piso de
  N** no código — não existe hoje. Com 2 participantes, agregado não anonimiza (06/08).

## 12. PDF / relatório

- `@react-pdf`: `rgba` em `borderColor` vira laranja; `<Image>` só PNG/JPEG. Corpo sempre Inter.
- Fonte registrada sob `tsx` cai em **outra instância** do módulo. `docs/` do report system.

## 13. Vídeo

- Pipeline e templates: `docs/GERADOR-VIDEO-MODULO.md`. `RENDER_BACKEND=hetzner`.
- Vídeo de kit ancora no módulo do **conteúdo**; lote de ~42 satura (~15% falham).
- Provisionar box tem custo por hora — **encerrar ao fim do spike** e conferir pela API.

## 14. Env var / secret

- `vercel env add` com **pipe injeta `\n`** → usar `printf '%s'`. Env da Vercel **vence o código**.
- Não commitar secret; `.env.local` é a fonte local. Lista canônica: `docs/envs-importantes.md`.
- `ADMIN_EMAILS` é **autorização**, não caderno de contatos — alerta vai em `HEALTH_ALERT_EMAILS`.

## 15. Cron / jornada / semana

- 🔴 Cron que não rodou = **1 semana de atraso, sem catch-up**. Prova: `cron_execucoes`;
  entrega: carimbo por canal.
- Alarme conta **ocorrências**, não pessoas — varredura de tela infla o número ("578 fallbacks/24h").

## 16. Gate ou pré-requisito novo

- 🔴 **Existe tenant em que A nunca será satisfeito?** Empresa com perfil externo (OPQ32/Hogan) não
  faz o DISC nativo — o gate tornou o mapeamento **inalcançável** (06/08). Chega como bug do usuário,
  não como configuração. O acoplamento costuma estar em 3 camadas e **só o gate barra de verdade**:
  corrigir os botões não resolve. `docs/ARQUITETURA.md` §3.6.
- Escopo por turma: fail-closed **ligado** em tenant com 2+ turmas (Macaé) — validar lá, não só
  em tenant de 1 turma. Régua única: `turmas-config-fonte-unica`.

## 17. Filtro por valor livre (e-mail, slug)

- 🔴 `.ilike()` trata `_` e `%` como **curinga** → amplia o escopo em silêncio ("card aparece mas
  não abre"). Igualdade case-insensitive em código; `ilike` só com curinga **intencional**.
  Helper: `lib/sql-like.ts::escaparLike`.
- Gate novo que duplica filtro de uma listagem: as duas pontas usam a **mesma régua**.

## 18. Fallback / degradação novo

- 🔴 Fallback pode existir, **invisível não**: `registrarDegradacao` (`lib/degradacao.ts`,
  contador por dia UTC).
- A régua: **na construção, falhe alto** (build/admin — inclusive **200 vazia/não-parseável**);
  **na entrega, degrade registrando**. `docs/FMEA-PIPELINE.md`.

## 19. Storage

- Key **sempre** por `storageSlug()` ao derivar de nome livre — Storage rejeita não-ASCII
  ("Invalid key"; quebrou 2×). O `filename` de download pode manter acento; a key não.

## 20. Teste novo / mock

- Mock de Supabase **só** por `tests/helpers/supabase-mock.ts` (`criarSupabaseMock`) — 31 de 40
  arquivos hardcodavam `error: null` e nenhum exercitava o ramo de erro (10/08).
  `sb.falharEm({...})` dentro do `it`; `sb.escritas` prova que o gate impediu a escrita.
- 🔴 **Validar por mutação** antes de contar como prova. Asserção sobre agregado esconde a parte quebrada.
- Data de teste com hora de corte: congelar (`vi.setSystemTime`) longe das bordas — a semana libera
  às 06:00 UTC e a asserção inverte sozinha entre 00:00 e 06:00.
- Vermelho que **muda de lugar** = teto de 5 s, não teste lento.
- Guard varre o **tracked** ⇒ rodar a suíte **depois** do `git add`.

## 21. Doc (`CLAUDE.md`, `docs/**`)

- `.md` novo só em `docs/` (guard: `docs-location-guard`) — 4 exceções de contrato.
- 🔴 As **5 fontes do Project** (claude.ai) não se atualizam sozinhas: `CLAUDE.md`,
  `docs/ARQUITETURA.md`, `docs/PIPELINE-TRILHA.md`, `docs/FMEA-PIPELINE.md`,
  `docs/PASSO-A-PASSO-VERTHO.md`. Tocou uma delas ⇒ avisar para re-subir (skill `fechar` §3.1).
- Não escrever doc que **enumera cobertura** ("cobre 5 tabelas") — aponte para a constante do teste.
- 🔴 O repo é **público**: dump de tenant, nota de sessão e lacuna de segurança **aberta** ficam fora.

## 22. Sempre (base fixa — cite, não copie)

`docs/CHECKLISTS.md` §1. Os três que mais reincidem:

- 🔴 `npm run build > log 2>&1` — **nunca `| tail`** (deixa `next build` órfão segurando o lock).
- 🔴 `git add` **seletivo** e `git commit` **com pathspec explícito** — sem pathspec o commit leva o
  index inteiro, e o index não é só seu (medido 2×: 11/08 e 13/08).
- 🔴 Antes de depurar "não funcionou": comparar o **SHA do último deployment** com `git log -1`.
  Push que não gera build, aba com bundle antigo (Skew Protection 12 h) e bug real produzem a
  **mesma tela**.
- 🔴 Rodar `npm run test:unit` **inteiro**, não só o arquivo da mudança: os guards varrem o repo
  todo, então o vermelho pode não ter relação nenhuma com o seu diff — e você é quem vai encontrá-lo.
- 🔴 **Depois** do push: `gh run list --limit 6 --json headSha,conclusion,workflowName`. `git push`
  devolve sucesso com o CI vermelho, e o `Smoke Test` verde ao lado do `TypeScript` vermelho faz a
  lista parecer saudável de relance — em 13/08 foram **5 commits e 3h18 em vermelho, três deles
  meus**, empurrados por cima sem ninguém ver.
