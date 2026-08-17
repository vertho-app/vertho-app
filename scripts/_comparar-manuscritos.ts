/**
 * Compara dois manuscritos microbloco a microbloco: o que existe nos dois
 * (mesmo ID · mesmo título · título parecido) e o que só existe em um.
 * Uso: npx tsx scripts/_comparar-manuscritos.ts "<antigo.docx>" "<novo.docx>"
 */
import { readFileSync } from 'node:fs';

const RE_CABECALHO =
  /^(.+?)\s*[|·]\s*([A-Z]{2,5}\d{2})\s*[|·]\s*(.+?)\s*[|·]\s*ID:\s*([A-Z]{2,5}\d{2}_MB\d{2,3})\s*(?:[|·]\s*)?(.*)$/gim;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'para', 'com', 'que', 'sem', 'um', 'uma', 'por']);
const toks = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((t) => b.has(t)).length;
  return inter / (a.size + b.size - inter || 1);
};

async function ler(caminho: string) {
  const { default: mammoth } = await import('mammoth');
  const raw = (await mammoth.extractRawText({ buffer: readFileSync(caminho) })).value || '';
  return [...raw.matchAll(RE_CABECALHO)].map((m) => ({
    id: m[4],
    num: Number(m[4].split('_MB')[1]),
    desc: m[3].trim(),
    titulo: (m[5] || '').trim(),
  }));
}

async function main() {
  const [pa, pb] = process.argv.slice(2);
  const A = await ler(pa);
  const B = await ler(pb);
  console.log(`ANTIGO: ${A.length} MBs · ${new Set(A.map((m) => m.desc)).size} descritores`);
  console.log(`NOVO:   ${B.length} MBs · ${new Set(B.map((m) => m.desc)).size} descritores`);

  console.log('\n— descritores —');
  const dA = [...new Set(A.map((m) => m.desc))];
  const dB = [...new Set(B.map((m) => m.desc))];
  for (const d of dA) {
    const par = dB.map((x) => ({ x, s: jaccard(toks(d), toks(x)) })).sort((p, q) => q.s - p.s)[0];
    console.log(`  antigo "${d}"  →  ${par.s > 0 ? `"${par.x}" (${(par.s * 100).toFixed(0)}%)` : 'SEM correspondente'}`);
  }
  for (const d of dB) {
    const s = Math.max(0, ...dA.map((x) => jaccard(toks(d), toks(x))));
    if (s === 0) console.log(`  novo   "${d}"  →  SEM correspondente no antigo`);
  }

  console.log('\n— microblocos: mesmo ID, mesmo conteúdo? —');
  const porId = new Map(A.map((m) => [m.id, m]));
  let iguais = 0, colididos = 0;
  for (const b of B) {
    const a = porId.get(b.id);
    if (!a) continue;
    if (norm(a.titulo) === norm(b.titulo)) iguais++;
    else colididos++;
  }
  console.log(`  IDs presentes nos dois: ${B.filter((b) => porId.has(b.id)).length}`);
  console.log(`    com o MESMO título: ${iguais}`);
  console.log(`    com título DIFERENTE (colisão de ID, conteúdo outro): ${colididos}`);

  console.log('\n— títulos parecidos (independente do ID) —');
  let pares = 0;
  for (const b of B) {
    const cand = A.map((a) => ({ a, s: jaccard(toks(a.titulo), toks(b.titulo)) })).sort((p, q) => q.s - p.s)[0];
    if (cand && cand.s >= 0.5) {
      pares++;
      console.log(`  ${(cand.s * 100).toFixed(0)}%  novo ${b.id} "${b.titulo.slice(0, 52)}"  ~  antigo ${cand.a.id} "${cand.a.titulo.slice(0, 52)}"`);
    }
  }
  console.log(`  pares com ≥50% de sobreposição de termos: ${pares} de ${B.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
