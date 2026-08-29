/**
 * Push de TESTE da inbox — sem precisar de mensagem real no WhatsApp.
 *
 * Exercita o caminho real: flag + VAPID + fan-out para `notification_endpoints`
 * de admin (user_id) + `notification_deliveries` com dedupe + `sw.js`.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/_push-inbox-teste.ts "mensagem de teste"
 *   npx tsx --env-file=.env.local scripts/_push-inbox-teste.ts --dry   # só lista, não envia
 *
 * Pré-requisitos:
 *   1) migration 218 aplicada
 *   2) flag ligada:  empresas.sys_config.notificacoes_inbox_push = true (em qualquer empresa)
 *   3) ao menos um admin com PWA instalado e "Ativar aviso" tocado em /admin-v2/inbox
 */
import { createSupabaseAdmin } from '../lib/supabase';
import { inboxPushHabilitado } from '../lib/notifications/inbox-flag';
import { fanoutInboxPush } from '../lib/notifications/inbox-push';

async function main() {
  const dry = process.argv.includes('--dry');
  const previewArg = process.argv.find((a) => !a.startsWith('-') && a !== 'scripts/_push-inbox-teste.ts' && !a.endsWith('tsx'))?.trim();
  const preview = previewArg && previewArg !== '--dry' ? previewArg : 'Teste da inbox — toque para abrir a conversa';

  const sb = createSupabaseAdmin();

  // Flag
  const flag = await inboxPushHabilitado();
  console.log(`flag notificacoes_inbox_push: ${flag ? 'LIGADA' : 'DESLIGADA (fail-closed — não vai enviar)'}`);
  if (!flag) {
    const { data: cfgs } = await sb.from('empresas').select('id, nome, sys_config').limit(20);
    console.log('sys_config por empresa:');
    for (const r of (cfgs as any[]) ?? []) {
      console.log(`  - ${(r as any).nome}: ${JSON.stringify((r as any).sys_config?.notificacoes_inbox_push ?? null)}`);
    }
    console.log('\nPara ligar: UPDATE empresas SET sys_config = coalesce(sys_config,\'{}\'::jsonb) || \'{"notificacoes_inbox_push": true}\'::jsonb WHERE id = (SELECT id FROM empresas LIMIT 1);');
    if (dry) process.exit(0);
    console.log('Tentando enviar mesmo assim (o fan-out vai barrar se a flag estiver desligada)...');
  }

  // Lista admins inscritos
  const { data: eps, error } = await sb
    .from('notification_endpoints')
    .select('id, user_id, platform, enabled, subscription')
    .eq('enabled', true)
    .not('user_id', 'is', null);

  if (error) {
    console.error('falha ao listar endpoints admin:', error.message);
    if (String(error.message).includes('user_id')) {
      console.error('→ migration 218 ainda não aplicada? Rode: node --env-file=.env.local scripts/apply-migration.mjs migrations/218-inbox-admin-push.sql');
    }
    process.exit(1);
  }

  const ativos = (eps as any[]) ?? [];
  console.log(`endpoints admin ativos: ${ativos.length}`);
  if (!ativos.length) {
    console.error('nenhum admin com push ativo. Abra /admin-v2/inbox como platform admin, instale o PWA (iOS: Safari → Compartilhar → Adicionar à Tela de Início) e toque "Ativar aviso".');
    process.exit(1);
  }
  for (const ep of ativos) {
    console.log(`  - ${ep.id.slice(0, 8)}… platform=${ep.platform} endpoint=${String(ep.subscription?.endpoint || '').slice(0, 42)}…`);
  }

  if (dry) {
    console.log('\n--dry: não enviado.');
    process.exit(0);
  }

  // VAPID check (o fanout já checa, mas mostra aqui antes)
  const vapidOk = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  console.log(`VAPID: ${vapidOk ? 'ok' : 'AUSENTE (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)'}`);
  if (!vapidOk) {
    console.error('VAPID ausente — o push não sai. Configure nas envs da Vercel e no .env.local.');
    process.exit(1);
  }

  const wamid = `teste_inbox_${Date.now()}`;
  console.log(`\nEnviando fan-out de teste (wamid=${wamid})...`);
  const r = await fanoutInboxPush({
    waMessageId: wamid,
    fromPhone: '+5511999990000',
    preview,
    empresaId: null,
    empresaNome: null,
  });

  console.log('resultado:', JSON.stringify(r, null, 2));

  // Mostra as entregas gravadas
  const { data: entregas } = await sb
    .from('notification_deliveries')
    .select('id, status, error, channel, kind')
    .eq('dedupe_key', `inbox:${wamid}:${ativos[0]?.id}`) // amostra
    .limit(5);
  if (entregas?.length) console.log('entrega amostra:', JSON.stringify(entregas[0], null, 2));

  if (r.enviados > 0) console.log('\n✓ push enviado — verifique o aparelho (com a aba fechada também). Toque deve abrir /admin-v2/inbox.');
  else console.log('\n— nenhum envio (veja semFlag/semEndpoints acima).');

  process.exit(0);
}

main().catch((e) => {
  console.error('erro:', e?.message || e);
  process.exit(1);
});
