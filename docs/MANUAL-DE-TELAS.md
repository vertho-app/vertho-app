# Manual de Telas — guia do administrador

Documentação de **todas as telas do produto** para quem administra a plataforma: o que cada tela
mostra, o que cada controle faz e o que ele muda no sistema. Feito em 10/08/2026.

**114 telas · 1.150 controles · 147 marcados como irreversíveis · 260 pontos de atenção.**

## Onde ele mora (e por que não aqui)

```
C:\GAS\Vertho App\deliverables\manual-telas\     ← FORA do repo
├── manual.html                  navegável: sumário, busca, prints em tamanho real
├── Manual-de-Telas-Vertho.pdf   666 páginas A4
├── img/ · img-web/              capturas originais e as versões leves do HTML
├── dados/                       o JSON por trás de tudo (permite regerar sem reapurar)
└── alvos.json                   ids de tenant e e-mails da captura
```

**O repositório é público.** Os prints são de tenant real (nomes de empresa, de pessoas, dados de
piloto) e o `alvos.json` tem id de tenant e e-mail de equipe. Nada disso entra aqui — só o
ferramental. O modelo do `alvos.json` está versionado em
`scripts/manual-telas.alvos.exemplo.json`.

## Escopo

| Parte | Telas | Onde |
|---|---|---|
| Painel administrativo | 77 | `app.vertho.ai/admin/*` |
| Colaborador e gestor | 25 | subdomínio do tenant (`<slug>.vertho.ai/dashboard/*`) + `/login` |
| Portal do Representante | 12 | `app.vertho.ai/representante/*` |

Fora de propósito: Radar público, CONARH e `radarbett` (aposentado).

## Como regerar

Pré-requisito: copiar `scripts/manual-telas.alvos.exemplo.json` para
`deliverables/manual-telas/alvos.json` e preencher. Sem ele o passo 1 sai com erro explicando o
que fazer.

```bash
node scripts/_capturar-telas-manual.mjs todos   # 1. prints (~25 min, aceita: admin|colab|gestor|rep|publico)
node scripts/_aplicar-correcoes-manual.mjs      # 2. funde telas-*.json + verificacao-*.json → final-*.json
node scripts/_montar-manual-telas.mjs           # 3. manual.html + img-web/ (sharp)
node scripts/_manual-telas-pdf.mjs              # 4. PDF A4
node scripts/_ver-manual.mjs                    # 5. prints do próprio manual, para conferir a diagramação
```

O passo 2 é opcional: sem `verificacao-*.json` o manual sai com a primeira leitura e **diz na
introdução** que aquele bloco não passou por segunda conferência.

O texto de cada tela (`dados/telas-*.json`) foi produzido por agentes lendo o código, e não é
regerado por esses scripts — só as capturas e a montagem são.

## As três decisões que sustentam o manual

**1. O efeito vem da ACTION, não da tela.** "O que este botão faz" não foi escrito olhando a
interface: cada `onClick` foi seguido até a Server Action ou o endpoint, e o que está documentado é
o que ela grava, apaga ou dispara. É isso que permite a coluna "Volta atrás?" existir. Corolário
operacional: a captura **só navega** — nada que escreve é clicado.

**2. Verificação adversarial.** Depois de escrito, cada um dos 21 blocos passou por um segundo
agente com a tarefa de **derrubar** as afirmações: conferir se o controle existe na linha citada,
se o efeito bate com a action e se o que apaga está marcado. Resultado: **115 correções aplicadas,
9 controles que faltavam, 0 correções órfãs**. `_aplicar-correcoes-manual.mjs` grita quando uma
correção não casa com nenhuma tela/controle — aplicar 8 de 10 e dizer "pronto" é o modo de falha
que ele existe para evitar.

**3. A espera é por ESTADO, não por tempo.** Ver abaixo.

## Pegadinhas medidas (não repetir)

### O e-mail do `ADMIN_EMAILS` fotografa spinner

A primeira leva inteira saiu com a tela girando. Causa: a sessão usava um e-mail que está em
`ADMIN_EMAILS` e não está em `platform_admins`. O layout do `/admin` aceita os dois; **toda Server
Action lê só a tabela**. Resultado: a casca abre e nenhuma carga de dado passa — 403 em 76 rotas,
sem mensagem de erro na tela. Detalhe e decisão pendente: `docs/SECURITY-STATUS.md` §10/08.

**Regra:** `alvos.json → sessoes.admin` tem que ser e-mail **da tabela**.

### Esperar por tempo fixo fotografa o carregamento

`networkidle` + um `waitForTimeout` generoso não basta: as telas do admin carregam por Server
Action depois do idle. A espera certa é por estado — nenhum `.animate-spin` **visível** e o texto
da página parado por 3 amostras — com teto que **marca** a captura como `aindaCarregando: true` em
vez de entregar um print de spinner calado. O manual mostra esse aviso na ficha.

### `object-fit: contain` encaixota a imagem no PDF

Com `width:100%` + altura fixa, o `contain` letterboxeia e encolhe a captura até ficar ilegível no
papel. O certo é deixar a proporção mandar (`width:auto; max-width:100%; max-height:23cm`). E
conferir isso com `page.emulateMedia({ media: 'print' })` — não abrindo o PDF pronto, que é tarde.

### 17 rotas redirecionam

A reorganização do admin absorveu várias telas como **aba** de outra (`escolas` → `ppp?tab=escolas`,
`votacao` → `cargos?tab=votacao`, `ranking` e `calibracao` → `fit?tab=…`, `sem14`/`acumulada` →
`auditorias?tab=…`, `potencial-cidades` → `mercado-potencial`), e `fase0` virou tela morta. Isso não
aparece lendo o código de menu — apareceu porque a captura **percorreu a rota de verdade**. Cada
caso vira um aviso na ficha da tela.

## Os 260 "pontos de atenção"

Divergências que os agentes acharam lendo o código, cada uma com `arquivo:linha`, publicadas na
ficha da tela correspondente. São **observações do manual, não correções** — nada foi alterado no
produto por causa delas. Vale revisar as de gravidade alta: campos gravados com nomes de coluna
inexistentes, filtros por coluna que não existe na tabela, e KPIs procurando rótulos que o servidor
não emite.
