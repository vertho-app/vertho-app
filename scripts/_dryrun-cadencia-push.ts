/**
 * Exercita a CADÊNCIA REAL do tenant de teste chamando `processarEmpresaDiario`
 * — o mesmo núcleo que o cron chama. Não é atalho: o objetivo é justamente
 * percorrer o caminho de produção (conjunto de endpoints, pendência por canal,
 * envio, carimbo), não simular um pedaço dele.
 *
 * `hoje` é passado explicitamente para não depender do dia da semana real: a
 * cadência do tenant dispara a pílula 1 no dia configurado (default segunda=1).
 *
 * ⚠️ Envia de VERDADE: e-mail sai por Resend e push sai para os endpoints
 * ativos. `teste-piloto` não é is_demo, então não há guarda de demonstração.
 *
 * Script local (prefixo `_`): não versionado no fluxo normal.
 *
 * Uso:
 *   VAPID_PRIVATE_KEY=... NEXT_PUBLIC_VAPID_PUBLIC_KEY=... VAPID_SUBJECT=... \
 *     npx tsx --env-file=.env.local scripts/_dryrun-cadencia-push.ts
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa, error } = await sb
    .from('empresas')
    .select('id, nome, slug, is_demo, sys_config')
    .eq('slug', 'teste-piloto')
    .maybeSingle();

  if (error || !empresa) {
    console.error('empresa não encontrada:', error?.message);
    process.exit(1);
  }

  const diaP1 = (empresa as any).sys_config?.cadencia?.fase4_dia_pilula ?? 1;
  const hojeUTC = new Date().toISOString().slice(0, 10);

  console.log(`empresa=${(empresa as any).slug} diaP1=${diaP1} hojeUTC=${hojeUTC}`);
  console.log(`push flag: ${(empresa as any).sys_config?.notificacoes_push === true}`);

  const resumo = await processarEmpresaDiario(empresa as any, { hoje: diaP1, hojeUTC });
  console.log('resumo:', JSON.stringify(resumo));

  process.exit(0);
}

main().catch((e) => {
  console.error('erro:', e?.message || e);
  process.exit(1);
});
