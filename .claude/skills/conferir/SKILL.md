---
name: conferir
description: Confere se uma afirmação sobre o sistema ainda é verdade NO CÓDIGO, antes de declarar algo "fechado", "coberto" ou "resolvido". Use quando o usuário disser "confere isso", "está fechado mesmo?", "isso ainda vale?", antes de responder "N casos corrigidos"/"o guard cobre X"/"já está em produção", ou ao revisar CLAUDE.md/docs/memória contra o repositório. Encodes a régua de procedência, o denominador obrigatório e a receita por tipo de afirmação.
user-invocable: true
---

# Conferir: a afirmação ainda bate com o código?

Repo: `C:\GAS\Vertho App\nextjs-app` (sempre `git -C "<repo>"`, nunca `cd ... && git`).

**A classe de erro que esta skill ataca:** declarar fechado **por leitura**. Você lê o arquivo,
o arquivo está certo, você diz "fechado" — e o que falha é o call-site que você não abriu, o gêmeo
que roda em produção, a linha da allowlist que cresceu, ou o doc que enumerava cobertura e envelheceu.
O sintoma é sempre o mesmo: a afirmação era verdadeira **em algum lugar**, só não no lugar que roda.

Não é revisão de código (`/code-review` faz isso). É verificar **uma afirmação específica**.

## 1. Escreva a afirmação em forma falsificável

Antes de rodar qualquer coisa, reescreva o que se quer conferir como **um número + a população
onde ele foi medido**. Afirmação sem denominador não é conferível — é impressão.

| Como chega | Como tem que ficar |
|---|---|
| "está tudo passando por `tenantDb`" | "0 ocorrências de `.from('<tabela>')` fora de `tenantDb`, em N arquivos varridos" |
| "o guard cobre as tabelas de PII" | "a constante no topo de `<teste>` lista T1…Tn — e a lista de PII é T1…Tm" |
| "fechei os 4 casos" | "o padrão `<X>` devolve 0 no repo tracked (antes: 4)" |
| "já está em produção" | "o SHA do último deployment == `git log -1`" |
| "não achei nada" | **"varri N arquivos/linhas com o padrão P e achei 0"** — sem o N, "não achei" não é resultado |

Se a afirmação não puder virar uma linha dessas, o veredito já é ⚪ (§4) — diga isso em vez de
inventar uma verificação que não decide nada.

## 2. O comando tem que poder falhar

Um check só prova o que você **observou ele fazer**. Antes de aceitar um verde:

- **Quebre a invariante de propósito** e confirme que o comando acusa. Grep que devolve 0 porque o
  padrão está errado é indistinguível de grep que devolve 0 porque está tudo certo.
- **Grepe o CAMPO/valor, não o arquivo.** Arquivo certo com campo errado passa no grep do arquivo.
- **Escolha a população de propósito** — as duas respostas divergem e respondem perguntas diferentes:
  - `git -C "<repo>" grep -n "<padrão>"` → só o **tracked**. É o que os guards de CI enxergam.
  - varredura de disco (Grep tool / `rg`) → o que **existe agora**, incluindo untracked.
  - Guard varre tracked ⇒ conferir **depois** do `git add`. Colisão de migration nasce untracked ⇒
    só a varredura de disco a vê. Usar a errada dá verde falso nos dois sentidos.
- **Com duas sessões no mesmo repo**, o disco se move enquanto você lê: confira o `HEAD` antes e
  depois, e separe o que é seu pelo timestamp.

## 3. Receitas por tipo de afirmação

| Afirmação | Como ela cai na prática | Como conferir |
|---|---|---|
| **"X sempre passa por Y"** (fonte única) | um call-site que não passa; ou uma **2ª cópia** da régua | grepar o mecanismo ALTERNATIVO (não o certo) em todo o repo; contar. A régua nota→nível vivia em 10 cópias |
| **"o guard cobre Z"** | a constante no topo do teste não lista Z; ou o guard **não roda no CI**; ou roda sem permissão e fica cego | ler a CONST do teste (é a fonte, não o resumo no doc) · achar o job no workflow · rodar `npm run test:unit -- <arquivo>` e ver a asserção falhar quando você quebra |
| **"N sites corrigidos"** | existe o N+1 | grep do padrão em todo o tracked; **listar os sobreviventes**, não só contar |
| **"a allowlist só encolheu"** | entrada nova entrou "pra passar o CI" | `git -C "<repo>" log -p -- <allowlist>` e comparar com o commit anterior |
| **"o campo A alimenta a tela B"** | quem entrega é outro caminho (cache × live, overlay, personalizado × genérico) | grepar o **consumidor**, e perguntar qual dos gêmeos o usuário percorre — conserte/meça o que RODA |
| **"está em produção"** | o push não gerou build, sem erro e sem aviso | `mcp__vercel__list_deployments` → `meta.githubCommitSha` vs `git log -1` **antes** de depurar |
| **"0 ocorrências / nenhum erro no log"** | a janela ou o filtro não cobre o caso | dizer o denominador: período, tabela, quantas linhas. E lembrar que **"N ocorrências" ≠ "N pessoas"** — varredura de tela infla contador |
| **"a policy protege"** | policy inerte (predicado sempre NULL) ou **permissiva** (`USING(true)`) | RLS deste app é decorativo por decisão (CLAUDE.md): **não** conte policy como camada; o que decide são guards + código |
| **"o teste cobre"** | o teste olha o agregado, ou o mock hardcoda `error: null` | mutação: quebre a invariante e veja o teste ficar vermelho. Teste que nunca falhou não prova nada |

## 4. Veredito — formato fixo

```
✅ CONFERE      <afirmação> · <medido>/<denominador> · <comando>
❌ DIVERGE      afirmado <X>, medido <Y> · <comando> · sobreviventes: <lista>
⚪ NÃO CONFERÍVEL  <por quê> · o que faltaria para conferir
```

Não existe "parece ok" nem "aparentemente sim". Saída sem número é ⚪, e ⚪ é um resultado legítimo —
o que não pode é passar por ✅. Rotule a procedência do que for para doc/memória: `Medido:` (com o
número e de onde veio), `Suponho:`, `Memória-não-verificada:`.

## 5. O que fazer com um ❌ — as duas correções

A primeira todo mundo faz; a segunda é a que impede o retorno:

1. **Corrigir o lado errado** — o código, ou o doc, se quem estava certo era o código.
2. **Fechar o buraco por onde a divergência nasceu:**
   - Se a afirmação estava num doc/`CLAUDE.md` **enumerando cobertura** ("cobre 5 tabelas"),
     troque a enumeração por um **ponteiro para a fonte** ("a constante no topo de `<teste>`").
     Resumo que enumera cobertura envelhece e vira promessa falsa.
   - Se dá para escrever guard, escreva (`tests/unit/security/`) e **valide por mutação**.
   - Se não dá, acrescente um gatilho em `.claude/skills/checklist/gatilhos.md` — assim a próxima
     mudança na área encontra a conferência sozinha.

## 6. Ao escrever o resultado

- **O repositório é PÚBLICO.** Divergência que revela lacuna de segurança **ainda aberta** não entra
  no repo — vai para fora dele (`audit/`, fora do `nextjs-app`). Fechada e corrigida, pode.
- Terminar dizendo o que **não** foi conferido. Uma conferência que não delimita o que ficou de fora
  é a mesma leitura confiante que criou o problema.
