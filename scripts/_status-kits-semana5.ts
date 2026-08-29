/* eslint-disable */
/**
 * Acompanha os jobs de kit enfileirados por `_gerar-kits-semana5.ts`.
 *
 * `--watch` faz polling até não sobrar `queued`/`running` (ou até o teto de tempo).
 * O teto existe porque job de kit não tem watchdog: se o Trigger.dev engasgar, a linha
 * fica `running` para sempre e um loop sem teto esperaria a noite inteira (é o achado
 * `kit-job-preso` do health estrutural).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_status-kits-semana5.ts [--watch] [--min 45]
 */
import { createSupabaseAdmin } from '@/lib/supabase';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const WATCH = process.argv.includes('--watch');
const iMin = process.argv.indexOf('--min');
const TETO_MIN = iMin > -1 ? Number(process.argv[iMin + 1]) : 45;
const DESDE_MIN = 90;   // janela: os jobs desta rodada

async function snapshot(sb: any) {
  const { data } = await sb.from('kit_jobs')
    .select('id, status, competencia, descritor, progress, error, params, updated_at')
    .eq('empresa_id', EMP)
    .gte('created_at', new Date(Date.now() - DESDE_MIN * 60_000).toISOString())
    .order('created_at', { ascending: true });
  return (data || []) as any[];
}

function resumo(jobs: any[]) {
  const por: Record<string, number> = {};
  let done = 0, total = 0;
  for (const j of jobs) {
    por[j.status] = (por[j.status] || 0) + 1;
    done += Number(j.progress?.done || 0);
    total += Number(j.progress?.total || 0);
  }
  return { por, done, total };
}

async function main() {
  const sb = createSupabaseAdmin();
  const t0 = Date.now();

  for (;;) {
    const jobs = await snapshot(sb);
    const { por, done, total } = resumo(jobs);
    const ativos = (por.queued || 0) + (por.running || 0);
    const linha = Object.entries(por).map(([k, v]) => `${k}:${v}`).join(' · ');
    const min = ((Date.now() - t0) / 60_000).toFixed(1);
    console.log(`[${min}min] ${jobs.length} job(s) — ${linha} — DISC ${done}/${total}`);

    const falhos = jobs.filter((j) => j.status === 'error');
    for (const f of falhos) console.log(`   ✗ ${f.descritor}: ${String(f.error || '').slice(0, 160)}`);

    if (!WATCH || !ativos) {
      if (!ativos) {
        console.log('\n=== FIM ===');
        for (const j of jobs) {
          const p = j.progress || {};
          const icone = j.status === 'done' ? '✓' : j.status === 'error' ? '✗' : '·';
          console.log(`${icone} ${String(j.descritor).slice(0, 38).padEnd(38)} ${String(j.params?.cargo || '').slice(0, 20).padEnd(20)} ${p.done || 0}/${p.total || 0} ${j.status}`);
        }
      }
      return;
    }
    if ((Date.now() - t0) / 60_000 > TETO_MIN) {
      console.log(`\n⚠️ teto de ${TETO_MIN}min atingido com ${ativos} job(s) ativo(s) — investigar Trigger.dev (kit-job-preso).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
