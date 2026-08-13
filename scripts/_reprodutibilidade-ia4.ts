/* eslint-disable */
// TEST-RETEST da IA4 e do auditor: roda a MESMA entrada N vezes e mede a
// dispersão. Nada é persistido — usa `consolidarNotasIA4` (o cálculo) sem
// `consolidarEPersistirIA4` (a gravação), e `montarCheckIA4Prompt` sem
// `persistirCheckIA4`.
//
// Por que existe: hoje sabemos que o veredito do auditor oscila (±20 pts
// observados entre rodadas), mas NÃO sabemos o desvio-padrão de nenhum dos
// dois instrumentos. Sem esse número, qualquer mudança de prompt/temperatura
// vira palpite — e "melhorou" fica indistinguível de sorteio.
//
// Uso: npx tsx scripts/_reprodutibilidade-ia4.ts [slug] [n_respostas] [repeticoes] [--temp0]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import {
  IA4_SYSTEM, IA4_MAX_TOKENS, IA4_COLAB_COLS, IA4_CALL_OPTIONS,
  carregarContextoLoteIA4, carregarContextoRespostaIA4, buildIA4UserPrompt,
  consolidarNotasIA4,
} from '@/lib/ia4-avaliacao';
import { montarCheckIA4Prompt, processCheckResult } from '@/lib/check-ia4-core';

const SLUG = process.argv[2] || 'macae';
const N_RESP = Number(process.argv[3] || 5);
const REPS = Number(process.argv[4] || 3);
const TEMP0 = process.argv.includes('--temp0');
const MODELO_AVAL = 'claude-sonnet-5';
const MODELO_CHECK = 'gpt-5.6-terra';

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
  const tdb = tenantDb(empresaId);

  // `order('id')` FIXA o conjunto: com `limit` sem ordem, o Postgres pode
  // devolver respostas diferentes a cada execução — e aí duas medições viram
  // comparação de AMOSTRAS, não do que se queria medir (mordeu em 12/08).
  const { data: respostas } = await tdb.from('respostas')
    .select('*')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null)
    .order('id')
    .limit(N_RESP);
  if (!respostas?.length) throw new Error('sem respostas');

  const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
  const { data: colabs } = await tdb.from('colaboradores').select(IA4_COLAB_COLS).in('id', colabIds);
  const colabMap: Record<string, any> = {};
  (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });
  const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sb, empresaId);

  console.log(`${respostas.length} resposta(s) × ${REPS} repetições · aval=${MODELO_AVAL} · check=${MODELO_CHECK}${TEMP0 ? ' · temperature=0' : ' · temperature=default'}\n`);

  const linhas: any[] = [];
  for (const resp of respostas) {
    const colab = colabMap[resp.colaborador_id] || {};
    const ctx = await carregarContextoRespostaIA4(tdb, sb, resp);
    const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, colab, empresa, contextoPPP, ctx);
    const optsAval: any = { ...IA4_CALL_OPTIONS, cachedUserPrefix, taskKey: 'ia4_avaliacao', empresaId };
    if (TEMP0) optsAval.temperature = 0;

    // As repetições vão em paralelo: é a MESMA entrada, não há dependência.
    const avals = await Promise.all(Array.from({ length: REPS }, async () => {
      try {
        const txt = await callAI(IA4_SYSTEM, user, { model: MODELO_AVAL }, IA4_MAX_TOKENS, { ...optsAval, taskKey: 'ia4_avaliacao', empresaId });
        const av = await extractJSON(txt);
        if (!Array.isArray(av?.avaliacao_por_descritor)) return null;
        const c = consolidarNotasIA4(av.avaliacao_por_descritor);
        return { media: c.mediaDescritores, nivel: c.nivelGeral, notas: Object.values(c.notasPorDesc).map((d: any) => d.nota_decimal) };
      } catch (e: any) { console.error(`   aval falhou: ${e?.message}`); return null; }
    }));

    // O CHECK audita sempre a avaliação JÁ PERSISTIDA (a mesma nas N rodadas) —
    // senão as duas variâncias se somam e não dá para separar quem oscila.
    const { system, prefix, user: userChk } = await montarCheckIA4Prompt(sb, resp, empresaId);
    const optsChk: any = { timeoutMs: 180000, maxRetries: 0, cachedUserPrefix: prefix, taskKey: 'ia4_check', empresaId };
    if (TEMP0) optsChk.temperature = 0;
    const checks = await Promise.all(Array.from({ length: REPS }, async () => {
      try {
        const txt = await callAI(system, userChk, { model: MODELO_CHECK }, 8192, { ...optsChk, taskKey: 'ia4_check', empresaId });
        const { status, check } = processCheckResult(await extractJSON(txt), resp.avaliacao_ia);
        return check ? { nota: check.nota as number, status, erro_grave: !!check.erro_grave, criticos: (check.criticos_falhos || []) as string[], falhos: (check.itens_falhos || []).map((f: string) => f.split(':')[0]) } : null;
      } catch (e: any) { console.error(`   check falhou: ${e?.message}`); return null; }
    }));

    const a = avals.filter(Boolean) as any[];
    const c = checks.filter(Boolean) as any[];
    const medias = a.map((x) => x.media);
    const notasChk = c.map((x) => x.nota);
    const niveis = [...new Set(a.map((x) => x.nivel))];
    const vereditos = [...new Set(c.map((x) => x.status))];

    linhas.push({ id: resp.id, medias, notasChk, niveis, vereditos });
    console.log(`${String(resp.id).slice(0, 8)} ${ctx.compNome?.slice(0, 30) || ''}`);
    console.log(`   avaliação: ${medias.map((m) => m.toFixed(2)).join(' · ')}  → dp ${dp(medias).toFixed(3)} · amplitude ${(Math.max(...medias) - Math.min(...medias)).toFixed(2)} · níveis {${niveis.join(',')}}`);
    console.log(`   check:     ${notasChk.join(' · ')}  → dp ${dp(notasChk).toFixed(1)} · amplitude ${Math.max(...notasChk) - Math.min(...notasChk)} · vereditos {${vereditos.join(',')}}`);
    // Quais itens cada rodada reprovou — é aqui que se vê se a discordância é
    // difusa (itens diferentes) ou concentrada num critério instável.
    if (c.some((x) => x.falhos?.length)) {
      console.log(`   itens reprovados por rodada: ${c.map((x) => `[${(x.falhos || []).join(',') || '—'}]`).join(' ')}`);
      console.log(`   críticos por rodada:         ${c.map((x) => `[${(x.criticos || []).join(',') || '—'}]`).join(' ')}`);
    }
  }

  const dpAval = linhas.map((l) => dp(l.medias));
  const dpChk = linhas.map((l) => dp(l.notasChk));
  const ampAval = linhas.map((l) => Math.max(...l.medias) - Math.min(...l.medias));
  const ampChk = linhas.map((l) => Math.max(...l.notasChk) - Math.min(...l.notasChk));
  console.log('\n══════ RESUMO ══════');
  console.log(`AVALIAÇÃO (nota 1–4): dp médio ${med(dpAval).toFixed(3)} · amplitude média ${med(ampAval).toFixed(2)} · máx ${Math.max(...ampAval).toFixed(2)}`);
  console.log(`  respostas em que o NÍVEL mudou entre rodadas: ${linhas.filter((l) => l.niveis.length > 1).length} de ${linhas.length}`);
  console.log(`CHECK (0–100):        dp médio ${med(dpChk).toFixed(1)} · amplitude média ${med(ampChk).toFixed(1)} · máx ${Math.max(...ampChk)}`);
  console.log(`  respostas em que o VEREDITO mudou entre rodadas: ${linhas.filter((l) => l.vereditos.length > 1).length} de ${linhas.length}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
