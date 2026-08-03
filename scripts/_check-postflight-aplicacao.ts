/* eslint-disable */
// READ-ONLY: pós-fix, o postflight de HOJE (segunda da semana 4, aplicacao) deve
// reportar 0 elegíveis e NENHUM achado — e o de 28/07 (P2 da semana 3) deve seguir
// medindo as 36 pessoas normalmente.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarEnviosDoDia } from '@/lib/pipeline-health/coleta';
import { regrasPostflight } from '@/lib/pipeline-health/regras';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  for (const [dia, pilula, rotulo] of [
    ['2026-08-03T11:30:00Z', 1, 'hoje (seg, semana 4 aplicacao)'],
    ['2026-07-28T11:30:00Z', 2, '28/07 (ter, semana 3 conteudo P2)'],
  ] as const) {
    const envios = await coletarEnviosDoDia(sb, EMP, new Date(dia), pilula);
    const achados = regrasPostflight(envios);
    const comCarimbo = envios.filter((e) => e.carimboWhatsapp || e.carimboEmail).length;
    console.log(`${rotulo}: elegíveis=${envios.length} com carimbo no dia=${comCarimbo} achados=${achados.length}`);
    for (const a of achados) console.log('  ⚠️', a.id, a.contagem);
  }
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
