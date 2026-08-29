/* eslint-disable */
/**
 * Enfileira os kits que a SEMANA 5 do Ibipeba demanda e ainda não existem.
 *
 * Por que um script e não a tela: `planejarKitsCoorte`/`enqueueKit` são `'use server'`
 * com `requireAdminSupabase('content.manage')` — não há sessão aqui. A LEITURA usa o
 * núcleo headless (`levantarPlanoKitsCoorte`, o MESMO que a tela e o alarme de horizonte
 * usam) e a execução replica o passo 6 da action: insert em `kit_jobs` + dispatch da task
 * `gerar-kit` no Trigger.dev. Reimplementar a varredura produziria um plano que diverge
 * do que a tela mostraria.
 *
 * ESCOPO: `semanaMin = semanaMax = 5`. Sem isso o plano varre a trilha inteira e
 * enfileiraria também as semanas 6-7 (medido 27/07: 76 DISC em vez de 42).
 *
 * Decisões travadas nesta rodada:
 *  · `incluirVideo: false` — medido com `_predict-video-overlay 5`: sobrevive 0 · perde 0 ·
 *    já sem vídeo 42. Ninguém perde vídeo porque ninguém tem; render custa ~$0,64/célula
 *    e é decisão separada.
 *  · `useBatch` segue o default do sistema (≥2 DISC no item) — Batch API −50%.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_gerar-kits-semana5.ts           (dry-run)
 *      npx tsx --env-file=.env.local scripts/_gerar-kits-semana5.ts --apply
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.env.SEMANA_ALVO || 5);
const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createSupabaseAdmin();
  const base = await levantarPlanoKitsCoorte(sb, EMP, { semanaMin: SEMANA, semanaMax: SEMANA });
  if ('error' in base) throw new Error(base.error);

  const pendentes = base.plano.filter((p) => p.faltantes.length > 0);
  const totalDiscs = pendentes.reduce((s, p) => s + p.faltantes.length, 0);

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · semana ${SEMANA} · ${base.colaboradores} colaboradores`);
  console.log(`${base.plano.length} tema(s) demandado(s) · ${pendentes.length} com lacuna · ${totalDiscs} DISC a gerar\n`);

  for (const p of pendentes) {
    const batch = p.faltantes.length >= 2;
    console.log(`• ${p.cargo.padEnd(22)} | ${String(p.descritor).slice(0, 34).padEnd(34)} | ${p.faltantes.join('')} ` +
      `| ${p.pessoas}p | ctx=${p.contexto} n${p.nivelMin}-${p.nivelMax} | brief ${p.briefExistente ? 'existe' : 'NOVO'}${batch ? ' | batch' : ''}`);
  }

  // Custo: ~$0,22/DISC síncrono, ~$0,11 em batch (medido 19/07, KIT-SEMANAL.md).
  const emBatch = pendentes.filter((p) => p.faltantes.length >= 2).reduce((s, p) => s + p.faltantes.length, 0);
  const sync = totalDiscs - emBatch;
  console.log(`\nestimativa: ${emBatch} DISC em batch (~$${(emBatch * 0.11).toFixed(2)}) + ${sync} síncrono(s) (~$${(sync * 0.22).toFixed(2)}) ≈ $${(emBatch * 0.11 + sync * 0.22).toFixed(2)}`);

  if (!APPLY) { console.log('\n→ rode com --apply'); return; }

  console.log('\nEnfileirando...');
  let ok = 0, erros = 0;
  for (const p of pendentes) {
    const discs = p.faltantes;
    const jobParams = {
      nivelMin: p.nivelMin, nivelMax: p.nivelMax,
      cargo: p.cargo, contexto: p.contexto,
      discs, renderAudio: false,
      useBatch: discs.length >= 2,
      incluirVideo: false,
    };
    const { data: job, error } = await sb.from('kit_jobs').insert({
      empresa_id: EMP, competencia: p.competencia, descritor: p.descritor,
      params: jobParams, status: 'queued',
      progress: { done: 0, total: discs.length, current: 'na fila', kits: [] },
    }).select('id').single();
    if (error) { erros++; console.log(`  ✗ ${p.descritor}: ${error.message}`); continue; }
    try {
      await tasks.trigger('gerar-kit', { jobId: job.id }, regionOpts());
      ok++;
      console.log(`  ✓ ${String(p.descritor).slice(0, 40).padEnd(40)} job ${String(job.id).slice(0, 8)} (${discs.join('')})`);
    } catch (e: any) {
      erros++;
      await sb.from('kit_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      console.log(`  ✗ dispatch ${p.descritor}: ${e?.message}`);
    }
  }
  console.log(`\njobs enfileirados: ${ok} · erros: ${erros}`);
  console.log('Acompanhar: npx tsx --env-file=.env.local scripts/_status-kits-semana5.ts');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
