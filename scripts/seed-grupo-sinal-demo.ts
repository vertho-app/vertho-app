/**
 * Cria ou recompõe o tenant gruposinal.vertho.ai usando o mesmo fixture e o
 * mesmo motor do demo canônico. O tenant nasce com is_demo=true, portanto os
 * disparos automáticos reais permanecem bloqueados.
 *
 * Uso: npx tsx scripts/seed-grupo-sinal-demo.ts
 */
import './_env';
import { resetGrupoSinalDemo } from '@/lib/demo/reset-acme-demo';

async function main() {
  const r = await resetGrupoSinalDemo();
  console.log('RESET GRUPO SINAL DEMO:', JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

main();
