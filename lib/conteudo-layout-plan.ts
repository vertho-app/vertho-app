/**
 * Planejador editorial do "conteúdo final" premium.
 *
 * Recebe o markdown de micro_conteudos.conteudo_inline, parseia em BLOCOS
 * ATÔMICOS com id estável e pede a uma IA (direção de arte) um PLANO DE
 * PAGINAÇÃO: para cada página, um papel editorial (contexto, conceito,
 * exemplo, comparativo, ferramenta, aplicação, reflexão) e a ordem dos blocos
 * com o tratamento visual de cada um (pull quote, card numerado, comparativo
 * lado a lado, box de síntese, cards de reflexão, fluxo, checklist...).
 *
 * INVARIANTE DE INTEGRIDADE: a IA só CLASSIFICA e ORGANIZA — ela referencia
 * blocos por id, nunca emite o texto. O renderer puxa o texto verbatim dos
 * blocos. Pull quotes "extraídas" são validadas como substring do bloco de
 * origem (senão são descartadas). Blocos que a IA esquecer são reanexados no
 * fim — nada do conteúdo original é perdido.
 */

import { callAI } from '@/actions/ai-client';

export type BlockKind = 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'ul' | 'ol';

export type RawBlock =
  | { id: number; kind: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { id: number; kind: 'ul' | 'ol'; items: string[] };

// ── Parser markdown → blocos atômicos ────────────────────────────────────────
export function parseBlocks(md: string, { skipFirstH1 = false }: { skipFirstH1?: boolean } = {}): RawBlock[] {
  const lines = String(md || '').split('\n');
  const blocks: RawBlock[] = [];
  let id = 0;
  let para: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let firstH1Skipped = !skipFirstH1;

  const flushPara = () => { if (para.length) { blocks.push({ id: id++, kind: 'p', text: para.join(' ') }); para = []; } };
  const flushUl = () => { if (ul.length) { blocks.push({ id: id++, kind: 'ul', items: ul }); ul = []; } };
  const flushOl = () => { if (ol.length) { blocks.push({ id: id++, kind: 'ol', items: ol }); ol = []; } };
  const flushAll = () => { flushPara(); flushUl(); flushOl(); };

  for (const raw of lines) {
    const line = raw.trim();
    // Linha em branco encerra parágrafo, mas NÃO encerra uma lista: itens
    // separados por linha em branco ("loose list", markdown comum) continuam a
    // MESMA lista. Sem isto, `1. a\n\n2. b` virava duas listas de 1 item — o que
    // quebrava fluxos/cards numerados (cada passo isolado, sem conector).
    if (!line) { flushPara(); continue; }
    if (/^([-*_])\1{2,}$/.test(line)) { flushAll(); continue; } // hr

    if (line.startsWith('### ')) { flushAll(); blocks.push({ id: id++, kind: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { flushAll(); blocks.push({ id: id++, kind: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) {
      flushAll();
      if (!firstH1Skipped) { firstH1Skipped = true; continue; }
      blocks.push({ id: id++, kind: 'h1', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('> ')) { flushAll(); blocks.push({ id: id++, kind: 'quote', text: line.slice(2) }); continue; }
    if (/^[-*]\s+/.test(line)) { flushPara(); flushOl(); ul.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (/^\d+\.\s+/.test(line)) { flushPara(); flushUl(); ol.push(line.replace(/^\d+\.\s+/, '')); continue; }

    flushUl(); flushOl();
    para.push(line);
  }
  flushAll();
  return blocks;
}

// ── Tipos do plano ────────────────────────────────────────────────────────────
export type Treatment =
  | 'heading'
  | 'paragraph'
  | 'pullquote'
  | 'synthesis'
  | 'bullets'
  | 'numberedCards'
  | 'flow'
  | 'checklist'
  | 'caseCard'
  | 'script'
  | 'reflectionCards';

export type PageRole =
  | 'contexto' | 'conceito' | 'exemplo' | 'comparativo'
  | 'ferramenta' | 'aplicacao' | 'cuidados' | 'sintese' | 'reflexao' | 'corpo';

export type PlanItem =
  | { as: Treatment; ref: number }
  | { as: 'comparison'; left: { label?: string; refs: number[] }; right: { label?: string; refs: number[] } }
  | { as: 'diagram'; affirm: { refs: number[] }; negate: { refs: number[] } }
  | { as: 'pullquoteText'; ref: number; text: string };

export type PagePlan = { role: PageRole; heroImage?: boolean; items: PlanItem[] };
export type LayoutPlan = { summary: string; pages: PagePlan[] };

const ROLES: PageRole[] = ['contexto', 'conceito', 'exemplo', 'comparativo', 'ferramenta', 'aplicacao', 'cuidados', 'sintese', 'reflexao', 'corpo'];
const TREATMENTS: Treatment[] = ['heading', 'paragraph', 'pullquote', 'synthesis', 'bullets', 'numberedCards', 'flow', 'checklist', 'caseCard', 'script', 'reflectionCards'];

const PLAN_SYSTEM = `Você é o DIRETOR DE ARTE EDITORIAL sênior da Vertho. Você transforma um conteúdo JÁ ESCRITO num plano de publicação editorial premium para PDF A4 vertical — NÃO um Word decorado, NÃO uma apostila, NÃO um artigo longo diagramado.

REGRA ABSOLUTA DE CONTEÚDO: você NÃO reescreve, resume, traduz, simplifica, inventa nem remove nada. Você recebe BLOCOS já escritos (cada um com um id) e decide apenas: em qual PÁGINA cada bloco entra, qual FUNÇÃO editorial a página tem e qual TRATAMENTO VISUAL o bloco recebe. O texto NUNCA é emitido por você — você só referencia ids. Pull quotes podem repetir literalmente um trecho existente, mas não substituem o bloco original.

O resultado NÃO pode parecer: Word decorado, apostila, artigo longo em páginas, sequência de blocos coloridos, texto corrido diagramado, material infantil, template corporativo pobre.
O resultado DEVE parecer: publicação editorial premium, guia visual de aprendizagem, peça institucional Vertho — útil, legível e memorável.

# DIAGNÓSTICO EDITORIAL (faça ANTES de paginar)
Analise os blocos e localize: (1) título; (2) contexto/cena inicial; (3) conceito central; (4) exemplo(s) prático(s); (5) método/ferramenta/lista/perguntas; (6) comparação explícita ou implícita; (7) frases fortes para pull quote; (8) perguntas finais; (9) trechos densos que precisam ser quebrados. Use o diagnóstico para definir a função de cada página.

# CADA PÁGINA PRECISA DE FUNÇÃO E DE RECURSO VISUAL
- Nenhuma página interna pode existir apenas para carregar continuação de texto. Cada página tem uma FUNÇÃO clara e diferente das outras: contexto, conceito, exemplo, comparativo, ferramenta, aplicação, cuidados, síntese, reflexão.
- Cada página interna precisa de PELO MENOS UM recurso visual relevante: pull quote, box de síntese, cards numerados, fluxo, checklist, card de caso, cards de reflexão, comparativo lado a lado — ou (em UMA página só) a imagem de banda (heroImage).
- Página só com "heading" + "paragraph" está ERRADA: extraia uma frase forte como "pullquoteText", transforme um parágrafo-conceito em "synthesis", ou funda com a página vizinha.

# TRANSFORMAÇÕES VISUAIS OBRIGATÓRIAS (não deixe estes elementos escondidos no texto corrido)
- Lista numerada, sequência de passos, método, roteiro ou percurso → "flow" (etapas com conector) ou "numberedCards". Nunca deixe lista importante como texto.
- Itens acionáveis ou ferramenta imprimível → "checklist".
- Exemplo prático (um caso/situação concreta) → "caseCard" (card de caso). Se o exemplo tiver dois lados (o que fez / o que faltou), use "comparison".
- Fala sugerida / roteiro de conversa — o que a pessoa pode DIZER numa situação ("diga: '…'", "experimente perguntar: '…'", frases-modelo para um diálogo) → "script": callout recuado em itálico, uma "cola de bolso" do que falar. NÃO use para conceito ou instrução genérica — só para falas/diálogos literais que o leitor poderia repetir.
- Definição por contraste — o conteúdo diz o que algo É e o que NÃO é (ex.: "não é cobrança, é direção", "questionar não é reclamar, é propor", "o que é / o que não é") → "diagram": duas colunas com ✓ (o que é) e ✗ (o que não é). Use quando o eixo for afirmar/negar a NATUREZA de um conceito.
- Comparação entre dois estados ou abordagens (antes/depois, reativo/preventivo, feeling/dados, sem X / com X) → "comparison" lado a lado, com "label" curto em cada lado. Use quando o eixo NÃO for definicional (afirmar/negar), e sim dois cenários comparáveis.
- Frase forte ou citação → "pullquote" (bloco inteiro) ou "pullquoteText" (trecho VERBATIM, substring literal de um parágrafo, ≥12 caracteres).
- Conceito central → "synthesis" (box de síntese).
- Perguntas finais ou de reflexão → "reflectionCards" (NUNCA "bullets"). A última página é de reflexão (role "reflexao"), limpa e contemplativa.
- Use "bullets" SÓ quando a lista não for acionável, sequencial nem de reflexão (caso raro).

# FERRAMENTA = PÁGINA MAIS VISUAL
Se houver método, roteiro, checklist ou conjunto de perguntas, essa é a página mais forte do PDF (role "ferramenta"): algo que o leitor poderia imprimir e usar numa reunião. Use "flow", "numberedCards" ou "checklist".

# ESTRUTURA RECOMENDADA (alvo 5-8 páginas internas; ajuste à extensão, NUNCA esprema)
contexto → conceito → exemplo/comparativo → ferramenta → aplicação → cuidados/tensões → síntese/reflexão.

# CONTRA PÁGINAS FRACAS OU DENSAS
- DENSIDADE: cada página interna deve preencher boa parte da altura útil (mire ~60%+). Uma página com só 1-2 itens curtos (um caseCard sozinho, dois parágrafos, um pull quote solto) deixa metade da folha em branco — NÃO faça isso. Junte itens suficientes por página ou funda com a vizinha. Prefira MENOS páginas bem cheias a MAIS páginas ralas.
- Não fatie um mesmo exemplo/assunto em duas páginas seguidas com o mesmo role (dois "exemplo" magros) — consolide num só.
- Página fraca (1-2 parágrafos, nada visual, ou igual à anterior): funda com a anterior, vire "synthesis"/cards, ou crie um respiro com pull quote forte.
- Página densa (muitos parágrafos longos): quebre com pull quotes, "synthesis" e divisão entre páginas. NÃO esprema texto para caber em menos páginas — se precisar, AUMENTE o número de páginas.
- Dois blocos/exemplos do mesmo tipo com o MESMO título ou função: não os repita iguais — diferencie a função de cada um ou transforme o par em "comparison".

# HERO IMAGE
"heroImage": true em EXATAMENTE UMA página (a mais conceitual — geralmente contexto ou conceito). Demais páginas omitem o campo ou usam false.

TRATAMENTOS (campo "as"):
- "heading": título de seção (bloco kind h1/h2/h3).
- "paragraph": parágrafo de corpo (use com parcimônia — não deixe a página virar texto corrido).
- "pullquote": destaca o bloco inteiro como citação editorial (blocos kind "quote" ou parágrafos curtos e fortes).
- "pullquoteText": extrai UMA frase forte de dentro de um bloco. "text" DEVE ser cópia EXATA (verbatim) de um trecho contínuo do bloco "ref". É ADITIVO (o bloco original continua em outro item).
- "synthesis": box de síntese para um conceito central (parágrafo). Bom para "o que é / por que importa".
- "bullets": lista de marcadores (kind ul) — caso raro.
- "numberedCards": cards numerados (kind ol).
- "flow": passos em fluxo/processo com conectores (kind ol — sequência de etapas).
- "checklist": checklist imprimível (kind ul ou ol — itens acionáveis).
- "caseCard": card de caso/exemplo (kind p, ul ou ol) — destaca uma situação concreta como peça visual.
- "script": fala sugerida / roteiro de conversa (kind p, ul ou ol) — callout recuado em itálico com balão, "cola de bolso" do que dizer. Só para diálogos/frases literais que o leitor repetiria, nunca para conceito.
- "reflectionCards": cada item vira um card de reflexão (kind ul — perguntas).
- "comparison": layout lado a lado. Forneça left/right, cada um com "refs" (ids dos blocos daquele lado) e "label" curto (ex.: "Antes", "Depois", "Sem dados", "Com dados"). Use SOMENTE quando houver comparação real ou implícita entre dois cenários/abordagens (não definicional). DICA: se os dois lados forem listas com o MESMO número de itens, o render vira um grid de leitura rápida (linha a linha alinhada) — quando o conteúdo tiver pontos paralelos, prefira refs que produzam o mesmo número de linhas dos dois lados.
- "diagram": contraste definicional "o que é / o que não é". Forneça "affirm" e "negate", cada um com "refs" (ids dos blocos daquele lado). NÃO use label (as colunas já são rotuladas "O que é" / "O que não é"). Use quando o conteúdo definir um conceito afirmando o que ele é e negando o que ele não é.

COBERTURA: todo bloco de conteúdo deve aparecer em ALGUM item estrutural (qualquer "as" exceto "pullquoteText") exatamente uma vez. Pull quotes não substituem a presença estrutural do conteúdo.

# CONTROLE EDITORIAL ANTIAUTOMAÇÃO (revise o plano ANTES de emitir)
O PDF não pode ter cara de geração automática. Aplique estas travas — todas dentro da regra de conteúdo (você só referencia ids, NUNCA reescreve nem inventa título):
1. RÓTULOS REPETIDOS NA MESMA PÁGINA: vários tratamentos têm rótulo fixo no render — "caseCard" mostra "Na prática", "synthesis" mostra "Síntese", a página role "exemplo" já tem o eyebrow "Na prática". NÃO empilhe na mesma página dois itens que produzam o MESMO rótulo (dois caseCard, dois synthesis, ou um caseCard numa página role "exemplo"). Como você não pode renomear, a saída é VARIAR: trate só um bloco como caseCard/synthesis e o(s) outro(s) como paragraph/pullquote, OU distribua-os em páginas com função diferente. Nunca dois rótulos iguais lado a lado.
2. CONTRASTE REAL em "diagram" e "comparison": os dois lados devem referenciar blocos DIFERENTES cujo conteúdo realmente se opõe. "diagram" exige um bloco que AFIRMA (o que é) e um bloco distinto que NEGA (o que não é: confusões, exageros, riscos, leituras equivocadas). Se NÃO houver um lado de negação real nos blocos, NÃO use diagram — use "synthesis". Idem comparison: nunca os dois lados com o mesmo sentido, o mesmo rótulo ou o mesmo bloco. Sem contraste genuíno, não force a estrutura.
3. FERRAMENTA é a página mais visual: todo método/roteiro/checklist/conjunto de perguntas vira "flow", "numberedCards" ou "checklist" — nunca "paragraph" ou "bullets". Se o conteúdo tem passos, eles são a peça central de uma página role "ferramenta".
4. FUNÇÃO POR PÁGINA: toda página interna recebe um role REAL (contexto/conceito/exemplo/comparativo/ferramenta/aplicacao/cuidados/sintese/reflexao). NUNCA use o role "corpo" para uma página interna — ele é só fallback de segurança, não um plano aceitável.
5. PÁGINA FINAL com valor: a última página é "reflexao" com os "reflectionCards" das perguntas. Não deixe uma página final fraca ou sobrando: se sobrar uma página com 1 item fraco, funda-a com a anterior. Se o conteúdo tiver passos de próxima ação ("escolha um sinal, reserve 15 min, converse com alguém..."), trate-os como "checklist"/"numberedCards" (em aplicação ou no fechamento), não como parágrafo.
6. REFLEXÃO LIMPA: na página "reflexao", DEPOIS dos "reflectionCards" não coloque parágrafos conceituais novos. Conteúdo conceitual solto vai para uma página anterior (conceito/aplicação). A última página é contemplativa: só as perguntas (no máximo um "synthesis" curto de fechamento antes dos cards).

REVISÃO ANTES DE EMITIR — valide internamente, página a página: todo bloco aparece ≥1 vez; no máximo uma heroImage; cada página tem função editorial clara (nenhuma com role "corpo"); cada página interna tem ≥1 recurso visual; listas importantes não ficaram como texto; exemplos foram tratados visualmente; perguntas finais viraram cards; nenhuma página é só continuação de texto; nenhuma página está visualmente vazia ou sobrando; páginas internas não são todas iguais; nenhum rótulo fixo se repete na mesma página (dois "Na prática", dois "Síntese"); diagram/comparison só com contraste real entre blocos distintos; nenhum parágrafo conceitual depois dos reflectionCards; nenhuma pull quote foi inventada. Se algo falhar, REDESENHE antes de responder. NÃO emita o raciocínio — apenas o JSON final.

SAÍDA: responda APENAS com JSON válido (sem cercas de código, sem comentários), no formato:
{"summary":"1-2 frases descrevendo a estrutura visual criada, citando a função e o recurso visual principal de cada página","pages":[{"role":"contexto","heroImage":true,"items":[{"as":"heading","ref":0},{"as":"synthesis","ref":1},{"as":"pullquoteText","ref":1,"text":"trecho verbatim"}]}]}`;

function serializeBlocks(blocks: RawBlock[]): string {
  return blocks.map(b => {
    if (b.kind === 'ul' || b.kind === 'ol') {
      const items = b.items.map((it, i) => `${i + 1}) ${it}`).join('  ');
      return `[${b.id}] (${b.kind}) ${items}`;
    }
    return `[${b.id}] (${b.kind}) ${(b as { text: string }).text}`;
  }).join('\n');
}

function extractJson(raw: string): any | null {
  let t = String(raw || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

function norm(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function blockText(b: RawBlock): string {
  return b.kind === 'ul' || b.kind === 'ol' ? b.items.join(' ') : (b as { text: string }).text;
}

/**
 * Sanea o plano cru da IA garantindo a integridade:
 * - descarta refs inválidos e itens malformados;
 * - dedupe estrutural (cada bloco aparece estruturalmente no máx. 1 vez);
 * - valida pull quotes extraídas como substring (descarta se não bater);
 * - reanexa no fim qualquer bloco de conteúdo que a IA tenha esquecido.
 * Retorna null só se o plano for irrecuperável (sem páginas válidas).
 */
function sanitize(plan: any, blocks: RawBlock[]): LayoutPlan | null {
  if (!plan || !Array.isArray(plan.pages)) return null;
  const byId = new Map(blocks.map(b => [b.id, b]));
  const usedStructural = new Set<number>();
  const validRef = (n: any): n is number => Number.isInteger(n) && byId.has(n);

  const pages: PagePlan[] = [];
  for (const p of plan.pages) {
    const role: PageRole = ROLES.includes(p?.role) ? p.role : 'corpo';
    const items: PlanItem[] = [];
    for (const it of (Array.isArray(p?.items) ? p.items : [])) {
      const as = it?.as;
      if (as === 'comparison') {
        // Dedup SEQUENCIAL: o lado direito exclui o que já entrou no esquerdo
        // (senão a IA pode pôr o MESMO bloco nos dois lados → texto idêntico).
        const left = (it.left?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r));
        const inLeft = new Set<number>(left);
        const right = (it.right?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r) && !inLeft.has(r));
        // Comparativo exige OS DOIS lados; sem contraste real, descarta (os
        // blocos seguem livres p/ reanexação, não viram um layout pela metade).
        if (!left.length || !right.length) continue;
        left.forEach((r: number) => usedStructural.add(r));
        right.forEach((r: number) => usedStructural.add(r));
        items.push({
          as: 'comparison',
          left: { label: typeof it.left?.label === 'string' ? it.left.label.slice(0, 40) : undefined, refs: left },
          right: { label: typeof it.right?.label === 'string' ? it.right.label.slice(0, 40) : undefined, refs: right },
        });
        continue;
      }
      if (as === 'diagram') {
        const affirm = (it.affirm?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r));
        const inAffirm = new Set<number>(affirm);
        const negate = (it.negate?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r) && !inAffirm.has(r));
        // diagram exige afirmação E negação distintas; sem isso, descarta.
        if (!affirm.length || !negate.length) continue;
        affirm.forEach((r: number) => usedStructural.add(r));
        negate.forEach((r: number) => usedStructural.add(r));
        items.push({ as: 'diagram', affirm: { refs: affirm }, negate: { refs: negate } });
        continue;
      }
      if (as === 'pullquoteText') {
        if (!validRef(it.ref) || typeof it.text !== 'string') continue;
        const src = blockText(byId.get(it.ref)!);
        if (!norm(src).includes(norm(it.text)) || norm(it.text).length < 12) continue;
        items.push({ as: 'pullquoteText', ref: it.ref, text: it.text.trim() });
        continue;
      }
      if (TREATMENTS.includes(as)) {
        if (!validRef(it.ref) || usedStructural.has(it.ref)) continue;
        usedStructural.add(it.ref);
        items.push({ as, ref: it.ref });
        continue;
      }
    }
    if (items.length) pages.push({ role, heroImage: Boolean(p?.heroImage), items });
  }

  if (!pages.length) return null;

  // heroImage em no máx. uma página (mantém a primeira marcada).
  let heroSeen = false;
  for (const p of pages) {
    if (p.heroImage && !heroSeen) heroSeen = true;
    else p.heroImage = false;
  }

  // Reanexa blocos esquecidos (cobertura), preservando a ordem original.
  const missing = blocks.filter(b => !usedStructural.has(b.id));
  if (missing.length) {
    const naturalAs = (b: RawBlock): Treatment =>
      b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3' ? 'heading'
        : b.kind === 'quote' ? 'pullquote'
        : b.kind === 'ul' ? 'bullets'
        : b.kind === 'ol' ? 'numberedCards'
        : 'paragraph';
    // NÃO jogar conteúdo solto na página de reflexão (deve ficar contemplativa,
    // só perguntas). Reanexa na última página que NÃO seja reflexão.
    let target = pages.length - 1;
    while (target > 0 && pages[target].role === 'reflexao') target--;
    pages[target].items.push(...missing.map(b => ({ as: naturalAs(b), ref: b.id } as PlanItem)));
  }

  const summary = typeof plan.summary === 'string' ? plan.summary.trim().slice(0, 600) : '';
  return { summary, pages };
}

interface PlanMeta {
  titulo: string;
  competencia?: string | null;
  descritor?: string | null;
  formato?: string | null;
}

/**
 * Pede o plano de paginação à IA e devolve um LayoutPlan saneado, ou null se
 * falhar (o caller cai no render flat de fallback). Nunca lança.
 */
export async function planLayout(blocks: RawBlock[], meta: PlanMeta, model?: string): Promise<LayoutPlan | null> {
  if (!blocks.length) return null;
  const ctx = [
    `TÍTULO: ${meta.titulo}`,
    meta.competencia ? `COMPETÊNCIA/TEMA: ${meta.competencia}` : null,
    meta.descritor ? `DESCRITOR: ${meta.descritor}` : null,
    meta.formato ? `FORMATO: ${meta.formato}` : null,
  ].filter(Boolean).join('\n');
  const user = `${ctx}\n\nBLOCOS (id, kind, conteúdo):\n${serializeBlocks(blocks)}\n\nProduza o plano de paginação em JSON.`;

  // Duas tentativas: o planner pode devolver JSON malformado/truncado num pico
  // transiente. Em vez de cair direto no flat (que VIRA TEXTO CORRIDO e some com
  // toda a diagramação), tenta de novo. O fallback flat é o último recurso e é
  // logado como error (visível no Vercel), não warn silencioso.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAI(PLAN_SYSTEM, user, { model }, 8000, { temperature: 0.3 });
      const plan = sanitize(extractJson(raw), blocks);
      if (plan) return plan;
      console.error(`[planLayout] plano inválido (tentativa ${attempt}/2) — raw[0..200]: ${String(raw).slice(0, 200)}`);
    } catch (e: any) {
      console.error(`[planLayout] callAI falhou (tentativa ${attempt}/2):`, e?.message);
    }
  }
  console.error('[planLayout] esgotou as tentativas — caindo no fallback flat (PDF sai como texto corrido)');
  return null;
}
