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
import { cleanupExpiredAcmeProspects } from '@/lib/demo/acme-prospect-tracking';

async function main() {
  // A faxina de convidados VENCIDOS roda sempre: é ela que remove o acesso de
  // quem passou do prazo, e isso não depende de o ambiente ser recomposto.
  const lifecycle = await cleanupExpiredAcmeProspects();

  // 🔴 O ADIAMENTO POR PASSAPORTE ATIVO SAIU (09/09/2026), alinhando ao cron,
  // que o abandonou em 03/09 pelo mesmo motivo: com validade de 10 dias, adiar
  // é praticamente nunca resetar. O convidado ATRAVESSA o reset — vencer revoga
  // o acesso, não apaga o que ele fez.
  //
  // Este era o gêmeo divergente: a decisão entrou no cron e não aqui, e o CLI
  // seguiu adiando. Pior, ele imprimia "ADIADO" e saía com `exit 0` — quem roda
  // `npm run reset:demo` lia SUCESSO e o reset não tinha acontecido. Um reset
  // que não roda e diz que rodou é a pior das duas falhas possíveis aqui.
  const r = await resetAcmeDemo();
  console.log('RESET ACME DEMO:', JSON.stringify({ ...r, convidados: lifecycle }, null, 2));
  process.exit(r.ok ? 0 : 1);
}

main();
