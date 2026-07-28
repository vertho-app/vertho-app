# /board — painel multi-modelo

Ferramenta **interna** (só Rodrigo). Uma pergunta vai para quatro famílias de IA, que respondem
sozinhas, leem umas às outras sem saber quem escreveu o quê e fecham; o Claude compara a primeira
rodada com a última e entrega a resposta.

**Tela:** `/admin/vertho/board` (atrás do gate de platform admin).

## Por que existe um worker

Os quatro modelos rodam pelos **CLIs oficiais autenticados por assinatura** — não por API key:

| | Modelo | CLI | Conta |
|---|---|---|---|
| A | Claude | `claude -p` | assinatura Claude |
| B | gpt-5.6-sol | `codex exec` | plano ChatGPT |
| C | Kimi K3 | `kimi -p` | Kimi for Coding |
| D | Gemini 3.6 Flash | `agy -p` (Antigravity) | conta Google |

Esses CLIs são processos da **máquina do Rodrigo**, com as credenciais dele. A Vercel não os alcança.
Por isso a arquitetura é fila: **a web enfileira, a máquina executa.**

```
/admin/vertho/board  →  board_paineis (status=pendente)  →  worker local  →  4 CLIs
                                    ↑                                          │
                                    └────────── resultado + progresso ─────────┘
```

**Ligar o worker** (precisa estar rodando, senão o pedido fica na fila):

```bash
cd "C:\GAS\Vertho App\nextjs-app"
node --env-file=.env.local scripts/painel/worker.mjs
```

A tela avisa quando um pedido está parado há mais de 2 minutos — quase sempre é o worker desligado,
não painel lento.

## Rodar sem a web

```bash
node scripts/painel/rodar.mjs "<pergunta>" --contexto="C:\Users\rdnav\.claude\painel\contexto\conarh" --saida=r.json
node scripts/painel/_smoke.mjs      # checa os 4 CLIs em ~30s, barato
```

## Contexto

Arquivos de apoio em `~/.claude/painel/contexto/<assunto>/`; na tela, informe só o nome do assunto.
O worker passa os **caminhos** — cada modelo lê o que precisar com as próprias ferramentas, então
arquivo grande não estoura prompt.

⚠️ **PDF/DOCX/XLSX têm suporte desigual entre os CLIs.** Converta para texto o que for decisivo,
senão um modelo lê e outro não, e o painel opina sobre bases diferentes sem ninguém perceber. O
inventário marca esses formatos e avisa no prompt, mas não conserta.

⚠️ **Cure a pasta.** Documento fora do tema custa em toda rodada, para todo modelo. Medido em 27/07:
20 documentos (625 KB) levaram o ciclo a mais de uma hora; com 5 documentos curados (121 KB) a
rodada 1 completa saiu em 5,5 min.

## Desenho — e o que cada regra evita

- **Autores anônimos entre si (A/B/C/D).** Saber que a proposta rival é "do GPT-5" faz a marca pesar
  junto com o argumento. A autoria só aparece no relatório.
- **Só a rodada 1 investiga.** Reler a documentação a cada rodada foi o que inviabilizou a primeira
  versão do formato.
- **Recusa obrigatória na rodada 2.** Convergência sem nenhuma recusa declarada é conformidade, não
  acordo. O alerta é derivado **em código** (`recusas === 0 && disputas === 0`), não pela
  auto-avaliação de um modelo.
- **A síntese recebe R1 e R2 lado a lado**, com a tarefa explícita de resgatar boas ideias que
  morreram no caminho — proposta forte da R1 que some na R2 costuma ter cedido por pressão, não por
  refutação.
- **Motor que cai não vira Claude disfarçado.** O assento some e entra em `presenca.perdidos`; a tela
  diz que o painel não foi completo.

## Contexto por upload

A tela aceita arquivos (arrastar ou escolher). O caminho é **Storage → worker baixa para a máquina →
CLIs leem → pasta temporária apagada no fim**: quem lê são os quatro modelos, que rodam localmente,
então o arquivo precisa existir no disco desta máquina.

Só **texto** (.md, .txt, .csv, .json, código). PDF/DOCX/XLSX são recusados na action — o suporte é
desigual entre os CLIs, e um painel em que um leu e outro não opina sobre bases diferentes sem
avisar. Anexos têm precedência sobre a pasta local: se o pedido trouxe arquivos, é sobre eles.

## Ler o repositório

Os quatro **sempre alcançam o disco** — o que faltava era orientação. A opção "a pergunta é sobre o
código da Vertho" injeta onde procurar (`actions/`, `app/`, `lib/`, `docs/`) e **o que não existe**
(`src/`, `pages/`). Sem isso, uma rodada inteira se perde num caminho inventado.

## 🔴 Permissão em CLI headless: pedir = ser negado

Medido 28/07, e custou dois E2E para aparecer: o **`--add-dir` sozinho não basta** para o
`claude -p`. Em modo headless não existe ninguém para responder a um pedido de permissão, então a
ferramenta é negada em silêncio — o modelo recebe `"you haven't granted it yet"` e responde sem o
dado, sem erro nenhum no processo.

A correção é `--allowedTools Read Glob Grep` (só leitura: nada de Bash, Write ou Edit, que é o que
sustenta a promessa de "permissão de leitura apenas" feita no prompt).

**Como isso passou despercebido:** o primeiro E2E olhava só a síntese. Como a síntese é feita pelo
Claude, ele recebeu o dado de segunda mão dos outros três e o teste passou verde com **1 de 2**
motores tendo lido. O teste agora verifica **autor por autor na rodada 1**, antes de qualquer contato
— e `_leitura.mjs` checa os quatro em ~30s, sem gastar um painel inteiro.

## Armadilhas dos CLIs (todas medidas, todas já embutidas)

- **Prompt nunca vai como argumento.** A partir da rodada 2 ele passa de 80 KB e o `CreateProcess` do
  Windows estoura em ~32 KB (`O nome do arquivo ou a extensão é muito grande`), matando os três
  motores externos de uma vez. Rotas: **claude e codex por stdin**; **kimi e agy recebem o caminho**
  do arquivo (o kimi não lê stdin — `-p -` vira o prompt literal `"-"`).
- **`agy` ignora o cwd**: sem `--add-dir` ele procura no próprio scratch e responde "não achei" —
  parece alucinação, é workspace errado. O diretório temporário dos prompts também precisa entrar.
- **`agy --model` só aceita o LABEL** (`"Gemini 3.6 Flash (High)"`). O ID que o próprio `agy models`
  imprime é aceito, **ignorado em silêncio**, e cai no default do `settings.json`.
- **Busca ampla trava o `agy`** (node_modules/.next). O prompt dele carrega um aviso para escopar.
- **CLI desatualizado parece erro de auth.** O Codex 0.142 recusava o próprio modelo padrão com
  mensagem de versão; `npm i -g @openai/codex@latest` resolveu.

## Tabela

`board_paineis` (migration `192-board-paineis.sql`) — fila e histórico. Sem `empresa_id` de
propósito: não é dado de cliente. **Nunca exponha em rota pública.**

`status`: `pendente` → `rodando` → `concluido` | `erro` | `cancelado`.
`progresso` guarda os eventos do worker, que é o que dá andamento na tela sem websocket.
`custo_usd` é o custo **equivalente** reportado pelo CLI do Claude — referência, não fatura: a
execução é coberta pelas assinaturas.
