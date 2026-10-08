---
name: fechar
description: Fecha uma rodada de trabalho — destila o aprendizado, grava na memória, atualiza os .md certos e deploya. Use quando o usuário disser "fecha isso", "salva os aprendizados", "atualiza a memória e os mds", ou ao terminar uma investigação/correção que ensinou algo que não está no código.
---

# Fechar a rodada

<!-- Registro: skills aninhadas só são descobertas quando um arquivo desta
     pasta é editado na sessão — este comentário forçou a 1ª descoberta. -->

Deploy sozinho é `/deploy`. **Esta skill é pro que o commit NÃO conta**: o aprendizado que não está legível no diff.

Repo: `C:\GAS\Vertho App\nextjs-app` (sempre `git -C "<repo>"`, nunca `cd ... && git`).
Memória: `~/.claude/projects/C--GAS-Vertho-App/memory/`.

Proceda **sem perguntar** — deploy e memória são autorizados de forma durável.

## 0. Conferir que a receita que estou lendo é a PUBLICADA (primeiro passo, sempre)

Esta skill é lida do **disco** (`.claude/skills` é junção para `nextjs-app/.claude/skills`), e o checkout principal costuma estar atrás de `origin/master`: a receita que aparece aqui pode ser velha, e seguir receita velha já custou caro (30/09: 3 remoções do Project não gravaram e o contador escondeu a falha). Antes de qualquer passo, rode:

```bash
R="C:/GAS/Vertho App/nextjs-app"
git -C "$R" fetch -q origin master 2>/dev/null || echo "FETCH FALHOU: NÃO conferi (diga isso, não leia como igual)"
for f in $(git -C "$R" ls-tree --name-only origin/master .claude/skills/fechar/ | sed 's#.*/##'); do
  d=$(tr -d '\r' < "$R/.claude/skills/fechar/$f" | sha1sum | cut -c1-10)
  m=$(MSYS_NO_PATHCONV=1 git -C "$R" show "origin/master:.claude/skills/fechar/$f" | tr -d '\r' | sha1sum | cut -c1-10)
  echo "$f disco=$d master=$m $([ "$d" = "$m" ] && echo IGUAL || echo DIFERE)"
done
```

- **Tudo `IGUAL`**: siga o que está no disco.
- **Algum `DIFERE`**: a versão válida é a do `origin/master`. Leia **essa** (`MSYS_NO_PATHCONV=1 git -C "$R" show "origin/master:.claude/skills/fechar/<arquivo>"`) e siga ela, não a do disco. 🔴 **Não sobrescreva o arquivo do disco sem olhar**: `git -C "$R" status --porcelain -- .claude/skills/fechar/<arquivo>` mostrando ` M` quer dizer edição local não commitada de outra pessoa ou sessão; nesse caso só leia o master e avise no fecho. Disco limpo e atrasado pode ser alinhado copiando a versão do master.
- Os `Permission denied` em `.git/worktrees/` que o `fetch` imprime são ruído da poda do Windows, não falha. A falha real é o `fetch` sair com erro (a mensagem acima).

`Medido: 08/10/2026`: o `sincronizar-project.md` do disco estava **4 commits atrás** (59 linhas só no master, com a sincronização pela API com hash e a saída do DELETE) **e** com 17 linhas locais não commitadas. A regra valia só na memória; aqui ela deixa de depender de alguém lembrar.

## 1. Destilar: o que aqui é aprendizado?

Antes de escrever qualquer coisa, separe:

| Vai pro commit (e mais nada) | Vai pra memória / doc |
|---|---|
| O que o código faz agora | **Por que** a alternativa óbvia estava errada |
| Estrutura de arquivos, nomes | Armadilha que custou tempo e vai custar de novo |
| O fix em si | A **classe** do bug (o próximo caso do mesmo tipo) |
| Histórico git | Número **medido** que ancora a decisão |

**Se não sobrar nada da coluna da direita, pule pro passo 4.** Memória inflada com o que o repo já registra é pior que memória vazia — some no ruído.

Rotule a procedência do que gravar: `Medido:` (com o número e de onde veio), `Suponho:`, `Memória-não-verificada:`. Chute e medição não podem parecer a mesma coisa daqui a três meses.

## 2. Memória

Um arquivo = um fato. Procure primeiro um arquivo existente que já cubra o tema (`ls` na pasta + leia o `MEMORY.md`) — **atualizar vence criar duplicata**.

```markdown
---
name: <slug-kebab-case>
description: <uma linha — é por ela que a relevância é decidida no recall>
metadata:
  type: user | feedback | project | reference
---

<o fato. Datas relativas viram absolutas. Link pros vizinhos com [[outro-nome]].>
```

Depois **sempre** acrescente a linha de índice no `MEMORY.md` (uma linha, com gancho — nunca o conteúdo):

```
- [Título](arquivo.md) — gancho curto e específico
```

## 3. Docs (.md do repo)

Escolha o destino pelo tipo do aprendizado — não jogue tudo no `CLAUDE.md`:

| Aprendizado | Destino |
|---|---|
| Regra que eu tenho que seguir SEMPRE ao mexer no projeto | `CLAUDE.md` (curto + link pro detalhe) e, se for proibição, também o "NÃO fazer" |
| Como uma camada funciona / por que foi feita assim | `docs/ARQUITETURA.md` (seção nova numerada) |
| Motor da trilha, ponta a ponta | `docs/PIPELINE-TRILHA.md` |
| Modo de falha novo do pipeline | `docs/FMEA-PIPELINE.md` (gatilho `arquivo:linha` + status + correção) |
| Achado/postura de segurança | `docs/SECURITY-STATUS.md` (⚠️ **repo é PÚBLICO — nunca versionar doc de vuln ABERTA**) |
| Custo/qualidade de IA | `docs/CUSTO-QUALIDADE.md` (doc único desde 01/09/2026 — o espelho HTML em `/admin/vertho/custo-ia` foi aposentado) |

Regras de escrita: o `CLAUDE.md` é resumo operacional — entrada nova ali é **curta e aponta** pro doc canônico. No doc canônico vale o detalhe, com `arquivo:linha`.

**Um doc canônico por assunto.** Antes de criar `.md` novo, procure quem já cobre o tema e escreva lá — a consolidação de 27/07 fundiu 21 arquivos em 6 justamente porque o mesmo assunto vivia em 3-5 lugares, com versões que se contradiziam. Doc novo só quando o assunto não tem dono; então acrescente a linha na tabela de índice do `CLAUDE.md`.

### 3.1 As FONTES DO PROJECT (claude.ai) — **sincronizar, não avisar**

**São 20** (desde 22/09/2026) e elas ficam congeladas na versão subida. Toda rodada termina com o
Project batendo com o repo; a receita completa (comandos, refs, armadilhas) está em
**`sincronizar-project.md`**, ao lado.

```
CLAUDE.md · docs/ARQUITETURA.md · docs/PIPELINE-TRILHA.md · docs/FMEA-PIPELINE.md
docs/PASSO-A-PASSO-VERTHO.md · docs/CUSTO-QUALIDADE.md · docs/SECURITY-STATUS.md
docs/CATALOGO-PROMPTS-IA.md · docs/MODULOS-BASE-CONTEUDO.md · docs/PORTAL-REPRESENTANTE.md
docs/GERADOR-VIDEO-MODULO.md · docs/DESIGN-SYSTEM.md · docs/RESUMO.md
docs/FEATURES-E-BENEFICIOS.md · docs/SIMULADOR-VENDAS.md · docs/SIMULADOR-LIDERANCA.md
docs/simuladores-validacao.md · docs/recepcao-medica.md · docs/ORCAMENTO.md
docs/FLUXO-DE-DADOS-PESSOAIS.md
```

Decisões do dono em 22/09/2026: os simuladores entram (`recepcao-medica.md` é o doc do Simulador de
atendimento); `BETO-CANAIS.md` NÃO entra; `LEVANTAMENTO-2026-07.md` e `plano-refatoracao-final.md`
saíram (retratos de julho). O Project é usado para pitch, proposta e material comercial: quando um
doc de produto muda, o `FEATURES-E-BENEFICIOS.md` é o primeiro a conferir.

🔴 **NÃO use `git diff` da rodada como filtro.** Ele só enxerga o que EU mudei, e a defasagem se
acumula de outras sessões e do trabalho do dono. Compare **as 20 contra o Project**, sempre — o card
mostra **kB de CARACTERES** (`git show HEAD:<arq> | wc -m`, ÷ 1000; `wc -c` erra para mais em 3-4%
por causa dos acentos), e a unidade já mudou uma vez: confirme num card antes de comparar.

`Medido: 27/08/2026` — pelo diff da rodada eu subiria 4 arquivos; comparando as 16, apareceram **3
defasadas que o diff não pegava** (`CATALOGO-PROMPTS-IA.md` com **301 linhas** de atraso), e duas das
4 estavam muito piores que a rodada explicava: `CUSTO-QUALIDADE.md` com **545 linhas no Project
contra 1.436** no repo. `Medido: 31/08/2026` — **15 das 16 defasadas**, numa rodada que tocou em 2.

Subir e remover são ações minhas, pela extensão do Chrome, **sem pedir ok**. 🔑 **Autorização
durável do dono (26/09/2026): "sempre autorizar a remoção de arquivos antigos"** nesta
sincronização. Ela cobre SÓ a versão antiga de uma fonte que acabei de subir de novo, e vale com
as travas da receita: a versão nova já aparece com o kB do repo (página recarregada); o nome está
DUPLICADO no momento do clique; o card clicado tem o kB ANTIGO esperado; e o fecho recarregado
conta exatamente 20, um por nome. Arquivo que não tem par novo (inclusive um que pareça sobrar)
NÃO entra na autorização: esse continua pedindo ok.

Por que importa: uma fonte defasada é pior que fonte ausente — ela responde com autoridade sobre um
sistema que já mudou, e fora do Claude Code não há repositório para conferir.

## 4. Guarda (se o aprendizado foi um bug)

Aprendizado que só vive em prosa volta a acontecer. Se dá pra escrever um teste, escreva em `tests/unit/` — e **valide por mutação**: quebre a invariante no código de produção e confirme que o teste correspondente falha. Teste que nunca falhou não prova nada.

**Se não dá pra escrever teste** (a armadilha é de processo, não de código), acrescente um gatilho em `.claude/skills/checklist/gatilhos.md` — padrão que casa · o que conferir · a consequência medida + data. É o que faz a próxima mudança na mesma área encontrar a conferência sozinha, em vez de depender de alguém lembrar.

## 5. Deploy

Siga a skill `deploy` (build-first, `git add` SELETIVO — nunca `-A`/`.` —, `git push origin master`, nunca `vercel --prod`, Trigger.dev não sobe no push).

Commite **separado por natureza**: correção num commit, doc noutro. O commit de doc não precisa de build.

### 5.1 Faxina dos worktrees (depois do push, nunca antes)

A faxina é **automática e sem perda** (`C:/GAS/Vertho App/.claude/hooks/worktrees-limpar.js`, fora do repo): o hook `SessionEnd` remove o `catraca-<sid>` desta sessão e o `SessionStart` varre os ociosos (catraca 3 dias, manual 7). O que o automático **não** alcança a tempo é o worktree **manual que EU criei nesta rodada**: ele só sairia daqui a 7 dias. Então, ao fechar e **só depois do push**:

```bash
node "C:/GAS/Vertho App/.claude/hooks/worktrees-limpar.js" --nome <pasta-do-worktree> --aplicar
```

Ele só remove se o trabalho já estiver no `origin/master` (sem commit único em risco), sem arquivo sujo real e sem link desconhecido, e faz a ordem segura (junção do `node_modules` antes do worktree, sentinelas do `node_modules` real conferidas a cada passo). **Saiu com 3 = recusou**, e o motivo vem na saída: resolva (suba ou descarte de propósito) em vez de forçar. Se faltar `node_modules` real ou a sentinela mudar, ele aborta a rodada inteira e não apaga nada.

🔴 **NUNCA** `git worktree remove --force`, `Remove-Item -Recurse` ou `rm -rf` à mão num worktree com `node_modules` por junção: o recursivo segue o link e apaga o `node_modules` REAL, derrubando todas as sessões. Os worktrees fora de `.worktrees/` (scratchpad, `~/codex-worktrees`, `~/work`) não são alcançados pela faxina: quem os criou os remove.

O `SessionStart` avisa quais worktrees ficaram **com trabalho** (sujos ou com commit único) e por isso a faxina não os tocou. Esses não saem sozinhos de propósito: commite/suba ou descarte, senão ficam parados e atrasados. `Medido: 08/10/2026`: o acúmulo era de um worktree por sessão que ninguém removia (59 → 44 numa faxina manual, e 3 dias antes tinha sido 79 → 42).

## 6. Fechar em voz alta

Termine dizendo, em uma linha cada:

1. o que foi gravado na memória;
2. quais `.md` mudaram;
3. **o resultado da sincronização do Project** — quantas das 20 estavam defasadas, quais subi e a contagem antiga → nova de cada uma. Fechar contando: tem que sobrar **exatamente 20**, um por nome. Se parei antes de remover as velhas (trava que não bateu), dizer isso explicitamente e por quê;
4. **a faxina de worktrees**: os que removi com `--nome` (e a saída 0/3 de cada) e os que ficaram com trabalho, com o motivo;
5. o que **ficou aberto**: o que você não conseguiu verificar.

O que não foi medido tem que sair rotulado como não medido.
