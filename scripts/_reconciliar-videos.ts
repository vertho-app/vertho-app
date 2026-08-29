/* eslint-disable */
// Reconciliação de vídeo nominal (F-V1) headless — o mesmo núcleo do cron.
//
// Uso:  npx tsx scripts/_reconciliar-videos.ts                     → DRY-RUN (lista as lacunas)
//       npx tsx scripts/_reconciliar-videos.ts --executar [limite] → re-enfileira as células
//       EMPRESA=<uuid> npx tsx scripts/_reconciliar-videos.ts      → restringe a um tenant
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { reconciliarPersonalizados } from '@/lib/video/reconciliar-personalizados';

const EXECUTAR = process.argv.includes('--executar');
const LIMITE = Number(process.argv.find((a) => /^\d+$/.test(a))) || 3;

async function main() {
  const r = await reconciliarPersonalizados({ executar: EXECUTAR, limite: LIMITE, empresaId: process.env.EMPRESA });

  console.log(`=== RECONCILIAÇÃO DE VÍDEO NOMINAL (F-V1) ===`);
  console.log(`${r.pessoasSemVideoNominal} pessoa(s) sem vídeo com nome, em ${r.lacunas.length} célula(s)\n`);

  for (const l of r.lacunas) {
    const porMotivo = l.faltantes.reduce((m: Record<string, number>, f) => ({ ...m, [f.motivo]: (m[f.motivo] || 0) + 1 }), {});
    console.log(`  ${l.cargo} · ${l.disc} · ${l.faltantes.length} pessoa(s) [${Object.entries(porMotivo).map(([k, v]) => `${k}:${v}`).join(' ')}]`);
    for (const f of l.faltantes.slice(0, 6)) console.log(`     · ${f.nome} (${f.motivo})`);
    if (l.faltantes.length > 6) console.log(`     · … +${l.faltantes.length - 6}`);
  }

  if (!EXECUTAR) {
    console.log(`\n>>> DRY-RUN — nada enfileirado. Use --executar [limite] (default ${LIMITE}) <<<`);
    console.log(`    Cada célula reconciliada custa UM render de deck.`);
    return;
  }
  console.log(`\n${r.celulasReenfileiradas.length} célula(s) devolvida(s) à fila de render.`);
  if (r.ignoradasPorLimite) console.log(`${r.ignoradasPorLimite} adiada(s) pelo limite de ${LIMITE} — rode de novo depois.`);
  console.log(`Acompanhar: npx tsx scripts/_hetzner-listar.ts · npx tsx scripts/_diag-video-semana.ts <semana>`);
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
