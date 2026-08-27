/**
 * Audita a FOLGA de `max_tokens` de cada task contra a saída realmente medida.
 *
 * Por que isto existe (25/08/2026): em modelo de RACIOCÍNIO, `max_tokens` é
 * orçamento COMPARTILHADO entre pensar e escrever — o modelo pensa primeiro e
 * escreve com o que sobra. Teto justo não vira "resposta curta": vira resposta
 * CORTADA no meio, e em JSON isso é parse quebrado.
 *
 * Medido, em quatro famílias diferentes — não é peculiaridade da Anthropic:
 *   · Muse Spark 1.2 · teto 32   → 32/32 em raciocínio, content:"" , finish=length
 *   · Kimi K3        · teto 4000 → 3.997 em raciocínio, content vazio
 *   · Sonnet 5       · teto 4000 → `sim_extracao_qualitativa` truncou 8 de 8
 *   · Qwen3.8        · 41 tokens de saída para responder "OK"
 *
 * 🔑 O ponto que muda a ordem das decisões: quase todos os tetos deste projeto
 * foram dimensionados na era dos modelos que NÃO pensavam (Sonnet 4.6, Gemini
 * Flash, GPT pré-5.x). Trocar o modelo antes de rever o teto reproduz o
 * truncamento — foi o que travou `modulo_base_autor` no 4.6.
 *
 * ⚠️ CORRIGIDO EM 26/08/2026 — a versão anterior fechava dizendo
 * "1 task(s) com folga < 2,5x" **sem denominador**, e o denominador era 4 de 36.
 * Quatro cegueiras empilhadas, todas silenciosas:
 *
 *   1. `.limit(50000)` no ledger devolvia **1.000 linhas de 15.451** — o cap de
 *      `max-rows` do PostgREST não se desliga pelo `.limit()`. E as 1.000 eram
 *      as MAIS ANTIGAS, de antes da migração para Sonnet 5.
 *   2. Teto que não é literal numérico (`IA4_MAX_TOKENS`, `req.maxTokens`) caía
 *      num `continue`. `ia4_avaliacao` — a task com truncamento medido, 59 de
 *      297 — era INVISÍVEL para o auditor dela.
 *   3. `obs.length < 3` descartava 28 tasks sem dizer que descartou.
 *   4. O ledger mistura três populações e a conta usava as três: produção,
 *      SIMULADOR (4.435 linhas) e os scripts de piloto. Em `ia3_cenarios` isso
 *      inflou o p95 de 3.270 para 13.795 — 10 chamadas de um piloto de Qwen
 *      decidindo o teto da produção.
 *
 * A régua nova: **primeiro a cegueira, depois o achado.** O relatório abre com
 * o denominador e com o que NÃO conseguiu avaliar; um teto irresolvível é uma
 * FALHA, não um silêncio.
 *
 * ⚠️ NUANCE, e ela NÃO inverte a decisão. Na geração 5 o thinking é
 * `{type:'adaptive'}` SEM budget próprio (`actions/ai-client.ts:355`), então o
 * teto é o único limite do raciocínio: subir dá mais espaço para pensar, e
 * pensamento é cobrado. No 4.6 o budget é explícito e o teto extra é inerte.
 * Ou seja, subir o teto PODE custar mais — mas o custo é condicional, e o
 * desperdício do teto curto é certo.
 *
 * 🔑 A DECISÃO (Rodrigo, 26/08/2026): **erre para CIMA.** Teto alto com custo
 * maior é preferível ao risco de quebrar um JSON. A assimetria está medida na
 * própria base, em `ia4_avaliacao` no Sonnet 5:
 *
 *   238 chamadas que completaram ..... US$ 26,06  ·  10.242 tokens de saída
 *    59 chamadas que truncaram ....... US$  9,67  ·  16.000 (o teto)
 *
 * As 59 custaram 27% do gasto da tarefa e entregaram ZERO — JSON cortado no
 * meio não é resposta parcial, é parse quebrado. E custaram MAIS por chamada
 * (0,164 contra 0,110) exatamente por correrem até o teto. Um teto folgado
 * teria acrescentado ~4k tokens a cada uma: cerca de US$ 2,36 para evitar
 * US$ 9,67 de desperdício puro, antes de contar o retrabalho e o risco de um
 * artefato corrompido ser persistido. Erra-se para cima com retorno de 4:1.
 *
 * ⚠️ O limite real do teto NÃO é o preço — é a LATÊNCIA. Mas cuidado com a
 * premissa: eu segurei o teto de `modulo_base_autor` em 26/08 dizendo "p95 de
 * 227s contra os 300s da rota, 76% do relógio". Fui conferir e **nenhum dos
 * caminhos que executam essa task tem 300s**: a rota interna declara
 * `maxDuration = 800` e os três consumidores restantes são tasks do Trigger
 * (3600s). Os 227s eram 6% do orçamento, não 76%.
 *
 * 🔑 E, no call-site que importa, quem limita o relógio é o `timeoutMs` da
 * chamada — não o `max_tokens`. Com o tempo fixo, teto maior não alonga nada:
 * só dá espaço para o JSON FECHAR em vez de ser cortado. Os dois parâmetros
 * limitam coisas diferentes, e confundi-los é o que faz alguém "economizar"
 * teto achando que está protegendo latência.
 *
 * ⚠️ O ledger NÃO registra o contexto de execução (`source` distingue batch de
 * síncrono, não rota de Trigger), então "estamos perto do timeout?" não é
 * respondível pelo dado — só lendo o `maxDuration` de quem chama. Lacuna
 * declarada.
 *
 *   npx tsx --env-file=.env.local scripts/_auditar-tetos-vs-saida.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createSupabaseAdmin } from '../lib/supabase';

const RAIZ = join(__dirname, '..');
const DIRS = ['actions', 'lib', 'app', 'trigger'];
const BARRA = String.fromCharCode(92);

/**
 * Folga mínima aceitável para um modelo que raciocina (teto ÷ p95).
 * 3× e não 2,5×: com a decisão de errar para CIMA (ver o cabeçalho), o número
 * que interessa não é "o típico cabe", é "a CAUDA cabe".
 */
const FOLGA_MINIMA = 3;

/**
 * O p95 é a estatística errada para dimensionar teto, e é por isso que ela não
 * decide sozinha aqui. Por definição, 5% das chamadas passam dele — e são
 * exatamente essas que truncam. O teto sugerido é o MAIOR entre "3× o típico" e
 * "1,5× o pior já observado", porque quem quebra o JSON é a cauda, não a média.
 */
const FOLGA_SOBRE_MAXIMO = 1.5;

/** Arredonda para cima em passo de 1.000 — teto exato não compra nada. */
const arredondar = (n: number) => Math.ceil(n / 1000) * 1000;

/**
 * Tasks em que tetos diferentes sob a MESMA etiqueta são de propósito, porque a
 * etiqueta cobre operações de naturezas distintas. Exige justificativa escrita:
 * o valor é impresso ao lado, então ninguém entra aqui só para calar o aviso.
 *
 * ⚠️ O conserto ESTRUTURAL destes casos não é unificar o teto — é PARTIR a
 * `taskKey`, para que o ledger e este auditor consigam distinguir as duas
 * operações. Enquanto isso não acontece, o p95 delas é uma mistura.
 */
const DIVERGENCIA_INTENCIONAL: Record<string, string> = {
  arguicao: 'turno de conversa (callAIChat, curto por desenho) × avaliação final (callAI). '
    + 'Unificar o teto esconderia que são duas coisas; o certo é partir a taskKey.',
};

/**
 * Quem é PRODUÇÃO no ledger. O resto é instrumento nosso e não pode decidir
 * teto de produção — mas também não pode sumir do relatório (era a cegueira 4).
 */
const FONTES_PRODUCAO = new Set(['wrapper', 'batch', 'batch-sync']);
const FONTE_SIMULADOR = 'simulator';

/**
 * Tetos que o parser estático NÃO consegue ler porque a `taskKey` é COMPUTADA
 * no call-site (`taskKey: taskKey || 'conteudo_gerar'`, ternário por formato).
 * Cada entrada é leitura manual do código, com o arquivo:linha para reconferir
 * — e a linha de baixo (`FEATURES_SEM_CALLSITE`) garante que esquecer de
 * atualizar isto vira um aviso, não um silêncio.
 *
 * ⚠️ `conteudo_texto`/`conteudo_case` têm teto 8.000 e `conteudo_podcast` 4.096
 * — o MESMO call-site bifurca por formato (actions/conteudos.ts:200). Assumir
 * 4.096 para os quatro foi o erro do de-para de 25/08.
 *
 * 🔴 E ele CONFERE a si mesmo (26/08). A primeira versão era um mapa manual e
 * ficou obsoleta em MINUTOS: subi os tetos no código e o auditor seguiu
 * reportando `conteudo_podcast` em 4.096, porque o número morava aqui. É a
 * mesma classe que este projeto persegue o tempo todo — config declarada ≠
 * config aplicada — só que dentro do instrumento que existe para pegá-la.
 * Agora cada entrada traz o `padrao` que precisa existir no arquivo indicado;
 * se não existir, o auditor FALHA em vez de reportar um número inventado.
 */
const TETOS_DECLARADOS: Record<string, { teto: number; onde: string; arquivo: string; padrao: RegExp }> = {
  conteudo_texto: {
    teto: 12000, onde: 'actions/conteudos.ts (formato texto/case)',
    arquivo: 'actions/conteudos.ts', padrao: /'case'\s*\?\s*12000\s*:/,
  },
  conteudo_case: {
    teto: 12000, onde: 'actions/conteudos.ts (formato texto/case)',
    arquivo: 'actions/conteudos.ts', padrao: /'case'\s*\?\s*12000\s*:/,
  },
  conteudo_podcast: {
    teto: 8000, onde: 'actions/conteudos.ts (demais formatos)',
    arquivo: 'actions/conteudos.ts', padrao: /'case'\s*\?\s*12000\s*:\s*8000/,
  },
  missao_feedback: {
    teto: 2000, onde: 'app/api/temporada/reflection/route.ts (taskKey por ternário)',
    arquivo: 'app/api/temporada/reflection/route.ts', padrao: /2000,\s*\{\s*taskKey:\s*tipoConversa/,
  },
};

/** Confere que cada teto declarado ainda existe no arquivo que diz existir. */
function conferirDeclarados(): string[] {
  const falhas: string[] = [];
  for (const [task, d] of Object.entries(TETOS_DECLARADOS)) {
    let src = '';
    try { src = readFileSync(join(RAIZ, d.arquivo), 'utf-8'); } catch {
      falhas.push(`${task}: arquivo ${d.arquivo} não existe`); continue;
    }
    if (!d.padrao.test(src)) {
      falhas.push(`${task}: o padrão ${d.padrao} não casa em ${d.arquivo} — o teto declarado (${d.teto}) provavelmente mudou no código`);
    }
  }
  return falhas;
}

function varrer(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'node_modules' && e !== '.next' && e !== 'worktrees') out.push(...varrer(p));
    } else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const norm = (p: string) => p.split(BARRA).join('/');

// ── Resolução de constantes ────────────────────────────────────────────────
// Cegueira 2: o teto costuma ser uma constante, não um literal. Montamos um
// dicionário `NOME -> número` varrendo o repo, e também `OBJETO.chave -> número`
// para os mapas de teto (ex.: `export const MAX_TOKENS = { turno: 900, ... }`).
function montarDicionarioDeConstantes(arquivos: string[]): Map<string, number> {
  const dic = new Map<string, number>();
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*number)?\s*=\s*(\d{2,7})\s*;/g)) {
      dic.set(m[1], Number(m[2]));
    }
    for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*\{([\s\S]{0,1200}?)\}\s*(?:as const)?\s*;/g)) {
      const objeto = m[1];
      for (const c of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(\d{2,7})\b/g)) {
        dic.set(`${objeto}.${c[1]}`, Number(c[2]));
      }
    }
  }
  return dic;
}

interface CallSite {
  task: string;
  onde: string;
  teto: number | null;
  expressao: string;
}

/**
 * Fatia a lista de argumentos de uma chamada respeitando profundidade e string.
 * A versão anterior usava `split(',')` sobre um recorte por `indexOf('{ taskKey')`
 * — que só casa quando as options começam EXATAMENTE assim. Em chamada
 * multilinha (a maioria) ele pegava um pedaço do objeto de options como se
 * fosse o teto, e o resultado era um `null` silencioso.
 */
function fatiarArgumentos(src: string, aberturaParen: number): string[] | null {
  let prof = 0;
  let i = aberturaParen;
  let aspas: string | null = null;
  const args: string[] = [];
  let inicio = aberturaParen + 1;
  for (; i < src.length; i++) {
    const c = src[i];
    const ant = src[i - 1];
    if (aspas) {
      if (c === aspas && ant !== BARRA) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { aspas = c; continue; }
    if (c === '(' || c === '[' || c === '{') prof++;
    else if (c === ')' || c === ']' || c === '}') {
      prof--;
      if (prof === 0) { args.push(src.slice(inicio, i)); return args.map((a) => a.trim()); }
    } else if (c === ',' && prof === 1) {
      args.push(src.slice(inicio, i));
      inicio = i + 1;
    }
    if (i - aberturaParen > 4000) return null; // chamada absurda: desiste explicitamente
  }
  return null;
}

function resolverTeto(expr: string, dic: Map<string, number>): number | null {
  const e = expr.trim();
  if (/^\d{2,7}$/.test(e)) return Number(e);
  if (dic.has(e)) return dic.get(e)!;
  const curto = e.split('.').slice(-2).join('.');
  if (dic.has(curto)) return dic.get(curto)!;
  const ultimo = e.split('.').pop() || '';
  if (dic.has(ultimo)) return dic.get(ultimo)!;
  return null;
}

function extrairCallSites(arquivos: string[], dic: Map<string, number>): CallSite[] {
  const sites: CallSite[] = [];
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf-8');
    const re = /callAI(?:Chat)?\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const args = fatiarArgumentos(src, m.index + m[0].length - 1);
      if (!args) continue;
      const task = args.join(',').match(/taskKey:\s*'([a-z0-9_]+)'/)?.[1];
      if (!task) continue;
      // Assinatura: (system, user, aiConfig, maxTokens, options)
      const expr = args[3] ?? '';
      sites.push({ task, onde: norm(relative(RAIZ, f)), teto: resolverTeto(expr, dic), expressao: expr.replace(/\s+/g, ' ') });
    }
  }
  return sites;
}

/** Cegueira 1: PostgREST corta em 1.000 por resposta. Pagina até o fim. */
async function lerLedgerInteiro(sb: any) {
  const linhas: Array<{ feature: string; output_tokens: number; source: string | null; model: string }> = [];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb
      .from('ia_usage_log')
      .select('feature, output_tokens, source, model')
      .gt('output_tokens', 0)
      .order('id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(`ledger: ${error.message}`);
    if (!data?.length) break;
    linhas.push(...data);
    if (data.length < PAGINA) break;
  }
  return linhas;
}

const p95 = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

async function main() {
  const arquivos = DIRS.flatMap((d) => { try { return varrer(join(RAIZ, d)); } catch { return []; } });
  const dic = montarDicionarioDeConstantes(arquivos);
  const sites = extrairCallSites(arquivos, dic);

  // Primeiro a autoconferencia: numero declarado que nao existe mais no codigo
  // e pior que numero ausente — ele parece medicao.
  const declaradosQuebrados = conferirDeclarados();
  if (declaradosQuebrados.length) {
    console.log('🔴 TETOS_DECLARADOS fora de sincronia com o código:');
    console.log('');
    for (const f of declaradosQuebrados) console.log(`   ${f}`);
    console.log('');
    console.log('Atualize o mapa no topo deste arquivo antes de ler qualquer folga abaixo.');
    console.log('');
  }

  const sb = createSupabaseAdmin();
  const ledger = await lerLedgerInteiro(sb);

  const prod = new Map<string, number[]>();
  const simul = new Map<string, number[]>();
  const exper = new Map<string, number[]>();
  for (const r of ledger) {
    const alvo = (r.source === null || FONTES_PRODUCAO.has(r.source)) ? prod
      : r.source === FONTE_SIMULADOR ? simul : exper;
    const l = alvo.get(r.feature) || [];
    l.push(r.output_tokens);
    alvo.set(r.feature, l);
  }

  const porTask = new Map<string, CallSite[]>();
  for (const s of sites) porTask.set(s.task, [...(porTask.get(s.task) || []), s]);
  for (const [task, d] of Object.entries(TETOS_DECLARADOS)) {
    if (!porTask.has(task)) porTask.set(task, [{ task, onde: d.onde, teto: d.teto, expressao: '(declarado)' }]);
  }

  // 🔴 A cegueira que a reconciliação anterior NÃO pegava: ela fechava sobre os
  // call-sites, então uma feature que existe SÓ no ledger — taskKey computada,
  // call-site removido, script de terceiro — nunca entrava no universo e o
  // total batia mesmo assim. É tráfego de produção que o auditor não enxerga.
  // `untagged`/`batch` não são tarefas: são a AUSÊNCIA de etiqueta. Mandar
  // "declare o teto" para elas seria conselho errado — o que elas pedem é
  // taskKey no call-site.
  const PSEUDO_FEATURES = new Set(['untagged', 'batch']);
  const semEtiqueta = [...prod.keys()].filter((f) => PSEUDO_FEATURES.has(f));
  const featuresSemCallSite = [...prod.keys()]
    .filter((f) => !porTask.has(f) && !PSEUDO_FEATURES.has(f) && (prod.get(f)?.length ?? 0) >= 3)
    .sort((a, b) => (prod.get(b)?.length ?? 0) - (prod.get(a)?.length ?? 0));

  // ── 1. A CEGUEIRA PRIMEIRO ────────────────────────────────────────────────
  console.log('══ COBERTURA (o que este auditor consegue avaliar) ══\n');
  console.log(`  ledger lido .................. ${ledger.length} linhas com output > 0`);
  console.log(`    produção (${[...FONTES_PRODUCAO].join('/')}/null) . ${[...prod.values()].reduce((a, b) => a + b.length, 0)}`);
  console.log(`    simulador de custo ......... ${[...simul.values()].reduce((a, b) => a + b.length, 0)}  (não decide teto de produção)`);
  console.log(`    scripts/experimentos ....... ${[...exper.values()].reduce((a, b) => a + b.length, 0)}  (idem)`);
  console.log(`  call-sites com taskKey ....... ${sites.length} em ${porTask.size} tasks`);

  const semTeto = sites.filter((s) => s.teto === null);
  const tasksSemTeto = [...new Set(semTeto.map((s) => s.task))];
  const semVolume = [...porTask.keys()].filter((t) => !(prod.get(t)?.length));
  const avaliaveis = [...porTask.keys()].filter((t) => (prod.get(t)?.length ?? 0) > 0 && porTask.get(t)!.some((s) => s.teto !== null));
  console.log(`  ✅ AVALIADAS ................. ${avaliaveis.length} de ${porTask.size} tasks`);

  // Reconciliação: toda task tem que cair em EXATAMENTE um balde. Se sobrar
  // resto, existe um descarte que ninguém está vendo — que foi o defeito da
  // versão anterior. O relatório denuncia a si mesmo.
  const semTetoResolvivel = [...porTask.keys()].filter(
    (t) => (prod.get(t)?.length ?? 0) > 0 && !porTask.get(t)!.some((s) => s.teto !== null),
  );
  const soma = avaliaveis.length + semVolume.length + semTetoResolvivel.length;
  console.log(`     ${avaliaveis.length} avaliadas + ${semVolume.length} sem tráfego + ${semTetoResolvivel.length} com tráfego mas sem teto legível = ${soma}`
    + (soma === porTask.size ? ' ✅ fecha' : ` 🔴 NÃO FECHA (${porTask.size - soma} task(s) em balde nenhum)`));
  console.log('');

  if (tasksSemTeto.length) {
    console.log(`  🔴 teto NÃO resolvido (${tasksSemTeto.length} task(s)) — o auditor é cego aqui:`);
    for (const s of semTeto) console.log(`       ${s.task.padEnd(24)} ${s.expressao.slice(0, 30).padEnd(32)} ${s.onde}`);
    console.log('');
  }
  if (semVolume.length) {
    console.log(`  ⚠️  sem tráfego de produção (${semVolume.length}): ${semVolume.join(', ')}\n`);
  }
  for (const f of semEtiqueta) {
    const n = prod.get(f)!.length;
    console.log(`  🔴 '${f}': ${n} chamadas (${(100 * n / [...prod.values()].reduce((a, b) => a + b.length, 0)).toFixed(0)}% da produção) sem taskKey — não é teto que falta, é ETIQUETA no call-site.`);
  }
  if (semEtiqueta.length) console.log('');
  if (featuresSemCallSite.length) {
    console.log(`  🔴 tráfego de produção SEM call-site legível (${featuresSemCallSite.length}) — taskKey computada ou origem fora do repo.`);
    console.log(`     São chamadas reais que este auditor NÃO cobre; declare o teto em TETOS_DECLARADOS para trazê-las:`);
    for (const f of featuresSemCallSite) console.log(`       ${f.padEnd(26)} n=${prod.get(f)!.length}  p95=${p95(prod.get(f)!)}`);
    console.log('');
  }

  // Cegueira 3: a mesma taskKey com tetos DIFERENTES — o min() antigo escondia.
  const divergentes = [...porTask.entries()].filter(([, ss]) => new Set(ss.filter((s) => s.teto !== null).map((s) => s.teto)).size > 1);
  const naoDeclaradas = divergentes.filter(([t]) => !DIVERGENCIA_INTENCIONAL[t]);
  const declaradas = divergentes.filter(([t]) => DIVERGENCIA_INTENCIONAL[t]);
  if (naoDeclaradas.length) {
    console.log(`  🔴 mesma taskKey com tetos DIFERENTES, sem justificativa (${naoDeclaradas.length}) — a folga abaixo usa o MENOR:`);
    for (const [t, ss] of naoDeclaradas) {
      console.log(`       ${t}: ${ss.map((s) => `${s.teto} (${s.onde.split('/').pop()})`).join(' · ')}`);
    }
    console.log('');
  }
  if (declaradas.length) {
    // Aviso que nunca sai vira ruído, e ruído é ignorado junto com o resto.
    // Divergência que é DE PROPÓSITO fica visível, mas classificada — e a
    // justificativa é obrigatória, então ninguém a usa só para calar o guard.
    console.log(`  ℹ️  divergência INTENCIONAL (${declaradas.length}) — operações diferentes sob a mesma etiqueta:`);
    for (const [t, ss] of declaradas) {
      console.log(`       ${t}: ${ss.map((s) => s.teto).join(' / ')} — ${DIVERGENCIA_INTENCIONAL[t]}`);
    }
    console.log('');
  }

  // ── 2. A FOLGA ────────────────────────────────────────────────────────────
  const linhas = avaliaveis.map((task) => {
    const tetos = porTask.get(task)!.map((s) => s.teto).filter((t): t is number => t !== null);
    const teto = Math.min(...tetos);
    const obs = prod.get(task)!;
    const p = p95(obs);
    const noTeto = obs.filter((o) => o >= teto).length;
    // Censura NÃO se detecta só contra o teto ATUAL: quando o teto sobe, as
    // linhas velhas continuam cortadas no teto ANTIGO e passam despercebidas
    // (`ia4_avaliacao`: p95 = 16.000 = o teto que vigorava, com o teto já em
    // 32.000). O sinal independente do teto é o PICO — muitas chamadas parando
    // no MESMO valor exato não é distribuição natural, é régua.
    const maxObs = Math.max(...obs);
    const pico = obs.filter((o) => o === maxObs).length;
    const censurado = pico >= 3 && pico / obs.length >= 0.05 ? { valor: maxObs, pico } : null;
    return { task, teto, p95: p, n: obs.length, folga: teto / p, noTeto, censurado, maxObs, onde: porTask.get(task)![0].onde };
  }).sort((a, b) => a.folga - b.folga);

  console.log('══ FOLGA = teto ÷ p95 (só tráfego de PRODUÇÃO) ══\n');
  console.log('  folga   teto     p95     n   no teto  task');
  for (const l of linhas) {
    const flag = l.folga < FOLGA_MINIMA ? '⚠️ ' : '✅';
    const trunc = l.noTeto > 0 ? `${l.noTeto} (${(100 * l.noTeto / l.n).toFixed(0)}%)` : '—';
    console.log(`  ${flag} ${l.folga.toFixed(2)}x ${String(l.teto).padStart(6)} ${String(l.p95).padStart(7)} ${String(l.n).padStart(5)} ${trunc.padStart(9)}  ${l.task}  (${l.onde})`);
  }

  const apertadas = linhas.filter((l) => l.folga < FOLGA_MINIMA);
  const censuradas = linhas.filter((l) => l.censurado);
  console.log(`\n  ${apertadas.length} de ${linhas.length} avaliadas com folga < ${FOLGA_MINIMA}x`);
  if (censuradas.length) {
    console.log(`\n  🔴 DISTRIBUIÇÃO CENSURADA (pico no mesmo valor exato) — aqui o p95 é PISO, não estimativa:`);
    for (const l of censuradas) {
      const atual = l.censurado!.valor >= l.teto ? 'no teto ATUAL' : `no teto ANTIGO (hoje ${l.teto})`;
      console.log(`       ${l.task}: ${l.censurado!.pico} de ${l.n} pararam em ${l.censurado!.valor} — ${atual}`);
      console.log(`         → dimensionar exige um lote SEM censura; ${FOLGA_MINIMA}× de um p95 cortado só reproduz o corte.`);
      console.log(`         → enquanto isso, erre para CIMA: piso provisório ${arredondar(FOLGA_MINIMA * l.censurado!.valor)} (${FOLGA_MINIMA}× o ponto de corte).`);
    }
  }
  const semCensura = apertadas.filter((l) => !l.censurado);
  if (semCensura.length) {
    console.log('\n  Sugestões (erra-se para CIMA: o desperdício do teto curto é CERTO, o custo do folgado é condicional):');
    for (const l of semCensura) {
      const porP95 = FOLGA_MINIMA * l.p95;
      const porMax = FOLGA_SOBRE_MAXIMO * l.maxObs;
      const alvo = arredondar(Math.max(porP95, porMax));
      const manda = porMax > porP95 ? `1,5× o MÁXIMO observado (${l.maxObs})` : `${FOLGA_MINIMA}× o p95 (${l.p95})`;
      const cruzaStream = l.teto <= 8192 && alvo > 8192 ? '  ⚠️ cruza 8.192: o Claude passa a usar STREAM (outro caminho de código)' : '';
      console.log(`  → ${l.task}: ${l.teto} → ${alvo}   [manda ${manda}]${cruzaStream}`);
      // Com n pequeno o "p95" é o máximo de um punhado de chamadas: a cauda real
      // ainda não foi observada. Sob "erre para cima", pouca evidência pede MAIS
      // folga, não menos — o contrário do reflexo de "só subo com dado".
      if (l.n < 10) {
        console.log(`       ⚠️ n=${l.n}: a cauda ainda não apareceu. Sob "erre para cima", use ${arredondar(alvo * 1.5)}.`);
      }
    }
  }

  // Cegueira: um relatório que não falha nunca é lido como "está tudo bem".
  if (declaradosQuebrados.length || tasksSemTeto.length || apertadas.length || censuradas.length || featuresSemCallSite.length || naoDeclaradas.length) {
    console.log('\n🔴 auditoria NÃO limpa — ver acima.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ nenhuma task de produção com teto apertado ou censurado.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
