# Sincronizar as 16 fontes do Project (claude.ai)

Chamado pelo passo 3.1 do `SKILL.md`. **Não é aviso — é execução.** O único ponto que pede
confirmação está marcado.

Fonte de Project não se atualiza sozinha: fica congelada na versão subida, e **fonte defasada é pior
que fonte ausente** — ela responde com autoridade sobre um sistema que já mudou, e fora do Claude
Code não há repositório para conferir.

## 🔴 Compare TUDO, não só o que a rodada tocou

O erro que esta receita existe para impedir: usar `git diff` do range da rodada como filtro. Isso só
enxerga o que **eu** mudei, e a defasagem se acumula de rodadas anteriores, de outras sessões e do
trabalho do Rodrigo.

`Medido: 27/08/2026` — pelo `git diff` da rodada eu teria subido 4 arquivos. Comparando as 16 contra
o Project apareceram **3 defasadas que o diff não pegava**, entre elas `CATALOGO-PROMPTS-IA.md` com
**301 linhas** de atraso. E duas das 4 estavam muito piores do que a rodada explicava:
`CUSTO-QUALIDADE.md` tinha **545 linhas no Project contra 1.436** no repo, e o `CLAUDE.md`, 424
contra 511. (Números em LINHAS porque era a unidade que a UI mostrava então — ver abaixo.)

`Medido: 31/08/2026` — **15 das 16 defasadas** numa rodada em que eu tinha tocado em 2 arquivos.
Nunca confie no tamanho da rodada para estimar o tamanho da defasagem.

**A comparação é sempre das 16 contra o Project, toda vez.**

## Como a contagem casa — é **kB**, não linhas (mudou em algum ponto até 31/08/2026)

O card mostra o **tamanho em kB** do arquivo como foi subido, com **1 casa decimal** e vírgula
decimal (`153,9 kB`); quando o decimal é zero, a UI o omite (`145 kB` = 145,0). É por esse número
que se identifica qual card é o velho e qual é o novo quando os dois coexistem com o mesmo nome.

A régua é **caracteres ÷ 1000** (`wc -m`, não `wc -c`) do blob do git, e não do arquivo no disco.
`Medido: 31/08/2026` — bate nos 6 conferidos, e **bytes erra para mais em 3-4%** porque estes docs
são cheios de acentos e emoji, que em UTF-8 ocupam 2-4 bytes por caractere:

| | CLAUDE.md | ARQUITETURA.md | CUSTO-QUALIDADE.md | PORTAL-REPRESENTANTE.md |
|---|---|---|---|---|
| card | **64,2** | **151,6** | **92,9** | **21,3** |
| `wc -m` ÷ 1000 | 64,2 ✅ | 151,6 ✅ | 92,9 ✅ | 21,3 ✅ |
| `wc -c` ÷ 1000 | 66,2 ❌ | 157,7 ❌ | 96,1 ❌ | 21,9 ❌ |

```bash
cd "C:/GAS/Vertho App/nextjs-app"
for f in CLAUDE.md docs/ARQUITETURA.md docs/PIPELINE-TRILHA.md docs/FMEA-PIPELINE.md \
         docs/PASSO-A-PASSO-VERTHO.md docs/CUSTO-QUALIDADE.md docs/SECURITY-STATUS.md \
         docs/CATALOGO-PROMPTS-IA.md docs/MODULOS-BASE-CONTEUDO.md docs/PORTAL-REPRESENTANTE.md \
         docs/GERADOR-VIDEO-MODULO.md docs/DESIGN-SYSTEM.md docs/RESUMO.md \
         docs/FEATURES-E-BENEFICIOS.md docs/LEVANTAMENTO-2026-07.md docs/plano-refatoracao-final.md; do
  awk -v n="$(basename $f)" -v c="$(git show HEAD:$f | wc -m)" 'BEGIN{printf "%-30s %.1f kB\n", n, c/1000}'
done
```

🔴 **`git show HEAD:` não é frescura — é o que torna a comparação estável, por dois motivos.**
(1) **CRLF infla o card.** O `\r` conta como caractere, e o working tree no Windows tem CRLF: subir
do disco soma ~1 por linha (`ARQUITETURA.md`: +2,3 kB em 2.328 linhas). Um card subido do disco
comparado com um número calculado do blob dá "defasado" para arquivo idêntico — e o inverso também:
"igual" pode ser o conteúdo novo compensando exatamente os `\r` do velho.
(2) **O disco pode estar no meio de uma edição de outra sessão** — o commit não
([[feedback_guard_varre_tracked]], quarta variante). Suba o que está no `HEAD`, sempre.

⚠️ Tolerância: 0,1 kB é arredondamento, não defasagem. Diferença ≥ 0,2 kB é conteúdo diferente —
**desde que os dois lados tenham a mesma quebra de linha.** Enquanto houver card antigo subido do
disco, a comparação é aproximada; depois de uma rodada inteira subida via `git show`, ela é exata.

## O passo a passo

1. **Ler o Project.** Abrir `https://claude.ai/projects` → **Vertho.ai** → seção **Contexto**
   (a URL do projeto é estável: `/project/019c7614-e003-719c-89ba-681693339e87`).
   `find` com *"markdown file button with size in Context"* devolve os 16 com os tamanhos; para a
   lista que DECIDE, use `get_page_text` (a seção Contexto sai em lista, nome + kB).
2. **Comparar** com a tabela do comando acima. Defasado = tamanho diferente por ≥ 0,2 kB.
3. **Copiar** os defasados para uma pasta da sessão (`file_upload` só aceita arquivos que a sessão
   compartilha — caminho do repo é recusado). Copie **do git, não do disco**, para o card bater com
   a régua e para não subir a edição pela metade de outra sessão:

   ```bash
   D="<scratchpad>/project-sync"; mkdir -p "$D"; rm -f "$D"/*.md
   for f in <os defasados>; do git show HEAD:$f > "$D/$(basename $f)"; done
   ```
4. **Subir.** `find` *"file input element for uploading files to project context"* devolve **dois**
   inputs: o do chat e o do Context. **Use o do Context** — o outro anexa a mensagem, não ao projeto.
   Dá para subir vários numa chamada só (10 MB por chamada).
5. **Conferir antes de apagar.** As novas têm que aparecer com o tamanho esperado, convivendo com
   as velhas. Se o tamanho não bateu, **pare** — não remova nada.
6. **⚠️ Remoção é irreversível: peça o ok do Rodrigo aqui**, listando o que vai sair (nome +
   tamanho antigo → novo). Só então remova.
7. **Remover as velhas.** O botão só existe no **hover**, e clicar nele por COORDENADA é o caminho
   que falha. Use o `aria-label="Excluir"`, achando o card pela **posição na lista** — os cards
   ficam num `<ul>`, um `<li>` por arquivo, **os mais recentes no topo**:

   ```js
   const getUl = () => [...document.querySelectorAll('ul')]
     .find(u => /\.md/.test(u.innerText) && /kB/.test(u.innerText));
   const nome = li => (li.innerText || '').trim().split('\n')[0].trim();

   const itens = [...getUl().children];
   const contagem = {};
   itens.forEach(li => { const n = nome(li); contagem[n] = (contagem[n] || 0) + 1; });
   // último índice de um nome DUPLICADO = a versão velha (as novas estão no topo)
   let alvo = -1;
   for (let i = itens.length - 1; i >= 0; i--) if (contagem[nome(itens[i])] > 1) { alvo = i; break; }
   if (alvo === -1) 'nada duplicado — fim';
   else {
     [...itens[alvo].querySelectorAll('button')]
       .find(b => b.getAttribute('aria-label') === 'Excluir').click();
   }
   ```

   🔑 **A régua é a POSIÇÃO, não o tamanho** — e isso não é preferência: em 31/08 **6 dos 15 pares
   tinham kB idêntico** (a versão nova em LF pesando o mesmo que a velha em CRLF de um conteúdo um
   pouco menor), então filtrar pelo texto do card não distingue as duas e removeria no escuro.
   Só remova quando o nome aparecer **2+ vezes**: assim nunca sobra zero.

   O botão nasce com `opacity-0` e só aparece no hover, mas `.click()` funciona sem hover nenhum, e
   a remoção é imediata — **não abre diálogo de confirmação**. Remova **um por vez** com ~1,1 s
   entre cliques e re-liste entre eles; um laço que recalcula a lista a cada passo faz os 15 sem
   intervenção.

   🔴 **Por que coordenada falha: a screenshot NÃO está na escala da página.** Medido 29/08/2026 —
   `window.innerWidth = 1700` com screenshot de 1568 e `devicePixelRatio = 1,13` (zoom do
   navegador). Quatro cliques erraram o alvo, e **três deles abriram uma conversa da coluna do
   meio** em vez de remover, porque x≈992 cai na coluna central da página. Pior: `hover` com `ref`
   faz `scroll_to` implícito, então a coordenada lida na screenshot anterior já está velha quando o
   clique sai. Se insistir em coordenada, leia o rect por JS **no mesmo instante** do clique — mas
   o `.click()` acima dispensa isso.
   🔑 Clicar no `ref` do botão "Remove" **não funciona** — testado em 27/08, o clique não surte
   efeito e a lista continua intacta. E clicar no card **abre a visualização**, não o menu.
8. **Fechar contando.** Ao final tem que haver **exatamente 16**, um por nome, todos com o tamanho
   do repo. Duplicata sobrando é pior que arquivo velho: o Project passa a responder com as duas
   versões. O fecho barato, num comando:

   ```js
   const itens = [...getUl().children].map(li => li.innerText.replace(/\s+/g, ' ').trim());
   const nomes = itens.map(t => t.split('.md')[0]);
   'TOTAL=' + itens.length + ' | duplicados=' + (nomes.length - new Set(nomes).size);
   ```

## Armadilhas registradas

- **`find` com query genérica mente por omissão.** *"context file cards"* devolveu 4 elementos quando
  havia 18; *"markdown file button with line count in Context"* devolveu os 18. Antes de concluir que
  algo sumiu, refaça a busca com a query que já funcionou. ⚠️ Em 31/08 essa query envelheceu junto
  com a unidade: a que devolve os 16 hoje é *"markdown file button with size in Context"*, e, logo
  após um upload, o `find` chegou a devolver **1** elemento (página em reflow) — recarregue a página
  antes de concluir qualquer coisa.
- **`javascript_tool` pode voltar `[BLOCKED: Cookie/query string data]`** quando o script devolve
  texto grande da página do claude.ai. Devolver só o que decide (contagens, um nome por vez) passa;
  despejar a lista inteira não. `get_page_text` continua funcionando para a leitura completa.
- **Confirme a remoção pela LISTA, não pelo clique.** O primeiro clique de remoção que dei não teve
  efeito nenhum e eu quase segui em frente. Re-listar depois de cada remoção é o que separa
  "removido" de "achei que removi".
- **Capacidade do projeto sobe durante a operação** (13% → 21% com as duplicatas). Ela só volta ao
  normal depois de remover as velhas — não é sinal de erro no meio do caminho.
- 🔴 **O upload pode criar um card A MAIS, e o card extra aparece DEPOIS da conferência.** Medido
  29/08/2026: subi 2 arquivos, conferi logo em seguida e vi 17 cards (16 + as 2 novas menos uma que
  o `find` truncou) — parecia certo. Minutos depois havia **19**: o `CLAUDE.md` novo estava lá
  **duas vezes**, com a mesma contagem. Contar 16+N e achar o total plausível não basta: conte
  **por nome**, e um nome com duas contagens IGUAIS é duplicata do seu próprio upload, não a velha.
  Nesta rodada as remoções foram **3**, não 2.
- ⚠️ **`find` trunca sem avisar** — devolveu 16 quando havia 17, omitindo justamente o
  `MODULOS-BASE-CONTEUDO.md`, e 17 quando havia 19. Para a contagem que DECIDE a remoção, use
  `get_page_text` (a seção Contexto sai em lista, nome + kB) e confira nome a nome contra a
  tabela do repo. O `find` serve para pegar `ref`, não para contar.
- 🔴 **A UI do Project muda de unidade, e a receita envelhece calada.** Até 27/08 o card mostrava
  LINHAS; em 31/08 mostrava **kB**, e o passo 1 desta receita ainda pedia "line count" — o `find`
  respondeu com os tamanhos assim mesmo, então nada quebrou: eu é que teria comparado kB contra
  `wc -l` e chamado tudo de defasado. **Antes de comparar, olhe UM card e confirme a unidade**
  (`get_page_text` ou um screenshot da coluna). Se mudou de novo, conserte esta receita na mesma
  rodada — instrumento que mede na unidade errada é [[feedback_regua_mede_o_instrumento]].
- 🔴 **A régua errada INVENTA defasagem — e eu caí nisso na mesma rodada em que consertei a
  unidade.** Comparei os cards contra `wc -c` (bytes) e conclui **"15 das 16 defasadas"**; com
  `wc -m` (caracteres, a régua certa), **6 dos 15 tinham exatamente o mesmo tamanho do card antigo**
  — justamente os 6 que eu havia marcado como "tamanho idêntico, não dá para distinguir". O sintoma
  de que a régua está errada é esse: **defasagem grande demais, e um viés na MESMA direção em todos
  os arquivos** (aqui, +3-4% em todos, que é a taxa de acentos em UTF-8). Antes de subir 15
  arquivos, valide a régua em UM: se ela não bate exatamente num card que você mesmo acabou de
  subir, ela não é a régua. Subir a mais não faz dano — mas o RELATO fica errado, e é o relato que
  vira a próxima decisão.
- **O X fica no canto superior DIREITO do card** (a versão anterior desta receita dizia esquerdo).
  Ele só aparece no `hover`, e a janela pode mudar de tamanho no meio da operação — refaça o
  `screenshot` antes de cada clique em vez de reaproveitar coordenada.
