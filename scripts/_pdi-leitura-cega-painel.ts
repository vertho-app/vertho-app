/**
 * Leitura cega dos 9 PDIs (artefato e8161cfa) por painel CROSS-FAMÍLIA.
 *
 * Contexto: `docs/CUSTO-QUALIDADE.md` registra que nenhum critério automático
 * separou os 9 modelos — JSON válido, contagem e ordem bateram em todos — e que
 * "o que sobra é qualidade de escrita", decisão que foi para leitura cega e
 * NUNCA FOI FEITA. É o linchpin dos pins de Sonnet 5 nas saídas longas.
 *
 * 🔑 POR QUE UM PAINEL, E NÃO UM JUIZ
 * O próprio projeto já mediu isso: na S4, com juiz ÚNICO, o veredito foi "ON
 * melhor" e MASCAROU uma degradação sistemática do perfil D que só o painel
 * cego pegou. Juiz único aqui não vale.
 *
 * 🔴 O VIÉS QUE ESTE SCRIPT MEDE EM VEZ DE IGNORAR
 * Todo juiz disponível é também CONCORRENTE: dos 9 textos, 4 são Claude, 2 são
 * GPT, 1 Gemini, 1 Kimi. Não existe família limpa para julgar o conjunto todo.
 * Então o script não finge neutralidade — ele calcula, para cada juiz, a posição
 * média que ele deu à PRÓPRIA família contra a que deu às outras. Se aparecer
 * auto-preferência, o resultado agregado não serve e a resposta é "tem que ser
 * leitura humana" — que é um achado, não um fracasso.
 *
 * Os juízes recebem SÓ letra + corpo. O `data-slug` de cada card (que é o
 * gabarito do botão "revelar" do artefato) é removido e o payload é conferido:
 * se sobrar nome de modelo, o script aborta em vez de rodar cego-de-mentira.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_pdi-leitura-cega-painel.ts
 */
import { readFileSync } from 'node:fs';
import { callAI } from '../actions/ai-client';

const ARQUIVO = process.env.PDI_ARTEFATO_HTML
  || 'C:/Users/rdnav/.claude/projects/C--GAS-Vertho-App/4be2ac38-ac8a-4757-a958-2b0646f7f8ef/tool-results/artifact-e8161cfa-1786323574-3afc.html';

/** Juízes: um por família disponível. Cada um é também concorrente — ver acima. */
const JUIZES = [
  { modelo: 'gpt-5.6-sol', familia: 'openai' },
  { modelo: 'gemini-3.7-flash', familia: 'google' },
  { modelo: 'qwen3.8-max', familia: 'alibaba' },
  { modelo: 'kimi-k3', familia: 'moonshot' },
];

/** Família de cada letra — usado SÓ depois, para medir auto-preferência. */
function familiaDoSlug(slug: string): string {
  if (slug.startsWith('claude')) return 'anthropic';
  if (slug.startsWith('gpt')) return 'openai';
  if (slug.startsWith('gemini')) return 'google';
  if (slug.startsWith('kimi')) return 'moonshot';
  return 'desconhecida';
}

function htmlParaTexto(html: string): string {
  return html
    .replace(/<h4[^>]*>/g, '\n### ')
    .replace(/<h3[^>]*>/g, '\n## ')
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<\/(p|div|section|ul|h3|h4|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extrairCards(html: string) {
  const out: Array<{ letra: string; slug: string; texto: string }> = [];
  const re = /<article class="card" id="card-([A-Z])" data-slug="([^"]+)"[\s\S]*?<div class="corpo">([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ letra: m[1], slug: m[2], texto: htmlParaTexto(m[3]) });
  return out;
}

const SYSTEM = `Você avalia a QUALIDADE DE ESCRITA de Planos de Desenvolvimento Individual (PDI) em português do Brasil.

Quem lê o PDI é a própria pessoa avaliada e o gestor dela. Você NÃO está julgando se o plano está tecnicamente correto — todos foram gerados a partir dos mesmos dados, com a mesma estrutura, e já passaram por validação automática.

Julgue só o que separa um texto do outro para quem lê:
1. ESPECIFICIDADE — fala de comportamento observável e de artefatos reais do trabalho, ou é conselho genérico que serviria para qualquer pessoa?
2. TOM — adulto e direto, ou condescendente/motivacional/clínico?
3. ACIONABILIDADE — a pessoa sabe o que fazer na segunda-feira de manhã?
4. HONESTIDADE — nomeia o gap sem eufemismo e sem crueldade?
5. ECONOMIA — cada parágrafo carrega peso, ou tem enchimento?

Você recebe textos identificados só por letra. Não sabe nem pode adivinhar quem escreveu cada um; se achar que reconhece um estilo, ignore essa impressão — ela é ruído.

Devolva APENAS JSON válido:
{"ranking":["<letra melhor>", ..., "<letra pior>"], "porque_o_primeiro":"<1-2 frases>", "porque_o_ultimo":"<1-2 frases>", "empates_reais":["<letras que você não consegue separar>"]}`;

async function main() {
  const html = readFileSync(ARQUIVO, 'utf-8');
  const cards = extrairCards(html);
  if (cards.length < 9) { console.error(`🔴 extraí ${cards.length} cards, esperava 9 — o parser não bate com o HTML.`); process.exit(1); }

  const payload = cards.map((c) => `═══ TEXTO ${c.letra} ═══\n\n${c.texto}`).join('\n\n');

  // Anti-vazamento: se um nome de modelo sobreviveu à limpeza, o painel não é
  // cego e o resultado não valeria nada. Aborta em vez de rodar e reportar.
  const VAZAMENTO = /claude|sonnet|opus|haiku|gpt-|openai|gemini|kimi|moonshot|qwen|anthropic|grok|muse/i;
  const achado = payload.match(VAZAMENTO);
  if (achado) { console.error(`🔴 VAZAMENTO no payload: "${achado[0]}" — o painel não seria cego. Abortado.`); process.exit(1); }

  console.log(`9 textos extraídos e limpos · ${Math.round(payload.length / 1024)}KB · nenhum nome de modelo no payload`);
  console.log(`gabarito (usado só na apuração): ${cards.map((c) => `${c.letra}=${familiaDoSlug(c.slug)}`).join(' ')}\n`);

  const vereditos: Array<{ juiz: string; familia: string; ranking: string[]; porque1: string; porqueN: string }> = [];
  for (const j of JUIZES) {
    try {
      const t0 = Date.now();
      // Teto 16k e timeout 5min por medição, não por precaução genérica:
      //  · kimi-k3 gastou 3.997 de 4.000 tokens em RACIOCÍNIO e devolveu conteúdo
      //    vazio (o `conteudoOuFalhaAlto` acusou). Modelo que raciocina divide o
      //    teto com o raciocínio — teto apertado aqui vira resposta vazia, não
      //    resposta curta.
      //  · qwen3.8-max roda a ~21 tok/s (medido pela Artificial Analysis e
      //    confirmado aqui): 120s não dá para um ranking de 9 textos.
      const r = await callAI(SYSTEM, payload, { model: j.modelo }, 16000, {
        taskKey: 'pdi_leitura_cega', source: 'eval', timeoutMs: 300_000,
      });
      const json = JSON.parse(r.replace(/^```json\n?|```$/g, '').trim());
      vereditos.push({ juiz: j.modelo, familia: j.familia, ranking: json.ranking, porque1: json.porque_o_primeiro, porqueN: json.porque_o_ultimo });
      console.log(`✓ ${j.modelo.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(0)}s → ${json.ranking.join(' > ')}`);
    } catch (e: any) {
      console.log(`🔴 ${j.modelo}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  if (vereditos.length < 2) { console.error('\nmenos de 2 juízes responderam — sem painel, sem veredito.'); process.exit(1); }

  // ── Apuração ──
  const letras = cards.map((c) => c.letra);
  const posicao = (v: typeof vereditos[number], l: string) => { const i = v.ranking.indexOf(l); return i === -1 ? letras.length : i + 1; };

  console.log('\n── posição média por texto (1 = melhor) ──');
  const media = letras.map((l) => ({
    letra: l,
    familia: familiaDoSlug(cards.find((c) => c.letra === l)!.slug),
    slug: cards.find((c) => c.letra === l)!.slug,
    media: vereditos.reduce((s, v) => s + posicao(v, l), 0) / vereditos.length,
  })).sort((a, b) => a.media - b.media);
  for (const m of media) console.log(`  ${m.letra}  ${m.media.toFixed(2)}   ${m.slug}`);

  console.log('\n── AUTO-PREFERÊNCIA (o juiz favorece a própria família?) ──');
  let contaminado = false;
  for (const v of vereditos) {
    const propria = letras.filter((l) => familiaDoSlug(cards.find((c) => c.letra === l)!.slug) === v.familia);
    if (!propria.length) { console.log(`  ${v.juiz.padEnd(18)} não tem texto da própria família no conjunto`); continue; }
    const mPropria = propria.reduce((s, l) => s + posicao(v, l), 0) / propria.length;
    const outras = letras.filter((l) => !propria.includes(l));
    const mOutras = outras.reduce((s, l) => s + posicao(v, l), 0) / outras.length;
    const delta = mOutras - mPropria; // positivo = favoreceu a própria
    if (delta > 1.5) contaminado = true;
    console.log(`  ${v.juiz.padEnd(18)} própria ${mPropria.toFixed(2)} vs outras ${mOutras.toFixed(2)}  → ${delta > 1.5 ? '🔴 favorece a própria' : delta < -1.5 ? '⚠️ penaliza a própria' : 'sem viés claro'}`);
  }

  // ── Agregado NEUTRALIZADO ──
  // Melhor que só sinalizar o viés: descontá-lo. Para cada texto, a posição é a
  // média SÓ dos juízes de outra família — ninguém pontua a própria casa. É o
  // mesmo princípio do Dual-IA aplicado à apuração, e sobrevive mesmo com um
  // juiz claramente enviesado no conjunto.
  console.log('\n── posição média EXCLUINDO o juiz da mesma família (neutralizado) ──');
  const neutro = letras.map((l) => {
    const fam = familiaDoSlug(cards.find((c) => c.letra === l)!.slug);
    const votantes = vereditos.filter((v) => v.familia !== fam);
    return {
      letra: l,
      slug: cards.find((c) => c.letra === l)!.slug,
      n: votantes.length,
      media: votantes.length ? votantes.reduce((s, v) => s + posicao(v, l), 0) / votantes.length : NaN,
    };
  }).filter((x) => x.n > 0).sort((a, b) => a.media - b.media);
  for (const m of neutro) console.log(`  ${m.letra}  ${m.media.toFixed(2)}  (n=${m.n})  ${m.slug}`);

  console.log(`\n${contaminado
    ? '🔴 Ao menos um juiz favoreceu a própria família por mais de 1,5 posição — use a tabela NEUTRALIZADA, não a bruta.'
    : '✅ Nenhum juiz favoreceu a própria família de forma clara.'}`);
  console.log('⚠️ Em qualquer cenário isto é INSUMO, não veredito: n é pequeno, e a voz do produto\n'
    + '   em pt-BR é decisão de dono. O artefato segue intacto para a leitura humana.');
  process.exit(0);
}

main();
