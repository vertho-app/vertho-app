/* eslint-disable */
// Acompanha um ia_job: imprime UMA linha por mudança de estado e sai quando o
// job termina (qualquer status que não seja queued/running) ou some.
// Uso: npx tsx scripts/_acompanhar-job.ts <jobId> [intervaloSegundos]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const ID = process.argv[2];
const INTERVALO = Number(process.argv[3] || 30) * 1000;

async function main() {
  if (!ID) throw new Error('informe o jobId');
  const sb = createSupabaseAdmin();
  let anterior = '';
  for (;;) {
    const { data, error } = await sb.from('ia_jobs').select('status, progress, error').eq('id', ID).maybeSingle();
    if (error) {
      console.log(`ERRO ao consultar: ${error.message}`);
    } else if (!data) {
      console.log('job não encontrado — encerrando.');
      return;
    } else {
      const p: any = (data as any).progress || {};
      const linha = `${(data as any).status} · ${p.done ?? '?'}/${p.total ?? '?'} · ${p.current ?? ''}`;
      if (linha !== anterior) {
        console.log(linha);
        anterior = linha;
      }
      if (!['queued', 'running'].includes(String((data as any).status))) {
        const err = (data as any).error;
        if (err) console.log(`erro do job: ${String(err).slice(0, 300)}`);
        const res = Array.isArray(p.resultados) ? p.resultados : [];
        for (const r of res.slice(0, 10)) console.log(`  resultado: ${JSON.stringify(r).slice(0, 220)}`);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, INTERVALO));
  }
}

main().catch((e) => { console.log(`FALHOU: ${e?.message || e}`); process.exit(1); });
