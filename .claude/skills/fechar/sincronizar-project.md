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
contra 511.

**A comparação é sempre das 16 contra o Project, toda vez.**

## Como a contagem casa

O Project mostra o total de linhas de cada arquivo, e ele entra com **`wc -l` + 1**. É por esse
número que se identifica qual card é o velho e qual é o novo quando os dois coexistem (têm o mesmo
nome).

```bash
cd "C:\GAS\Vertho App\nextjs-app"
for f in CLAUDE.md docs/ARQUITETURA.md docs/PIPELINE-TRILHA.md docs/FMEA-PIPELINE.md \
         docs/PASSO-A-PASSO-VERTHO.md docs/CUSTO-QUALIDADE.md docs/SECURITY-STATUS.md \
         docs/CATALOGO-PROMPTS-IA.md docs/MODULOS-BASE-CONTEUDO.md docs/PORTAL-REPRESENTANTE.md \
         docs/GERADOR-VIDEO-MODULO.md docs/DESIGN-SYSTEM.md docs/RESUMO.md \
         docs/FEATURES-E-BENEFICIOS.md docs/LEVANTAMENTO-2026-07.md docs/plano-refatoracao-final.md; do
  printf "%-32s repo=%s\n" "$(basename $f)" "$(( $(wc -l < "$f") + 1 ))"
done
```

## O passo a passo

1. **Ler o Project.** Abrir `https://claude.ai/projects` → **Vertho.ai** → seção **Context**.
   `find` com *"markdown file button with line count in Context"* devolve os 16 com as contagens.
2. **Comparar** com a tabela do comando acima. Defasado = contagem diferente.
3. **Copiar** os defasados para uma pasta da sessão (`file_upload` só aceita arquivos que a sessão
   compartilha — caminho do repo é recusado).
4. **Subir.** `find` *"file input element for uploading files to project context"* devolve **dois**
   inputs: o do chat e o do Context. **Use o do Context** — o outro anexa a mensagem, não ao projeto.
   Dá para subir vários numa chamada só (10 MB por chamada).
5. **Conferir antes de apagar.** As novas têm que aparecer com a contagem esperada, convivendo com
   as velhas. Se a contagem não bateu, **pare** — não remova nada.
6. **⚠️ Remoção é irreversível: peça o ok do Rodrigo aqui**, listando o que vai sair (nome +
   contagem antiga → nova). Só então remova.
7. **Remover as velhas.** O botão só existe no **hover**: `hover` no card → `screenshot` → clicar no
   **X** que aparece no canto superior esquerdo.
   🔑 Clicar no `ref` do botão "Remove" **não funciona** — testado em 27/08, o clique não surte
   efeito e a lista continua intacta. E clicar no card **abre a visualização**, não o menu.
8. **Fechar contando.** Ao final tem que haver **exatamente 16**, um por nome, todos com a contagem
   do repo. Duplicata sobrando é pior que arquivo velho: o Project passa a responder com as duas
   versões.

## Armadilhas registradas

- **`find` com query genérica mente por omissão.** *"context file cards"* devolveu 4 elementos quando
  havia 18; *"markdown file button with line count in Context"* devolveu os 18. Antes de concluir que
  algo sumiu, refaça a busca com a query que já funcionou.
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
  `get_page_text` (a seção Context sai em lista, nome + linhas) e confira nome a nome contra a
  tabela do repo. O `find` serve para pegar `ref`, não para contar.
- **O X fica no canto superior DIREITO do card** (a versão anterior desta receita dizia esquerdo).
  Ele só aparece no `hover`, e a janela pode mudar de tamanho no meio da operação — refaça o
  `screenshot` antes de cada clique em vez de reaproveitar coordenada.
