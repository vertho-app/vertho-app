/**
 * Verificação (descartável) de manuscrito autoral: roda o parser determinístico
 * e, independentemente dele, imprime a GRADE (descritor × faixa) derivada da
 * numeração dos microblocos — que é o que decide se o import passa.
 *
 * Uso: npx tsx scripts/_verificar-dir10.ts "<a.docx>" ["<b.docx>" ...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parsearManuscrito } from '../lib/manuscrito-parser';

const RE_CABECALHO =
  /^(.+?)\s*[|·]\s*([A-Z]{2,5}\d{2})\s*[|·]\s*(.+?)\s*[|·]\s*ID:\s*([A-Z]{2,5}\d{2}_MB\d{2,3})\s*(?:[|·]\s*)?(.*)$/gim;
const RE_CAPA = /Manuscrito[- ]base\s*[·\-|]\s*(.+?)\s*[·\-|]\s*([A-Z]{2,5}\d{2})\s*$/im;
const FAIXAS = ['N1', 'N2', 'N3', 'N4'] as const;

async function analisar(caminho: string) {
  const buf = readFileSync(caminho);
  const { default: mammoth } = await import('mammoth');
  const raw = (await mammoth.extractRawText({ buffer: buf })).value || '';

  console.log(`\n${'='.repeat(78)}\n${basename(caminho)} (${(buf.length / 1024).toFixed(0)} KB)\n${'='.repeat(78)}`);

  const cabs = [...raw.matchAll(RE_CABECALHO)];
  const mbs = cabs.map((m) => ({
    cargo: m[1].trim(),
    cod: m[2],
    desc: m[3].trim(),
    id: m[4],
    num: Number(m[4].split('_MB')[1]),
    acao: (m[5] || '').trim(),
    idx: m.index!,
  }));
  console.log(`microblocos: ${mbs.length} · com ação na linha do cabeçalho: ${mbs.filter((m) => m.acao).length}`);
  console.log(`capa "Manuscrito-base · Cargo · COD": ${RE_CAPA.test(raw) ? 'OK' : 'NÃO CASA (metadados sairiam do 1º cabeçalho)'}`);

  // Título editorial: o parser pega a última linha não-vazia ANTES do cabeçalho.
  const antesDepois = mbs.slice(0, 3).map((m) => {
    const antes = raw.slice(Math.max(0, m.idx - 400), m.idx).split('\n').map((l) => l.trim()).filter(Boolean);
    const depois = raw.slice(m.idx).split('\n').map((l) => l.trim()).filter(Boolean)[1] || '';
    return { id: m.id, antes: (antes[antes.length - 1] || '').slice(0, 60), depois: depois.slice(0, 60) };
  });
  console.log('título editorial (o parser usa "antes"):');
  antesDepois.forEach((t) => console.log(`  ${t.id}  antes="${t.antes}"  depois="${t.depois}"`));

  // ── Grade descritor × faixa, pela NUMERAÇÃO global ────────────────────────
  const fimConteudo = (() => {
    const ult = mbs[mbs.length - 1].idx;
    const c = [...raw.matchAll(/^\s*S[íi]ntese\b.*$/gim)].find((m) => m.index! > ult);
    return c ? c.index! : raw.length;
  })();
  // Cauda que o parser NÃO corta: só "Síntese" fecha o conteúdo; um apêndice
  // posicionado antes dela é engolido pelo último microbloco.
  {
    const ult = mbs[mbs.length - 1].idx;
    const ap = [...raw.matchAll(/^\s*(Ap[êe]ndice|Refer[êe]ncias|Bibliografia)\b.*$/gim)].find((m) => m.index! > ult);
    if (ap && ap.index! < fimConteudo) {
      console.log(`⚠ "${ap[0].trim().slice(0, 60)}" está ANTES da Síntese → ${((fimConteudo - ap.index!) / 1000).toFixed(0)}k chars entram no último MB (${mbs[mbs.length - 1].id}).`);
    }
  }
  const charsDe = new Map<string, number>();
  mbs.forEach((m, i) => {
    const fim = i + 1 < mbs.length ? mbs[i + 1].idx : fimConteudo;
    charsDe.set(m.id, Math.max(0, fim - m.idx));
  });

  const grupos = new Map<string, number[]>();
  const charsGrupo = new Map<string, number>();
  for (const m of mbs) {
    if (!grupos.has(m.desc)) grupos.set(m.desc, []);
    grupos.get(m.desc)!.push(m.num);
    charsGrupo.set(m.desc, (charsGrupo.get(m.desc) || 0) + (charsDe.get(m.id) || 0));
  }
  console.log(`chars úteis: ${(([...charsDe.values()].reduce((a, b) => a + b, 0)) / 1000).toFixed(0)}k · média/MB: ${([...charsDe.values()].reduce((a, b) => a + b, 0) / mbs.length / 1000).toFixed(1)}k`);
  const D = grupos.size;
  const T = mbs.length;
  // Candidatos a "quantos MBs são de faixa": múltiplos de 4, sobrando no máximo
  // 1 síntese por descritor. Escolhe o que deixa mais descritores UNIFORMES
  // (mesma contagem nas 4 faixas) — é a leitura que o parser faz por posição.
  const uniformesCom = (Fc: number) => {
    const t = Fc / 4;
    let n = 0;
    for (const nums of grupos.values()) {
      const c = [0, 0, 0, 0];
      nums.forEach((x) => { if (x <= Fc) c[Math.floor((x - 1) / t)]++; });
      if (new Set(c).size === 1 && c[0] >= 1) n++;
    }
    return n;
  };
  const candidatos = [];
  for (let Fc = Math.floor(T / 4) * 4; Fc > 0; Fc -= 4) if (T - Fc <= D) candidatos.push(Fc);
  const F = candidatos.sort((a, b) => uniformesCom(b) - uniformesCom(a) || b - a)[0];
  const tam = F / 4;
  console.log(`\ncandidatos de faixa: ${candidatos.map((c) => `${c}(${uniformesCom(c)} uniformes)`).join(' ')}`);
  const faixaDe = (n: number) => (n <= F ? FAIXAS[Math.floor((n - 1) / tam)] : 'SINT');
  console.log(`\ngrade inferida: ${D} descritores · ${T} MBs = ${F} de faixa (${tam}/faixa) + ${T - F} síntese(s)`);
  console.log('desc                                   N1 N2 N3 N4 SI  tot  veredito');
  let ok = 0;
  for (const [nome, nums] of grupos) {
    const cont = { N1: 0, N2: 0, N3: 0, N4: 0, SINT: 0 } as Record<string, number>;
    nums.forEach((n) => cont[faixaDe(n)]++);
    const deFaixa = cont.N1 + cont.N2 + cont.N3 + cont.N4;
    const uniforme = new Set([cont.N1, cont.N2, cont.N3, cont.N4]).size === 1;
    const passa = uniforme && cont.N1 >= 1 && cont.SINT <= 1;
    if (passa) ok++;
    const alvo = Math.max(cont.N1, cont.N2, cont.N3, cont.N4);
    const falta = FAIXAS.map((f) => (alvo - cont[f] > 0 ? `${alvo - cont[f]}×${f}` : '')).filter(Boolean).join(' ');
    console.log(
      `${nome.padEnd(38).slice(0, 38)} ${String(cont.N1).padStart(2)} ${String(cont.N2).padStart(2)} ` +
        `${String(cont.N3).padStart(2)} ${String(cont.N4).padStart(2)} ${String(cont.SINT).padStart(2)}  ` +
        `${String(nums.length).padStart(3)} ${String(Math.round((charsGrupo.get(nome) || 0) / 1000)).padStart(4)}k  ${passa ? 'ok' : `FALHA (faixa=${deFaixa}; falta ${falta || 'síntese'})`}`,
    );
  }
  console.log(`descritores que fecham em 4×k [+1 síntese]: ${ok}/${D}`);
  const semSintese = [...grupos.entries()].filter(([, nums]) => !nums.some((n) => n > F)).map(([nome]) => nome);
  if (semSintese.length) console.log(`sem síntese própria: ${semSintese.join(', ')}`);

  if (process.env.ACOES) {
    console.log('\nMB · descritor · ação declarada no cabeçalho:');
    [...mbs].sort((a, b) => a.num - b.num).forEach((m) => {
      console.log(`  MB${String(m.num).padStart(2, '0')} ${faixaDe(m.num).padEnd(4)} ${String(Math.round((charsDe.get(m.id) || 0) / 1000)).padStart(3)}k ${m.desc.slice(0, 26).padEnd(26)} ${m.acao.slice(0, 70)}`);
    });
  }

  // ── Parser oficial ────────────────────────────────────────────────────────
  try {
    const p = await parsearManuscrito(buf);
    console.log(`\nPARSER: OK — ${p.stats.totalMicroblocos} MBs · ${p.stats.totalDescritores} descritores · ${p.stats.modulosPrevistos} módulos previstos · ${p.recursos.length} recursos`);
    p.avisos.forEach((a) => console.log(`  aviso: ${a}`));
    for (const d of p.descritores) {
      const chars = d.transicoes.map((t) => `${t.nivel_entrada}→${t.nivel_destino}:${(t.chars / 1000).toFixed(0)}k`).join(' ');
      console.log(`  ${d.indice}. ${d.descritor} — ${d.microblocos.map((m) => `${m.num}/${m.faixa}`).join(' ')} | ${chars}`);
    }
  } catch (e: any) {
    console.log(`\nPARSER: FALHA — ${e?.message || String(e)}`);
  }
}

async function main() {
  for (const c of process.argv.slice(2)) await analisar(c);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
