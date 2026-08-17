/* eslint-disable */
// Dispara o aviso de PLANO PRONTO (template `plano_desenvolvimento`) para um
// tenant, com dry-run por padrão.
//
//   npx tsx scripts/_avisar-planos.ts <slug> [--corte=ISO] [--teto=N] [--aplicar]
//
// Existe porque o cron (`avisar_planos`) tem CORTE fixo em 16/08 e não alcança
// lotes anteriores — ver o cabeçalho de `lib/notifications/avisar-plano-pronto.ts`.
// O `--corte` só é aceito com slug: sem escopo, um corte antigo alcançaria
// outros tenants, e mensagem enviada não volta.
process.loadEnvFile('.env.local');
import { avisarPlanosProntos } from '@/lib/notifications/avisar-plano-pronto';

const SLUG = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
const CORTE = process.argv.find((a) => a.startsWith('--corte='))?.slice(8);
const TETO = Number(process.argv.find((a) => a.startsWith('--teto='))?.slice(7) || 25);

async function main() {
  if (!SLUG) throw new Error('uso: <slug> [--corte=ISO] [--teto=N] [--aplicar]');
  console.log(`tenant: ${SLUG} · corte: ${CORTE || '(padrão do cron)'} · teto: ${TETO} · ${APLICAR ? 'ENVIANDO' : 'dry-run'}`);

  const r = await avisarPlanosProntos({
    apenasSlug: SLUG,
    corteIso: CORTE,
    teto: TETO,
    executar: APLICAR,
  });

  console.log(`\nelegíveis: ${r.elegiveis}`);
  console.log(`  antigos (antes do corte): ${r.antigos}`);
  console.log(`  já avisados (idempotência): ${r.repetidos}`);
  console.log(`  sem telefone: ${r.semTelefone}`);
  console.log(`enviados: ${r.enviados} · falhas: ${r.falhas}`);
  if (!APLICAR) console.log('\n(dry-run — rode com --aplicar)');
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
