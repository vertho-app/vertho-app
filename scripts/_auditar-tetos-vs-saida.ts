/**
 * Audita a FOLGA de `max_tokens` de cada task contra a saída realmente medida.
 *
 * Por que isto existe (25/08/2026): em modelo de RACIOCÍNIO, `max_tokens` é
 * orçamento COMPARTILHADO entre pensar e escrever — o modelo pensa primeiro e
 * escreve com o que sobra. Teto justo não vira "resposta curta": vira resposta
 * CORTADA no meio, e em JSON isso é parse quebrado.
 *
 * Medido hoje, em quatro famílias diferentes — não é peculiaridade da Anthropic:
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
 * Teto não é gasto: paga-se pelos tokens produzidos. Subir é quase de graça; o
 * limite real é `maxDuration` da rota (300s) e o teto de saída do modelo.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_auditar-tetos-vs-saida.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createSupabaseAdmin } from '../lib/supabase';

const RAIZ = join(__dirname, '..');
const DIRS = ['actions', 'lib', 'app', 'trigger'];

function varrer(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) varrer(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

/** Extrai (taskKey, teto) de cada chamada a callAI/callAIChat. */
function extrairTetos(): Map<string, { teto: number; onde: string }[]> {
  const mapa = new Map<string, { teto: number; onde: string }[]>();
  for (const dir of DIRS) {
    let arquivos: string[];
    try { arquivos = varrer(join(RAIZ, dir)); } catch { continue; }
    for (const f of arquivos) {
      const src = readFileSync(f, 'utf-8');
      // A chamada pode quebrar linha; casa do `callAI(` até o `)` do options.
      const re = /callAI(?:Chat)?\s*\(([\s\S]{0,900}?)\)\s*[;,)]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const corpo = m[1];
        const task = corpo.match(/taskKey:\s*'([a-z0-9_]+)'/)?.[1];
        if (!task) continue;
        // 4º argumento posicional = maxTokens. Pega o último número solto antes
        // do objeto de options.
        const antesDoOptions = corpo.slice(0, corpo.indexOf('{ taskKey') >= 0 ? corpo.indexOf('{ taskKey') : corpo.length);
        const nums = [...antesDoOptions.matchAll(/(?:^|,)\s*(\d{3,6})\s*(?:,|$)/g)].map((x) => Number(x[1]));
        const teto = nums.length ? nums[nums.length - 1] : NaN;
        if (!Number.isFinite(teto)) continue;
        const lista = mapa.get(task) || [];
        lista.push({ teto, onde: relative(RAIZ, f).replace(/\\/g, '/') });
        mapa.set(task, lista);
      }
    }
  }
  return mapa;
}

async function main() {
  const tetos = extrairTetos();
  const sb = createSupabaseAdmin();
  // Saída observada por feature (o ledger é a fonte).
  const { data: uso } = await sb
    .from('ia_usage_log')
    .select('feature, output_tokens')
    .gt('output_tokens', 0)
    .limit(50000);

  const porFeature = new Map<string, number[]>();
  for (const r of (uso || []) as any[]) {
    const l = porFeature.get(r.feature) || [];
    l.push(r.output_tokens);
    porFeature.set(r.feature, l);
  }
  const p95 = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };

  const linhas: Array<{ task: string; teto: number; p95: number; n: number; folga: number; onde: string }> = [];
  for (const [task, ocorrencias] of tetos) {
    const obs = porFeature.get(task);
    if (!obs || obs.length < 3) continue;
    const teto = Math.min(...ocorrencias.map((o) => o.teto)); // o mais APERTADO manda
    const p = p95(obs);
    linhas.push({ task, teto, p95: p, n: obs.length, folga: teto / p, onde: ocorrencias[0].onde });
  }
  linhas.sort((a, b) => a.folga - b.folga);

  console.log('folga = teto ÷ p95 da saída observada. <2x é apertado para modelo que pensa,');
  console.log('porque o raciocínio divide o MESMO teto com o texto.\n');
  console.log('  folga  teto    p95    n     task');
  for (const l of linhas) {
    const flag = l.folga < 1.5 ? '🔴' : l.folga < 2.5 ? '⚠️ ' : '✅';
    console.log(`  ${flag} ${l.folga.toFixed(1)}x  ${String(l.teto).padStart(6)} ${String(l.p95).padStart(6)} ${String(l.n).padStart(5)}  ${l.task}  (${l.onde})`);
  }
  const apertados = linhas.filter((l) => l.folga < 2.5);
  console.log(`\n${apertados.length} task(s) com folga < 2,5x — cada uma precisa do teto revisto ANTES de receber`);
  console.log('qualquer modelo de raciocínio (Sonnet 5, Opus 5, Qwen, Kimi, Muse Spark).');
  process.exit(0);
}

main();
