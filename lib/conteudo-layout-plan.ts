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
    if (!line) { flushAll(); continue; }
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
  | 'reflectionCards';

export type PageRole =
  | 'contexto' | 'conceito' | 'exemplo' | 'comparativo'
  | 'ferramenta' | 'aplicacao' | 'reflexao' | 'corpo';

export type PlanItem =
  | { as: Treatment; ref: number }
  | { as: 'comparison'; left: { label?: string; refs: number[] }; right: { label?: string; refs: number[] } }
  | { as: 'pullquoteText'; ref: number; text: string };

export type PagePlan = { role: PageRole; heroImage?: boolean; items: PlanItem[] };
export type LayoutPlan = { summary: string; pages: PagePlan[] };

const ROLES: PageRole[] = ['contexto', 'conceito', 'exemplo', 'comparativo', 'ferramenta', 'aplicacao', 'reflexao', 'corpo'];
const TREATMENTS: Treatment[] = ['heading', 'paragraph', 'pullquote', 'synthesis', 'bullets', 'numberedCards', 'flow', 'checklist', 'reflectionCards'];

const PLAN_SYSTEM = `Você é um DIRETOR DE ARTE EDITORIAL sênior da Vertho. Sua função é diagramar conteúdos de desenvolvimento profissional como PUBLICAÇÕES INSTITUCIONAIS PREMIUM em PDF A4 vertical — não como um Word decorado nem uma apostila de texto corrido.

REGRA ABSOLUTA: você NÃO reescreve, resume, traduz, simplifica nem inventa nada. Você recebe BLOCOS já escritos (cada um com um id) e apenas decide, para cada bloco, em qual PÁGINA ele entra, com qual PAPEL editorial a página tem, e qual TRATAMENTO VISUAL o bloco recebe. O texto NUNCA é emitido por você — você só referencia ids.

Princípios de diagramação:
- Cada página tem uma FUNÇÃO editorial clara e diferente das outras (contexto/problema, conceito aplicado, exemplo, comparativo, ferramenta prática, aplicação e cuidados, reflexão final).
- A ÚLTIMA página deve ser de reflexão (role "reflexao"), limpa e contemplativa, quando houver perguntas ou fechamento.

REGRA EDITORIAL CRÍTICA — NENHUMA PÁGINA INTERNA SÓ DE TEXTO:
- Antes de paginar, faça um diagnóstico editorial: localize listas, perguntas, passos, métodos, exemplos, comparações (explícitas ou implícitas) e frases fortes.
- Nenhuma página interna pode existir apenas para carregar continuação de texto corrido. Toda página interna precisa de PELO MENOS UM recurso visual relevante: pull quote, box de síntese, cards numerados, fluxo, checklist, cards de reflexão, comparativo lado a lado — ou (em uma única página) a imagem de banda (heroImage).
- Se uma página estiver ficando só com "heading" + "paragraph", redesenhe-a: extraia uma frase forte como "pullquoteText", transforme um parágrafo-conceito em "synthesis", ou funda com a página vizinha.

TRANSFORMAÇÃO VISUAL OBRIGATÓRIA (não deixe estes elementos escondidos no texto corrido — use os tratamentos abaixo):
- Listas numeradas, sequências de passos, métodos, roteiros ou percursos → "flow" (etapas com conector) ou "numberedCards".
- Listas de itens acionáveis, ferramentas práticas imprimíveis ou checklists → "checklist".
- Perguntas finais ou perguntas de reflexão → "reflectionCards" (NUNCA "bullets").
- Comparações, mesmo implícitas (antes/depois, reativo/preventivo, feeling/dados, sem X / com X) → "comparison" lado a lado.
- Frases fortes ou citações → "pullquote" (bloco inteiro) ou "pullquoteText" (trecho VERBATIM de um parágrafo).
- Conceito central → "synthesis" (box de síntese).
- Use "bullets" só quando a lista não for acionável, sequencial nem de reflexão (caso raro).

FERRAMENTA PRÁTICA = PÁGINA MAIS VISUAL: se o conteúdo trouxer um método, percurso, roteiro, checklist ou conjunto de perguntas, essa deve ser a página mais visual do PDF — algo que o leitor poderia imprimir e usar numa reunião (use "flow", "numberedCards" ou "checklist", com role "ferramenta").

CONTRA PÁGINAS FRACAS OU DENSAS:
- Página visualmente vazia (pouco texto e nenhum recurso visual forte): funda com a anterior, vire box de síntese, ou crie uma página de respiro com um pull quote forte.
- Página densa (muitos parágrafos longos): quebre com pull quotes, "synthesis" e divisão entre páginas. NÃO esprema texto para caber em menos páginas — se precisar, AUMENTE o número de páginas (alvo 5-8 no total).
- Se houver dois blocos/exemplos do mesmo tipo com o MESMO título ou função, não os repita iguais: diferencie a função de cada um ou transforme o par em um "comparison".

TRATAMENTOS (campo "as"):
- "heading": título de seção (use no bloco de kind h1/h2/h3).
- "paragraph": parágrafo de corpo.
- "pullquote": destaca o bloco inteiro como citação editorial (use em blocos kind "quote" ou parágrafos curtos e fortes).
- "pullquoteText": extrai UMA frase forte de dentro de um bloco como pull quote. O campo "text" DEVE ser uma cópia EXATA (verbatim) de um trecho contínuo do bloco "ref". É ADITIVO (o bloco original continua aparecendo em outro item).
- "synthesis": box de síntese para um conceito central (parágrafo).
- "bullets": lista de marcadores (kind ul).
- "numberedCards": cards numerados (kind ol).
- "flow": passos em fluxo/processo com conectores (kind ol — sequência de etapas).
- "checklist": checklist imprimível (kind ul ou ol — itens acionáveis).
- "reflectionCards": cada item vira um card de reflexão (kind ul — perguntas).
- "comparison": layout lado a lado. Forneça left/right, cada um com "refs" (ids dos blocos daquele lado) e um "label" curto opcional (ex.: "Antes", "Depois", "Reação", "Antecipação"). Use SOMENTE quando houver comparação real no conteúdo.

COBERTURA: todo bloco de conteúdo deve aparecer em ALGUM item estrutural (qualquer "as" exceto "pullquoteText") exatamente uma vez. Pull quotes ("pullquote"/"pullquoteText") podem repetir um trecho, mas não substituem a presença estrutural do conteúdo.

REVISÃO ANTES DE EMITIR: valide internamente, página a página, se cada uma tem (a) uma função editorial clara e (b) pelo menos um recurso visual relevante. Se alguma página falhar, redesenhe-a antes de responder. Não emita o raciocínio — apenas o JSON final.

SAÍDA: responda APENAS com JSON válido (sem cercas de código, sem comentários), no formato:
{"summary":"1-2 frases descrevendo a estrutura visual criada, citando a função e o recurso visual principal de cada página","pages":[{"role":"contexto","heroImage":true,"items":[{"as":"heading","ref":0},{"as":"paragraph","ref":1},{"as":"pullquoteText","ref":1,"text":"trecho verbatim"}]}]}
"heroImage": marque como true em EXATAMENTE UMA página (a mais conceitual, geralmente contexto ou conceito) — ela receberá uma imagem conceitual de banda. Demais páginas omitem o campo ou usam false.`;

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
        const left = (it.left?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r));
        const right = (it.right?.refs || []).filter(validRef).filter((r: number) => !usedStructural.has(r));
        if (!left.length && !right.length) continue;
        left.forEach((r: number) => usedStructural.add(r));
        right.forEach((r: number) => usedStructural.add(r));
        items.push({
          as: 'comparison',
          left: { label: typeof it.left?.label === 'string' ? it.left.label.slice(0, 40) : undefined, refs: left },
          right: { label: typeof it.right?.label === 'string' ? it.right.label.slice(0, 40) : undefined, refs: right },
        });
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
    pages[pages.length - 1].items.push(...missing.map(b => ({ as: naturalAs(b), ref: b.id } as PlanItem)));
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
  try {
    const ctx = [
      `TÍTULO: ${meta.titulo}`,
      meta.competencia ? `COMPETÊNCIA/TEMA: ${meta.competencia}` : null,
      meta.descritor ? `DESCRITOR: ${meta.descritor}` : null,
      meta.formato ? `FORMATO: ${meta.formato}` : null,
    ].filter(Boolean).join('\n');
    const user = `${ctx}\n\nBLOCOS (id, kind, conteúdo):\n${serializeBlocks(blocks)}\n\nProduza o plano de paginação em JSON.`;
    const raw = await callAI(PLAN_SYSTEM, user, { model }, 8000, { temperature: 0.3 });
    const plan = sanitize(extractJson(raw), blocks);
    if (!plan) console.warn('[planLayout] plano inválido — usando fallback flat');
    return plan;
  } catch (e: any) {
    console.warn('[planLayout] falhou:', e?.message);
    return null;
  }
}
