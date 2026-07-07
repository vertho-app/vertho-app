/**
 * Reset/seed do tenant ACME Demo via CLI.
 *
 * DELEGA ao reset canônico `lib/demo/reset-acme-demo.ts` (`resetAcmeDemo`) — o
 * MESMO usado pelo botão /admin/demo e pelo cron noturno. Assim o CLI NUNCA
 * diverge da lógica in-app: mesmo fixture congelado (acme-demo-fixture.json) e
 * mesmo replay dos artefatos avaliados (report_texts, descriptor_assessments,
 * trilhas/progresso).
 *
 * Substitui o antigo seed-acme-demo.mjs, que duplicava a lógica e clonava o acme
 * VIVO sem reaplicar os artefatos — fonte da divergência que deixava a demo
 * "pobre" (sem relatório/jornada). Ver docs/AMBIENTE-DEMO.md.
 *
 * Uso (a partir da raiz do projeto):
 *   npm run reset:demo
 *   # ou:  npx tsx scripts/seed-acme-demo.ts
 */
import './_env'; // carrega .env.local no process.env ANTES do @/lib
import { resetAcmeDemo } from '@/lib/demo/reset-acme-demo';

async function main() {
  const r = await resetAcmeDemo();
  console.log('RESET ACME DEMO:', JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

main();
