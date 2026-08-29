/* eslint-disable */
// READ-ONLY: quantas células a R10 reporta hoje (deve ser 2 — as demais foram recuperadas).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarCelulasVideoSemDeck } from '@/lib/pipeline-health/coleta';
import { checarCelulaVideoEmError } from '@/lib/pipeline-health/regras';
async function main() {
  const cs = await coletarCelulasVideoSemDeck(createSupabaseAdmin());
  const a = checarCelulaVideoEmError(cs);
  console.log(`R10 reporta: ${cs.length} célula(s)`);
  for (const s of a?.amostra || []) console.log('  ·', s);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message); process.exit(1); });
