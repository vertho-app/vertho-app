/**
 * Cria ou recompõe o tenant escolas-acme.vertho.ai (Rede de Escolas ACME) com o
 * mesmo motor do demo canônico. O tenant nasce com is_demo=true, portanto os
 * disparos automáticos reais permanecem bloqueados.
 *
 * Uso: npx tsx scripts/seed-escolas-acme-demo.ts
 */
import './_env';
import { resetDemoTenant } from '@/lib/demo/reset-acme-demo';

async function main() {
  const r = await resetDemoTenant('escolas-acme');
  console.log('RESET ESCOLAS ACME DEMO:', JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

main();
