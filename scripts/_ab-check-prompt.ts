/* eslint-disable */
// A/B do prompt do AUDITOR: v1 (o modelo escreve a nota) × v2 (checklist
// binário, nota somada em código), sobre AS MESMAS respostas e o MESMO número
// de rodadas. Nada é persistido.
//
// Por que existe: as primeiras comparações rodaram com 3–5 respostas, e o erro
// da própria medição ficou da ordem do efeito medido — três leituras do mesmo
// prompt deram dp 6,3 / 6,5 / 10,8. Pior: o seletor usava `.limit(N)` SEM
// `order`, então nem o conjunto era garantidamente o mesmo entre execuções.
// Aqui o conjunto é fixo (`order('id')`) e os dois braços veem exatamente as
// mesmas entradas.
//
// Uso: npx tsx scripts/_ab-check-prompt.ts [slug] [n_respostas] [repeticoes]
process.loadEnvFile('.env.local');
import { writeFileSync } from 'node:fs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { montarCheckIA4Prompt, processCheckResult } from '@/lib/check-ia4-core';
import { CHECK_SYSTEM_V1 } from '@/tests/fixtures/check-prompt-v1';

const SLUG = process.argv[2] || 'macae';
const N_RESP = Number(process.argv[3] || 15);
const REPS = Number(process.argv[4] || 3);
const MODELO = 'gpt-5.6-terra';
const SAIDA = process.argv[5] || 'ab-check.json';

const dp = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const med = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  // `order('id')` FIXA o conjunto — sem isso, execuções diferentes podem pegar
  // respostas diferentes e a comparação vira comparação de amostras, não de prompts.
  const { data: respostas, error } = await sb.from('respostas')
    .select('id, empresa_id, colaborador_id, competencia_id, competencia_nome, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
    .eq('empresa_id', empresaId)
    .not('avaliacao_ia', 'is', null)
    .order('id')
    .limit(N_RESP);
  if (error) throw new Error(error.message);

  console.log(`A/B do auditor · ${respostas?.length} respostas × ${REPS} rodadas × 2 prompts · modelo=${MODELO}\n`);

  const linhas: any[] = [];
  for (const [i, resp] of (respostas || []).entries()) {
    const { system: systemV2, prefix, user } = await montarCheckIA4Prompt(sb, resp, empresaId);
    const opts = { timeoutMs: 180000, maxRetries: 0, cachedUserPrefix: prefix } as const;

    const rodar = async (system: string) => {
      try {
        const txt = await callAI(system, user, { model: MODELO }, 8192, { ...opts, taskKey: 'ia4_check', empresaId });
        const { status, check } = processCheckResult(await extractJSON(txt));
        return check ? { nota: check.nota as number, status, falhos: (check.itens_falhos || []).map((f: string) => f.split(':')[0]) } : null;
      } catch (e: any) { console.error(`   falhou: ${e?.message}`); return null; }
    };

    const [v1, v2] = await Promise.all([
      Promise.all(Array.from({ length: REPS }, () => rodar(CHECK_SYSTEM_V1))),
      Promise.all(Array.from({ length: REPS }, () => rodar(systemV2))),
    ]);

    const notas = (arr: any[]) => arr.filter(Boolean).map((x) => x.nota);
    const vereditos = (arr: any[]) => [...new Set(arr.filter(Boolean).map((x) => x.status))];
    const n1 = notas(v1), n2 = notas(v2);
    linhas.push({ id: resp.id, v1: { notas: n1, vereditos: vereditos(v1) }, v2: { notas: n2, vereditos: vereditos(v2), falhos: v2.filter(Boolean).map((x: any) => x.falhos) } });
    console.log(`[${i + 1}/${respostas?.length}] ${String(resp.id).slice(0, 8)}`);
    console.log(`   v1 (nota livre): ${n1.join(' · ')} → dp ${dp(n1).toFixed(1)} · vereditos {${vereditos(v1).join(',')}}`);
    console.log(`   v2 (checklist):  ${n2.join(' · ')} → dp ${dp(n2).toFixed(1)} · vereditos {${vereditos(v2).join(',')}}`);
  }

  writeFileSync(SAIDA, JSON.stringify({ slug: SLUG, reps: REPS, modelo: MODELO, linhas }, null, 2), 'utf8');

  const resumo = (braco: 'v1' | 'v2') => {
    const ok = linhas.filter((l) => l[braco].notas.length >= 2);
    const dps = ok.map((l) => dp(l[braco].notas));
    const amps = ok.map((l) => Math.max(...l[braco].notas) - Math.min(...l[braco].notas));
    const virou = ok.filter((l) => l[braco].vereditos.length > 1).length;
    return { n: ok.length, dp: med(dps), amp: med(amps), virou, media: med(ok.flatMap((l) => l[braco].notas)) };
  };
  const a = resumo('v1'), b = resumo('v2');
  console.log('\n══════ A/B ══════');
  console.log(`v1 (nota livre): n=${a.n} · dp médio ${a.dp.toFixed(1)} · amplitude ${a.amp.toFixed(1)} · veredito mudou em ${a.virou}/${a.n} · nota média ${a.media.toFixed(1)}`);
  console.log(`v2 (checklist):  n=${b.n} · dp médio ${b.dp.toFixed(1)} · amplitude ${b.amp.toFixed(1)} · veredito mudou em ${b.virou}/${b.n} · nota média ${b.media.toFixed(1)}`);
  console.log(`\nΔ dp ${(b.dp - a.dp).toFixed(1)} · Δ amplitude ${(b.amp - a.amp).toFixed(1)} · Δ vereditos instáveis ${b.virou - a.virou}`);
  // Itens que mais discordam entre rodadas no v2 — é o que se conserta depois.
  const cont: Record<string, number> = {};
  for (const l of linhas) for (const rodada of (l.v2.falhos || [])) for (const id of rodada) cont[id] = (cont[id] || 0) + 1;
  console.log('reprovações por item (v2):', Object.entries(cont).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join(' · ') || '—');
  console.log(`JSON: ${SAIDA}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
