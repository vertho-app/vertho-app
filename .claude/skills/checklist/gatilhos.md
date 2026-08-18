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
- 🔴 **`CREATE UNIQUE INDEX … WHERE …` (parcial) não serve de árbitro para `ON CONFLICT` via
  PostgREST** — o `on_conflict=` só aceita colunas, não predicado → `42P10` no primeiro envio real,
  com mensagem que nem cita o índice (16/08: o push do admin nunca funcionou). Ao criar índice único
  parcial, procure quem faz `upsert` com essas colunas. Detalhe: memória `reference_indice_parcial_on_conflict`.
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
- 🔴 **Desligar/trocar um canal de aviso? duas perguntas antes:** *(a) o sucesso deste envio guarda
  alguma transição de estado?* — no CONARH o `followup_step` avançava DENTRO do `if (r.ok)`, e com o
  canal caído a régua ficou congelada desde 11/08 sem sintoma; *(b) para onde o conteúdo vai agora, e
  quem lê aquilo?* — trocar envio por `console.log` levou nome, organização e TELEFONE de lead para o
  log retido da Vercel (17/08). Detalhe: memória `feedback_desligar_um_aviso`.
- 🔴 **Ligou o template num call-site? procure os OUTROS.** `sendAccessLink` tinha 4 e só 1 passava o
  `acessoParam` → 28 falhas de login medidas (14-16/08). O antídoto não é repetir a linha: é DERIVAR
  do que todos já passam, num lugar só (`derivarParametroAcesso`).

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

## 23. Passo novo numa tela de acesso / onboarding

Casa: `app/login/**`, `app/entrar/**`, qualquer tela que fica **entre a mensagem e o conteúdo**.

- 🔴 Antes de tornar algo o caminho PRINCIPAL, responder as duas em voz alta: **quem paga o custo
  disto** e **quantos são, contra quantos ganham**. Beneficiado minoritário ⇒ o mecanismo vira opção
  secundária (`<details>` fechado, link discreto), nunca pedágio.
- Proteção só é **obrigatória** quando o erro que ela evita é irreversível (token de uso único
  queimado). Erro recuperável ⇒ opção.
- ⚠️ Quando a resposta depende de **para quem o produto é**, ela não está no código: perguntar ao
  Rodrigo cedo custa uma frase.
- Medido 15-16/08/2026: três versões seguidas da tela de acesso estavam **certas no mecanismo e
  erradas na hierarquia** — uma virou "burocrático… muitos passos", outra caiu inteira com *"não
  considere a versão PWA"*, levando junto ~2h de trabalho já desenhado.

## 24. Variável de ambiente que decide comportamento (Vercel)

Casa: `vercel env add/rm`, leitura nova de `process.env.*` que muda entrega, custo ou destino.

- 🔴 **Gravou e não consegue ler de volta?** Var marcada *Sensitive* volta como `[SENSITIVE]` no
  `vercel env pull` — você não tem como provar o que gravou. Antes de considerar feito, garantir um
  **observável**: check de health, script que imprime o valor resolvido, ou log.
- 🔴 Achar **quem LÊ** a chave. Se o único consumidor é o próprio ponto de envio, não existe lugar
  onde o erro apareça — o sintoma vira a fatura ou um 132001 no cron. (Caso-irmão: `feedback_config_sem_consumidor`.)
- `printf '%s' 'valor' | vercel env add …` — **nunca `echo`** (injeta `\n`, e o sintoma é
  "template não existe" em produção).
- Medido 16/08/2026: `WHATSAPP_TEMPLATE_PILULA` apontava para um template reclassificado como
  MARKETING (6× o custo, ~R$ 180 contra ~R$ 25 por semana em 400 pessoas). Aprovado, enviado,
  entregue — nada quebrou. Fechado com a **R13** do health (`checarTemplatesLigados`) e
  `scripts/_testar-template.ts`, que imprime o template resolvido **antes** de enviar.

## 25. Lote de Módulo-Base / manuscrito (`trigger/gerar-modulos-manuscrito`, `scripts/_extrair-manuscrito-*`)

Casa: importar manuscrito, gerar/refinar Módulo-Base em lote, publicar acervo de competência.

- 🔴 **O `progress` do job NÃO é veredito.** `resultados[].ok` significa *persistiu*. Medido
  16/08/2026: o job fechou "21 ok, 0 erro(s) · 21/21 auditado(s)" com **11 reprovados de 24** no
  banco, e **3 com `conteudo_central` vazio** (`{}`) marcados `ok: true`, levando os avisos do
  `validarCorpo` junto. Contar por veredito antes de dizer que deu certo:
  `select auditoria_ia->>'veredito', count(*) … group by 1`.
- 🔴 **Antes de gastar IA, rodar `scripts/_verificar-manuscrito.ts <docx>`** — a grade tem de fechar
  em 4 faixas iguais **por capítulo** [+1 síntese]. O DIR10 chegou com 2 de 8 capítulos válidos; a
  correção sem perder texto é **fundir** (`scripts/_corrigir-grade-manuscrito.ts`), nunca escrever MB
  novo. Acrescentar ou remover MB **obriga a renumerar o documento inteiro**.
- 🔴 **Dois manuscritos podem ter o mesmo `cod_comp` e ser competências diferentes.** DIR10 tem duas
  versões com 54 IDs colidindo e **0 títulos iguais** — um merge por ID apagaria um manuscrito
  inteiro em silêncio. Comparar por CONTEÚDO (`scripts/_comparar-manuscritos.ts`); o casamento com o
  tenant é explícito (`--comp=C014`), nunca por semelhança de nome.
- Refino: 13 de 14 recuperados numa passada, mas **custa 2× a geração** (wrapper síncrono, sem o
  −50% do batch — `docs/CUSTO-QUALIDADE.md`). "Sem ganho" com nota igual pode ser conteúdo NOVO:
  conferir `versao`/`auditado_em_versao` e rodar a 2ª passada antes de desistir.
- Ressalva da auditoria vem do MANUSCRITO ou da IA? **Grep na fonte decide.** Refinar o que a autora
  escreveu de propósito afasta o módulo do material dela.

## 26. Render de PDF fora do Next (`scripts/*.ts`, tasks, lotes headless)

Casa: qualquer caminho que renderize PDF por `tsx`/node em vez do bundle do Next.

- 🔴 **`await import('@react-pdf/renderer')` dentro da função resolve uma CÓPIA diferente do
  módulo.** A fonte registrada por `components/pdf/styles` fica na instância do import estático e o
  render acontece na outra. Sintoma que engana: `Font family not registered: NotoSans` **com a fonte
  comprovadamente registrada**. Medido 16/08/2026: 13 famílias na instância estática contra 12 na
  dinâmica. Usar o `renderToBuffer` do import estático — `scripts/_provar-instancia-pdf.ts` prova e
  valida por mutação.
- 🔴 **Corrigir a FUNÇÃO, não o chamador.** Em 05/08 o diagnóstico estava certo e o conserto foi
  contornar no script; a função ficou quebrada mais 11 dias e **40 micro-conteúdos nasceram sem
  PDF** (`url`/`storage_path` nulos), pagando a expansão de IA do PDF assim mesmo.
- Falha de render dentro de `try/catch` que só faz `console.warn` **não aparece em lugar nenhum**:
  conferir o efeito PERSISTIDO (`select count(*) … where url is null`), nunca o log.

## 27. Marca em PDF / white-label por tenant (`components/pdf/**`, `lib/pdf-marca.ts`)

Casa: pedido de "tirar a marca", PDF entregue a cliente, capa/cabeçalho/rodapé de relatório.

- 🔴 **Tirar o logo PIORA**: `PdfReportCover` tem fallback que ESCREVE "vertho.ai" quando não recebe
  imagem. Imagem e `mostrarVertho` são uma decisão só — `lib/pdf-marca.ts` (17/08).
- 🔴 A marca não está só na capa: rodapé fixo (4 de 6 páginas), slogan, "· vertho.ai" na linha de
  confidencialidade, contracapa e **o nome do arquivo** baixado. Provar no ARTEFATO:
  `scripts/_verificar-pdi-marca.ts` lê o texto de todas as páginas do PDF servido.
- 🔴 **Mudar o componente não muda o que já foi gerado** — o PDF nasce uma vez e é reusado
  (`if (!path)`). Regerar faz parte da entrega, senão ninguém vê a mudança.
- Fallback de erro é **sem logo**, jamais o da Vertho. Logo do cliente é opt-in à parte.

## 28. Envio de WhatsApp em lote (qualquer caminho)

Casa: script, action, cron ou tela que mande mais de uma mensagem.

- 🔴 **Cadência vem de `lib/whatsapp/cadencia.ts`**, nunca de literal. Em 17/08 havia QUATRO réguas,
  duas com os 2s que derrubaram o número em 11/08. Guarda: `whatsapp-cadencia-guard`.
- 🔴 **Ao trocar de canal/fornecedor, o denominador do guard troca junto.** Ele media o wrapper
  legado e ficou cego para `enviarTemplateCloud`/`enviarPorTemplate` (Cloud API desde 14/08) — verde
  enquanto o produto migrava.
- 🔴 **Envio real não sai da máquina do dev**: `.env.local` não tem `WHATSAPP_TEMPLATE_*` nem
  `CRON_SECRET`. Descobrir isso antes de preparar o disparo.
- Antes de disparar, conferir o que JÁ saiu (`notification_deliveries` por `kind`): "vamos avisar" e
  "já avisamos" são indistinguíveis sem essa consulta — foi assim que 34 pessoas ficaram sem aviso
  por uma premissa escrita num comentário (F-I19).
- Operação que **só** o cron alcança precisa de caminho por sessão: `CRON_SECRET` é *Sensitive* e
  ninguém consegue lê-lo; regravar derruba os crons agendados.

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
