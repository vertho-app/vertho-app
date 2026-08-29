/* eslint-disable */
// Acompanha a RECONCILIAÇÃO (F-V1) até a fila secar e reporta o ganho real:
// quantas pessoas passaram a ter vídeo com nome.
//
// Diferente de `_watch-videos-semana`, não filtra por `created_by` — as células
// reconciliadas são as ORIGINAIS devolvidas à fila, com o created_by que já tinham.
// Usar o filtro errado foi o que fez o outro monitor declarar "FIM" sem olhar nada.
//
// Uso:  npx tsx scripts/_watch-reconciliacao.ts [minutosMax]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { reconciliarPersonalizados } from '@/lib/video/reconciliar-personalizados';

const MINUTOS_MAX = Number(process.argv[2]) || 90;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sb = createSupabaseAdmin();
  const inicial = await reconciliarPersonalizados({ executar: false });
  console.log(`baseline: ${inicial.pessoasSemVideoNominal} pessoa(s) sem vídeo nominal em ${inicial.lacunas.length} célula(s)\n`);

  const limite = Date.now() + MINUTOS_MAX * 60_000;
  while (Date.now() < limite) {
    const { count: emFila } = await sb.from('videos_gerados')
      .select('id', { count: 'exact', head: true }).in('status', ['render_queued', 'rendering']);
    const { count: persoDone } = await sb.from('videos_personalizados')
      .select('id', { count: 'exact', head: true }).eq('status', 'done');
    // ⚠️ Fila de render vazia NÃO é fim: `personalizeCell` roda DEPOIS do upload do
    // deck, dentro do mesmo job e serial por pessoa — a célula já está 'done' e a
    // personalização ainda percorre a coorte. Declarar fim aqui reporta como "sem
    // vídeo nominal" quem está sendo processado naquele instante (aconteceu em
    // 27/07: sobrou 1 pessoa que estava em 'processing' havia segundos).
    const { count: persoAndamento } = await sb.from('videos_personalizados')
      .select('id', { count: 'exact', head: true }).in('status', ['processing', 'pending']);

    console.log(`[${new Date().toISOString().slice(11, 19)}] fila=${emFila} · personalizados done=${persoDone} · personalizando=${persoAndamento}`);

    if (!emFila && !persoAndamento) {
      const final = await reconciliarPersonalizados({ executar: false });
      const curadas = inicial.pessoasSemVideoNominal - final.pessoasSemVideoNominal;
      console.log(`\nFIM · ${curadas} pessoa(s) ganharam vídeo com nome`);
      console.log(`restam ${final.pessoasSemVideoNominal} sem, em ${final.lacunas.length} célula(s)`);
      for (const l of final.lacunas) console.log(`   · ${l.cargo}·${l.disc}: ${l.faltantes.length}`);
      return;
    }
    await sleep(90_000);
  }
  console.log(`\n⏱️ timeout de ${MINUTOS_MAX}min — fila ainda tem trabalho.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
