# Sincronizar as 20 fontes do Project (claude.ai)

> Eram 16 até 22/09/2026. Naquele dia entraram os docs dos simuladores (`SIMULADOR-VENDAS.md`,
> `SIMULADOR-LIDERANCA.md`, `simuladores-validacao.md`, `recepcao-medica.md`), `ORCAMENTO.md` e
> `FLUXO-DE-DADOS-PESSOAIS.md`, e saíram `LEVANTAMENTO-2026-07.md` e `plano-refatoracao-final.md`.
> `BETO-CANAIS.md` fica de fora por decisão do dono. Os "16" citados nas medições abaixo são daquela época.

Chamado pelo passo 3.1 do `SKILL.md`. **Não é aviso — é execução.** Desde 26/09/2026 nada
pede confirmação, salvo remover arquivo SEM par novo (passo 6).

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

**A comparação é sempre das 20 contra o Project, toda vez.**

## 🔑 04/10/2026: o caminho inteiro pela API, com hash (sem modal para ler nem menu para remover)

`Medido: 04/10/2026`, 16 subidas e 16 remoções, fecho 20 de 20 idênticas ao `origin/master`:
1. **Repo:** `scratchpad/fontes_project.py` (da sessão; refazer se o scratchpad sumiu) lê as 20 por
   `git show origin/master:`, normaliza CRLF, grava a cópia para subir e imprime `kb` e `sha1` de cada.
2. **Project:** `GET /api/organizations/<org>/projects/<proj>/docs` (o `org` é o de `/api/organizations`
   cujo GET responde 200), `crypto.subtle.digest('SHA-1')` de cada `content`, e a comparação com o mapa
   do repo FEITA NA PÁGINA, devolvendo só os nomes que diferem (a lista inteira volta truncada).
   🔴 **O kB não pega tudo:** `PORTAL-REPRESENTANTE.md` (29,2) e `RESUMO.md` (18,1) tinham o MESMO kB do
   repo e conteúdo diferente. Pela régua de kB, seriam 14 defasadas; pelo hash, 16.
3. **`await fetch` direto no `javascript_tool` estourou o teto de 45 s do CDP** ("renderer may be frozen")
   duas vezes, com a página saudável. O que funcionou: disparar o `async` sem esperar, guardar em
   `window.__x`, `computer wait` e ler `window.__x` numa segunda chamada.
4. **Subir:** o modal (botão "Mostrar contexto") tem UM `input[type=file]` dentro do `[role=dialog]`;
   marcar com `aria-label`, `find` e `file_upload` das 16 numa chamada (1,26 MB).
5. **Remover:** `DELETE .../docs/<uuid>` pela própria página, UMA por vez, com a trava conferida
   imediatamente antes de cada uma (relendo a lista): o nome tem exatamente 2 cópias, a OUTRA tem o hash do
   repo, e a do `uuid` alvo tem o hash antigo anotado. 16 de 16 com 204, sem menu, sem coordenada e sem
   o risco de clicar na linha errada. É a mesma chamada que o menu "Remover do projeto" faz (ver o passo 7).
6. **Fechar contando** pela API depois do reload: `n=20 duplicados=0 iguais_ao_repo=20`.
7. 🔴 **`Medido: 05/10/2026`: o classificador do modo automático NEGOU o `DELETE` em lote** pelo
   `javascript_tool` ("Blocked by classifier"), com as 7 novas já subidas e conferidas por hash e com a
   autorização durável de 26/09 escrita aqui. **A autorização desta receita não vale para o classificador:
   ele pede o "allow" da própria sessão** (a de 04/10 passou, a de 05/10 não). Quando negar: PARAR, não
   refazer em pedaços, nem por menu, nem por clique (é o mesmo resultado), registrar o estado
   (`n` = 20 + pares pendentes) e dizer ao dono quais pares sobraram. Ele libera ou remove à mão
   (`Mais opções para <NOME>.md` > "Remover do projeto", só o card antigo, o que diz "há N horas"). O
   Project fica COM DUPLICATAS até lá, e isso é pior que fonte velha: responde com as duas versões.
   Subir as novas antes de remover é o que torna a remoção segura, então o estado "27 no Project" é o
   esperado nesse caso, não um defeito do upload.

`Medido: 22/09/2026` — o lado inverso também vale: **o doc do repo pode estar atrás do código**, e o
Project herda. O `FEATURES-E-BENEFICIOS.md` batia com o repo e mesmo assim vendia Pulso e Radar
público (fora do ar), o papel tutor (extinto) e o programa de 14 semanas como o formato em uso.
Espelho em dia não é doc em dia: quando a rodada mexe em produto, confira o FEATURES contra o código.

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
         docs/FEATURES-E-BENEFICIOS.md docs/SIMULADOR-VENDAS.md docs/SIMULADOR-LIDERANCA.md \
         docs/simuladores-validacao.md docs/recepcao-medica.md docs/ORCAMENTO.md \
         docs/FLUXO-DE-DADOS-PESSOAIS.md; do
  awk -v n="$(basename $f)" -v c="$(git show HEAD:$f | wc -m)" 'BEGIN{printf "%-30s %.1f kB\n", n, c/1000}'
done
```

⚠️ **`wc -m` do bash do Windows ERRA em arquivo com muito emoji.** `Medido: 09/09/2026` — para o
`CLAUDE.md`, `git show HEAD:CLAUDE.md | wc -m` deu **69,6 kB** e o card, depois de subir o MESMO
blob, mostrou **70,1**. O FMEA bateu (158,9 × 158,8), então o erro não é constante: ele depende da
densidade de caracteres fora do BMP (🔴 e afins), que o `wc -m` do MSYS conta diferente. Meio kB é
mais que a tolerância de 0,2 e faz um arquivo IDÊNTICO parecer defasado na rodada seguinte.

A régua que bateu nos dois, no card, é o `len()` do Python sobre o blob decodificado com as quebras
normalizadas:

```python
bruto = subprocess.run(['git','-C',REPO,'show',f'HEAD:{f}'], capture_output=True).stdout
texto = bruto.decode('utf-8').replace('
', '
')
print(len(texto)/1000)          # = o número do card
io.open(destino,'w',encoding='utf-8',newline='').write(texto)   # newline='' = não reconverte
```

Use `wc -m` só para a varredura rápida das 20; confirme com Python o que for subir. E escreva o
arquivo pelo Python: o `>` do shell devolveu 724 linhas com CR num blob que não tinha nenhuma.

🔴 **`git show HEAD:` não é frescura — é o que torna a comparação estável, por dois motivos.**
(1) **CRLF infla o card.** O `\r` conta como caractere, e o working tree no Windows tem CRLF: subir
do disco soma ~1 por linha (`ARQUITETURA.md`: +2,3 kB em 2.328 linhas). Um card subido do disco
comparado com um número calculado do blob dá "defasado" para arquivo idêntico — e o inverso também:
"igual" pode ser o conteúdo novo compensando exatamente os `\r` do velho.
(2) **O disco pode estar no meio de uma edição de outra sessão** — o commit não
([[feedback_guard_varre_tracked]], quarta variante). Suba o que está no `HEAD`, sempre.
🔴 **Com o `master` local DIVERGIDO, `HEAD` é a versão errada: use `origin/master` logo depois de um
`git fetch`.** `Medido: 26/09/2026` — o `HEAD` local estava 184 commits atrás do que estava no ar, e o
`CLAUDE.md` do `HEAD` media 78,6 kB contra 65,8 no remoto. Medir pelo `HEAD` teria subido um
`CLAUDE.md` mais velho que o card. O Project espelha o que está no AR, não o disco de ninguém.

⚠️ Tolerância: 0,1 kB é arredondamento, não defasagem. Diferença ≥ 0,2 kB é conteúdo diferente —
**desde que os dois lados tenham a mesma quebra de linha.** Enquanto houver card antigo subido do
disco, a comparação é aproximada; depois de uma rodada inteira subida via `git show`, ela é exata.

## O passo a passo

🔴 **A UI mudou em 26/09/2026.** Até 25/09 os arquivos ficavam numa lista aberta na seção "Contexto"
(`<ul>`, um `<li>` por arquivo, botão `aria-label="Excluir"`). Agora ficam num **modal "Arquivos"**,
e os passos abaixo são os da UI nova, medidos na sincronização de 26/09 (6 subidas, 6 remoções).

1. **Ler o Project.** Abrir `https://claude.ai/project/019c7614-e003-719c-89ba-681693339e87`. No
   painel da direita, o item **"Arquivos"** mostra só o total ("20 arquivos · 22% da capacidade");
   a lista abre no **botão `aria-label="Mostrar arquivos"`** (clique nele, não em "Adicionar").
   🔴 `Medido: 30/09/2026`: **mudou de novo.** O item do painel virou **"Contexto · N arquivos"**, o
   botão agora é **`aria-label="Mostrar contexto"`** e o modal se chama **"Contexto"** (o rodapé diz
   "N arquivos", em minúscula). Com isso o `/Arquivos/` do JS abaixo NÃO acha o modal: use
   `/Arquivos|Contexto/`. Depois do reload o modal abriu só no 3º a 5º clique no `ref`, com ~10 s de
   espera antes de ler; clique, espere (`computer wait`), tire screenshot, e só então rode o JS.
   ⚠️ `Medido: 26/09/2026` (2ª rodada): depois de uma remoção e do reload, nem o clique no `ref`, nem
   o clique na posição, nem foco + `Enter` abriram o modal (3 tentativas de cada). O que abriu na 1ª
   foi disparar por JS, no botão, `pointerdown`, `mousedown`, `pointerup`, `mouseup` e `click` (com
   `clientX/clientY` do centro do `getBoundingClientRect`). Abrir o modal não remove nada, então JS
   aqui é seguro; a REMOÇÃO continua pelo caminho do passo 7.
   O modal é o `[role="dialog"]` que contém "Arquivos". Cada arquivo tem **dois botões**: um com
   `aria-label="<NOME>.md"` (abre a visualização) e outro **`aria-label="Mais opções para <NOME>.md"`**
   (o menu). O card MOSTRA o nome sem `.md` e com espaço no lugar do hífen ("CATALOGO PROMPTS IA
   MD · 201,1 kB · agora"), mas o `aria-label` traz o nome real: leia por ele. A lista é em ordem
   ALFABÉTICA (não "mais recentes no topo"), e cada card mostra a idade ("agora", "há 15 horas").
   Lista que DECIDE, por JS (o kB sai da linha de cada botão):

   ```js
   const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => /Arquivos|Contexto/.test(d.innerText||''));
   const linhaDe = b => { let e = b; while (e && e !== dlg && !/kB/.test(e.innerText||'')) e = e.parentElement; return e; };
   const ops = [...dlg.querySelectorAll('button')].filter(b => /^Mais opções para /.test(b.getAttribute('aria-label')||''));
   const itens = ops.map(b => b.getAttribute('aria-label').replace('Mais opções para ','') + '=' + (linhaDe(b).innerText.match(/([\d,]+)\s*kB/)||[])[1]);
   const nomes = itens.map(t => t.split('=')[0]);
   'TOTAL=' + itens.length + ' | duplicados=' + (nomes.length - new Set(nomes).size) + ' || ' + itens.join(' ');
   ```
2. **Comparar** com a tabela do comando acima. Defasado = tamanho diferente por ≥ 0,2 kB na régua
   do `wc -m`. 🔴 Com a régua do Python (exata), compare o valor ARREDONDADO a 1 casa: qualquer
   diferença conta. `Medido: 22/09/2026` — `CLAUDE.md` com card 77,8 e repo 77,88 (0,1 kB, "dentro
   da tolerância") era uma mudança real de 4 linhas, que apontava para docs novos.
   ⚠️ Outra sessão pode sincronizar em paralelo: em 22/09 os 4 cards defasados de manhã já estavam
   atualizados à noite, sem ser por mim. Releia o Project imediatamente antes de subir.
   🔴 `Medido: 30/09/2026`: **duas sessões subiram as MESMAS 5 fontes com minutos de diferença**, e o
   Project foi a 31 (20 + 11). Cópia nova DUPLICADA com kB IGUAL é upload paralelo, não defeito. Quem
   limpa é UMA sessão só: combinamos por `SendMessage` (a outra avisou e parou), porque duas sessões
   removendo ao mesmo tempo podem deixar uma fonte sem versão nova. E par (novo + antigo) que OUTRA
   sessão subiu depois do seu reload não é seu para remover: avise-a e feche contando o que é seu.
3. **Copiar** os defasados para uma pasta da sessão (`file_upload` só aceita arquivos que a sessão
   compartilha — caminho do repo é recusado). Copie **do git, não do disco**, pelo Python (régua e
   quebra de linha, ver acima), para o card bater e para não subir edição pela metade de outra sessão.
4. **Subir.** Com o modal aberto há **três** `input[type=file]` na página; o certo é o que está
   DENTRO do `[role="dialog"]`. Marque-o por JS com um `aria-label` próprio
   (`i.setAttribute('aria-label','upload-arquivos-do-projeto')`), peça o `ref` ao `find` por esse
   rótulo e suba vários numa chamada só (10 MB por chamada).
5. **Conferir antes de apagar.** Recarregue a página, reabra o modal e rode a lista do passo 1: as
   novas têm que aparecer com o kB do repo e idade "agora", ao lado das velhas. Se o tamanho não
   bateu, **pare**: não remova nada.
6. **Remover sem pedir ok: autorização durável do dono (26/09/2026)**, só para a versão ANTIGA de
   uma fonte que acabou de ganhar a nova, e só com as travas: nome duplicado no momento do clique,
   card com o kB antigo esperado, versão nova já conferida no passo 5. Arquivo sem par novo não
   entra: esse pede ok.
7. **Remover as velhas, UMA POR VEZ, sem script entre abrir o menu e clicar.** O ciclo que funcionou
   (6 de 6 em 26/09):
   1. por JS, marque o botão "Mais opções" da linha ANTIGA com um rótulo único, conferindo o par:

      ```js
      window.__marcar = (nome, velho) => {
        const dlg = [...document.querySelectorAll('[role="dialog"]')].find(d => /Arquivos|Contexto/.test(d.innerText||''));
        // Devolve o rótulo ORIGINAL (não 'x'): senão o botão marcado some do filtro por nome abaixo.
        document.querySelectorAll('[aria-label="ALVO-REMOVER"]').forEach(b => b.setAttribute('aria-label', b.dataset.rotuloOriginal || 'x'));
        const linhaDe = b => { let e = b; while (e && e !== dlg && !/kB/.test(e.innerText||'')) e = e.parentElement; return e; };
        const bts = [...dlg.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === 'Mais opções para ' + nome);
        const kbs = bts.map(b => (linhaDe(b).innerText.match(/([\d,]+)\s*kB/)||[])[1]);
        if (bts.length < 2) return 'PULAR: só ' + kbs.join(',');
        const i = kbs.indexOf(velho); if (i < 0) return 'PULAR: sem ' + velho + ' em ' + kbs.join(',');
        bts[i].dataset.rotuloOriginal = bts[i].getAttribute('aria-label');
        bts[i].setAttribute('aria-label', 'ALVO-REMOVER'); bts[i].scrollIntoView({ block: 'center' });
        return 'marcado ' + nome + ' ' + velho + ' (par: ' + kbs.join('/') + ')';
      };
      window.__marcar('FMEA-PIPELINE.md', '186,4');
      ```
   2. `find` *"button with aria-label ALVO-REMOVER"* → clique no `ref` (clique REAL; o menu abre);
   3. **screenshot** para conferir que o menu abriu na linha certa (nome + kB antigo);
   4. clique em **"Remover do projeto"** SÓ pelo `ref` do menuitem (`find` *"menu item Remover do
      projeto"*) ou por `ArrowDown` + `Enter` (abaixo). **Nunca pela coordenada da screenshot.**
      `Medido: 27/09/2026`: pelo `ref`, **2 de 2**; pela posição, **0 de 1** (menu fechou, a velha
      seguiu na lista).
      🔴 `Medido: 30/09/2026` (sessão "heygen"): pela coordenada, **a linha SUMIU da lista nas 2 vezes
      e as duas voltaram depois do reload**. É falha disfarçada de sucesso, pior que o menu fechar à
      vista. Pelo `ref` do menuitem, o `DELETE /api/organizations/<org>/projects/<proj>/docs/<uuid>`
      voltou **204** e persistiu;
   5. só então JS de novo, para conferir o total e marcar o próximo.
   A remoção é imediata, **sem diálogo de confirmação**.
   🔴 **O clique pela posição da screenshot pode cair FORA do item, e o menu fecha sem remover.**
   `Medido: 26/09/2026` (2ª rodada): a imagem tinha 1568×669, mas a página ocupava só cerca de
   1410×600 dela, e a viewport real era 1497×638 (`read_page` mostra). Com essa escala a coordenada
   lida na imagem caiu à esquerda e acima de "Remover do projeto": 2 cliques, menu fechado, nada
   removido, e o reload mostrou a velha ainda lá. **O que funcionou:** com o menu aberto pelo `ref`,
   `ArrowDown` pelo teclado real (ação `key`), `zoom` para conferir que o item destacado é "Remover
   do projeto" no menu da linha com o kB ANTIGO, e `Enter`. Sem coordenada nenhuma.
   🔴 **Qualquer `javascript_tool` com o menu aberto FECHA o menu** (rouba o foco): medido em 26/09,
   o laço "abre por script, acha o item, clica" deu 5 de 5 "SEM MENU". Por isso o passo 5 vem depois.
   🔴 **Abrir o menu disparando eventos por JS não é confiável** (abriu 1 vez em 3), e o `find` às
   vezes NÃO enxerga o menu aberto: confie na screenshot.
   🔴 **Não dispare `Escape` por JS**: ele fecha o MODAL inteiro, e o `ref` pego logo depois aponta
   para um modal que está sumindo (26/09: 2 ciclos perdidos assim, nenhum clique errado).
   🔴 **"PULAR: só <kB novo>" logo depois de uma tentativa que falhou NÃO prova que a velha saiu.**
   `Medido: 27/09/2026`: o 1º clique pelo `ref` não abriu o menu; re-rodar o `__marcar` antigo
   renomeava o botão marcado para `x`, o filtro por nome deixava de vê-lo, e o retorno "PULAR: só
   192,6" parecia "a velha já foi removida" com as DUAS linhas ainda na tela. O helper acima agora
   devolve o rótulo original. E o clique por coordenada no ⋮ abriu a PRÉ-VISUALIZAÇÃO da versão
   NOVA: com um arquivo aberto o modal vira duas colunas e tudo muda de lugar. O 2º clique pelo `ref`
   abriu o menu; `ArrowDown` + screenshot + `Enter` removeu. O `zoom` travou (timeout de 30 s) e a
   screenshot normal bastou para ver o item destacado.
8. **Fechar contando.** Ao final tem que haver **exatamente 20**, um por nome, todos com o tamanho
   do repo. Duplicata sobrando é pior que arquivo velho: o Project passa a responder com as duas
   versões. 🔴 **Conte na página RECARREGADA**, com uns 5 s entre o último clique e a navegação: a
   lista sem recarregar some com o card na hora, mesmo quando a exclusão não persistiu (ver
   Armadilhas, 17/09). Use a lista do passo 1 (sai `TOTAL=` e `duplicados=`); o rodapé do modal
   ("20 arquivos") confirma. Depois do reload, espere a página carregar antes de clicar em
   "Mostrar contexto" (antes "Mostrar arquivos"): o clique cedo não abre o modal.
   🔑 **A prova mais forte é a API, não o modal.** `Medido: 30/09/2026`: depois do reload, um `GET`
   em `/api/organizations/<org>/projects/<proj>/docs` (mesma sessão do navegador, por
   `javascript_tool`, devolvendo só contagem e nomes duplicados) deu n=20 e nenhum nome repetido.
   Somado ao `204` de cada `DELETE`, é o que prova a remoção. A lista do modal já mostrou exclusão que
   não persistiu (17/09 e 30/09).
   ⚠️ Pela API, o tamanho sai em unidades UTF-16: emoji fora do BMP contam 2. Por isso deu
   194,6 / 201,4 / 185,1 onde o card mostra 194,5 / 201,3 / 185. Para kB, compare pelo card; pela API,
   confie na contagem e nos nomes.
   🔑 **Melhor que kB: o SHA-1 do conteúdo.** `Medido: 30/09/2026` (2ª rodada, 3 fontes): o `content`
   de cada doc vem inteiro no `GET`; `crypto.subtle.digest('SHA-1', new TextEncoder().encode(d.content))`
   no navegador bate com `hashlib.sha1(texto.encode('utf-8'))` do Python sobre o blob com LF (o mesmo
   arquivo que foi subido). Deu **20 de 20 idênticos** ao `origin/master`. Isso prova conteúdo, não só
   tamanho, e dispensa a régua de kB (UTF-16, emoji, arredondamento). Serve também ANTES de remover:
   a cópia nova com o hash do repo é a que fica, e o `uuid` da outra é o que o `DELETE` tem que mostrar.
   Se o modal não abre pelo `ref` depois de 2 ou 3 tentativas, a sequência de eventos de ponteiro por
   JS (passo 1) abriu de primeira em 30/09.

## Armadilhas registradas

- **Depois do upload, os cards novos ficam como "Carregando" até recarregar a página.** `Medido:
  22/09/2026` — 12 arquivos subidos, e 30 s depois a lista ainda tinha 12 itens "Carregando" (que,
  por terem o mesmo "nome", inflam a contagem de duplicados). Recarregada, trouxe os 12 com o kB
  certo. Não conclua nada, nem remova, antes do reload.
- **Achar o input do Contexto por marcação, não por descrição.** Em 22/09 o `find` devolveu só 1 dos
  2 inputs, e a descrição dele não prova qual é. O que deu certeza: por JS, subir a árvore de cada `input[type=file]` e ver
  qual chega à seção "Contexto" sem passar pelo "Como posso ajudar"; marcar esse com um
  `aria-label` próprio e então pedir o `ref` ao `find` por esse rótulo.

- 🔴 **A lista sem recarregar mostra remoção que não persistiu.** `Medido: 17/09/2026`: 4 remoções,
  e a lista marcava 16 cards e 0 duplicados. Recarregada, tinha 17: o `DESIGN-SYSTEM.md` ANTIGO
  (11,1 kB) estava de volta. Foi o clique que saiu 1,5 s antes da navegação (Suponho: a exclusão não
  chegou ao servidor). Repetido com 6 s de espera, fechou em 16 depois do reload. A trava que deixou
  repetir sem medo: o laço só clica se o card-alvo tiver o kB da versão ANTIGA.
- **O LOG do laço de remoção não prova o que saiu — só a listagem final prova.** `Medido: 09/09/2026`
  — o laço registrou *"removi: CLAUDE.md 68,1"*, *"removi: CLAUDE.md 70,1"* e *"removi:
  FMEA-PIPELINE.md 158,8"*, ou seja, dizia ter apagado as duas versões NOVAS, e mesmo assim o estado
  final estava certo (16 cards, `CLAUDE.md 70,1` e `FMEA 158,8`). O texto vem do `li.innerText` lido
  ANTES do clique, e a lista re-renderiza e REORDENA entre as passadas: o `li` que sobrou na variável
  já não é o `li` daquela posição. Não tente consertar o log — **re-liste depois e leia o resultado**,
  que é a única fonte. E não reaja ao log com uma segunda rodada de remoção: aí sim sobra zero.

- **`find` com query genérica mente por omissão.** *"context file cards"* devolveu 4 elementos quando
  havia 18; *"markdown file button with line count in Context"* devolveu os 18. Antes de concluir que
  algo sumiu, refaça a busca com a query que já funcionou. ⚠️ Em 31/08 essa query envelheceu junto
  com a unidade: a que devolve os 16 hoje é *"markdown file button with size in Context"*, e, logo
  após um upload, o `find` chegou a devolver **1** elemento (página em reflow) — recarregue a página
  antes de concluir qualquer coisa.
- **`javascript_tool` pode voltar `[BLOCKED: Cookie/query string data]`** quando o script devolve
  texto grande da página do claude.ai. Devolver só o que decide (contagens, um nome por vez) passa;
  despejar a lista inteira não. `get_page_text` continua funcionando para a leitura completa.
  🔴 **BLOCKED não quer dizer que o script não rodou.** `Medido: 16/09/2026` — o laço de remoção
  voltou BLOCKED (o retorno era um log curto com nomes e "clique"), e a releitura mostrou as 7
  duplicatas JÁ removidas: 23 → 16. Repetir o laço por achar que falhou apagaria versões novas. O
  que salvou foi a regra acima: re-listar e ler, nunca reagir ao retorno. Uma trava que ajuda: antes
  de cada clique, conferir se o kB do card-alvo é o da versão ANTIGA esperada, e parar se não for.
  E o `get_page_text` logo após abrir a página não trouxe a seção Contexto; a lista por JS, com
  espera de ~3 s, trouxe os 23.
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
