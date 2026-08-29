/* eslint-disable */
// Prova o lock de execução contra o banco REAL, com concorrência de verdade.
// Um teste unitário com mock provaria o meu mock, não o ON CONFLICT do Postgres —
// e é exatamente a atomicidade do banco que está sendo afirmada aqui.
process.loadEnvFile('.env.local');
import { adquirirLockDiario } from '@/lib/cron-lock';
import { createSupabaseAdmin } from '@/lib/supabase';

const JOB = '_teste_lock_concorrencia';
const DIA = '2099-01-01'; // data fictícia: não colide com execução real

async function main() {
  const sb = createSupabaseAdmin();
  await sb.from('cron_execucoes').delete().eq('job', JOB).eq('dia', DIA);

  // 5 tentativas SIMULTÂNEAS — o cenário do retry do Vercel sobre o cron.
  const r = await Promise.all(Array.from({ length: 5 }, () => adquirirLockDiario(JOB, DIA)));
  const ganharam = r.filter((x) => x.adquirido).length;
  console.log(`5 tentativas simultâneas → ${ganharam} adquiriu(ram), ${5 - ganharam} recusada(s)`);
  console.log(ganharam === 1 ? '  ✅ exclusão mútua garantida' : `  ❌ FALHOU: esperado exatamente 1, veio ${ganharam}`);

  // Depois de concluído, o dia não roda de novo.
  await r.find((x) => x.adquirido)!.liberar('teste');
  const depois = await adquirirLockDiario(JOB, DIA);
  console.log(`após concluir → ${depois.adquirido ? '❌ readquiriu (errado)' : `✅ recusado: ${depois.motivo}`}`);

  // Execução morta (iniciada há 45min sem concluir) tem que ser reclamável, senão o
  // job trava para sempre e "duplicar" vira "nunca mais enviar".
  await sb.from('cron_execucoes').update({
    concluido_em: null,
    iniciado_em: new Date(Date.now() - 45 * 60_000).toISOString(),
  }).eq('job', JOB).eq('dia', DIA);
  const morta = await adquirirLockDiario(JOB, DIA);
  console.log(`execução morta há 45min → ${morta.adquirido ? '✅ lock reclamado' : `❌ travado: ${morta.motivo}`}`);

  // Execução viva (2min) NÃO pode ser reclamada.
  await sb.from('cron_execucoes').update({
    concluido_em: null, iniciado_em: new Date(Date.now() - 2 * 60_000).toISOString(),
  }).eq('job', JOB).eq('dia', DIA);
  const viva = await adquirirLockDiario(JOB, DIA);
  console.log(`execução viva há 2min → ${viva.adquirido ? '❌ roubou o lock' : `✅ recusado: ${viva.motivo}`}`);

  await sb.from('cron_execucoes').delete().eq('job', JOB).eq('dia', DIA);
  console.log('\n(linha de teste removida)');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
