---
name: checklist
description: Monta o checklist ESPECÍFICO de uma mudança — o que conferir antes de mexer, antes de subir e depois do deploy — derivado dos arquivos e áreas que ela toca, em vez do checklist genérico. Use quando o usuário disser "faz o checklist disso", "o que eu preciso conferir", "o que pode quebrar aqui", antes de uma mudança grande/arriscada, ou antes de deployar algo que passa por área com armadilha conhecida. A tabela de roteamento (arquivo tocado → conferência obrigatória) fica em gatilhos.md, ao lado.
user-invocable: true
---

# Checklist da mudança

Repo: `C:\GAS\Vertho App\nextjs-app` (sempre `git -C "<repo>"`, nunca `cd ... && git`).

O checklist **fixo** já existe e cobre o que é igual em toda mudança: `docs/CHECKLISTS.md` §1
(deploy) e §2 (mudança grande). Esta skill produz o que ele não tem como ter: os itens que só
existem **porque esta mudança toca esta área** — e que, num checklist único de 200 linhas,
ninguém leria.

## 1. Determine o escopo

**Mudança já em andamento** (o caso comum):

```bash
git -C "C:\GAS\Vertho App\nextjs-app" status --porcelain
git -C "C:\GAS\Vertho App\nextjs-app" diff --name-only          # unstaged
git -C "C:\GAS\Vertho App\nextjs-app" diff --name-only --cached  # staged
```

⚠️ O dono edita o repo em paralelo. Separe o que é **seu** do que é dele antes de montar o
checklist — pedir conferência do trabalho alheio é ruído, e assumi-lo como seu é pior.

**Mudança ainda por fazer:** peça (ou infira do pedido) os arquivos/áreas alvo. Sem lista de
arquivos, case os gatilhos pelos **termos** do pedido — pior que casar demais é casar de menos.

## 2. Case os gatilhos

Leia **`gatilhos.md`** (esta pasta) e colete **todos** os gatilhos que casam com os arquivos ou
com o assunto. Um arquivo casa vários; uma mudança pequena pode casar seis.

Não filtre por palpite ("acho que aqui não se aplica"). Quem filtra é a **resposta do comando** —
é para isso que cada gatilho carrega um comando que pode falhar. Descartar antes de rodar é
exatamente como se declara fechado por leitura.

## 3. Monte o checklist

Cada item tem **três partes**, nesta ordem:

```
[ ] 🔴 <o que tem que ser verdade>  →  <comando que pode falhar>
       └ se não: <a consequência conhecida, uma linha>
```

- A **consequência** não é enfeite: é o que faz alguém rodar o comando em vez de marcar o `[ ]`.
  Ela vem medida do gatilho — não invente uma.
- 🔴 = **bloqueante** (já custou incidente; subir com isso quebrado é reincidência).
- Agrupe em três blocos, porque o custo de descobrir tarde é diferente em cada um:
  - **A. Antes de escrever código** — decisões que ficam caras depois (escopo, gêmeo que roda,
    que régua do servidor lê o campo, existe tenant onde o pré-requisito nunca é satisfeito).
  - **B. Antes do commit/push** — build, typecheck, guards, allowlist, numeração.
  - **C. Depois do deploy** — o que só se prova em produção (SHA, rota real, efeito persistido).

**Base fixa:** não copie `docs/CHECKLISTS.md` para dentro do checklist gerado. Cite-o em uma linha
(`base: docs/CHECKLISTS.md §1`) e traga para o corpo **só os itens dele que esta mudança torna
críticos** — ex.: migration nova ⇒ o passo de aplicar; task Trigger ⇒ o deploy manual.

Alvo de tamanho: **5 a 15 itens**. Passou disso, ou o escopo é grande demais para uma rodada, ou
você está transcrevendo doc em vez de rotear.

## 4. Se o usuário pedir para executar

Rode os comandos e marque cada item com o **resultado medido**, nunca com "ok":

```
[x] 🔴 numeração livre → maior N em migrations/ = 211; criei 212
[ ] ❌ guard de tenant → tenant-read-guard falhou em actions/x.ts:44
```

O que você não rodou fica `[ ]` e sai **listado no fim como não verificado**. Checklist entregue
com itens marcados por presunção é pior que checklist nenhum — ele transfere confiança sem prova.

## 5. Manutenção (a parte que faz a tabela continuar valendo)

Gatilho nasce de **incidente real**, nunca de especulação — tabela inflada com hipótese deixa de
ser lida, e aí não protege nada. Quando uma rodada ensinar uma armadilha nova de área, acrescente
a linha em `gatilhos.md` com: padrão que casa · o que conferir · **a consequência medida + data**.

A skill `fechar` chama isto no passo 4: quando o aprendizado não vira teste, ele tem que virar
gatilho — senão volta a acontecer. E se um gatilho precisou de mais de duas linhas para ser
explicado, o lugar dele é o doc canônico: `gatilhos.md` **roteia**, não ensina (§0 de lá).
