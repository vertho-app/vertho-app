/* eslint-disable */
// TEMPORÁRIO — acompanha um ia_jobs até terminar. Emite uma linha por mudança.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const JOB = process.argv[2];

async function main() {
  const sb = createSupabaseAdmin();
  let ultimo = '';
  for (let i = 0; i < 720; i++) {
    const { data, error } = await sb.from('ia_jobs').select('status, progress, error').eq('id', JOB).maybeSingle();
    if (error) { console.log(`ERRO consulta: ${error.message}`); await new Promise((r) => setTimeout(r, 15000)); continue; }
    const j: any = data || {};
    const p = j.progress || {};
    const linha = `${j.status} ${p.done ?? '?'}/${p.total ?? '?'} — ${p.current || ''}`;
    if (linha !== ultimo) { console.log(linha); ultimo = linha; }
    if (['done', 'concluido', 'concluído', 'error', 'erro', 'failed', 'cancelado'].includes(String(j.status))) {
      const res = (p.resultados || []) as any[];
      const ok = res.filter((r) => r.ok).length;
      console.log(`FIM: status=${j.status} · ${ok}/${res.length} ok${j.error ? ` · erro=${j.error}` : ''}`);
      for (const r of res.filter((x) => !x.ok)) console.log(`  ✗ ${r.modulo}: ${r.error}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log('FIM: timeout do watcher (3h)');
}
main().catch((e) => { console.log('FIM: watcher morreu — ' + (e?.message || e)); });
