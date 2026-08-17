/* eslint-disable */
/**
 * Abre a turma de um tenant: inscreve na cadência quem tem trilha ATIVA.
 *
 * Sem linha em `fase4_envios` o motor não manda nada — a trilha pode estar
 * pronta, o conteúdo publicado e o template aprovado, e ainda assim o cron passa
 * pelo tenant sem enviar. É a lacuna que não aparece em tela nenhuma, porque
 * "nenhuma entrega prevista" é indistinguível de "hoje não é dia de envio".
 *
 * Chama o MESMO núcleo da action da tela (`lib/envios/inscricao-core.ts`).
 *
 * Uso:
 *   npx tsx scripts/_abrir-turma.ts --empresa=macae            → dry-run
 *   npx tsx scripts/_abrir-turma.ts --empresa=macae --aplicar
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { inscreverNaCadencia } from '@/lib/envios/inscricao-core';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp, error } = await sb.from('empresas')
    .select('id, slug, nome, sys_config').eq('slug', SLUG).maybeSingle();
  if (error) throw new Error(`empresas: ${error.message}`);
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);

  const empresaId = (emp as any).id as string;
  const tdb = tenantDb(empresaId);

  const { data: ativos } = await tdb.from('fase4_envios').select('id, semana_atual').eq('status', 'ativo');
  const { data: trilhas } = await tdb.from('trilhas').select('id').eq('status', 'ativa');

  console.log(`${(emp as any).nome} (${SLUG})`);
  console.log(`  trilhas ativas: ${(trilhas || []).length}`);
  console.log(`  já inscritos na cadência: ${(ativos || []).length}`);
  // Os DIAS da cadência não são impressos aqui de propósito: `cadencia` é chave
  // de escopo TURMA (lib/turmas/chaves.ts) e ler `sys_config` direto daria um
  // valor que pode não ser o efetivo. Quem mostra (e muda) é
  // `_cadencia-empresa.ts`, que administra a chave institucional.
  console.log(`  dias da cadência: npx tsx scripts/_cadencia-empresa.ts --empresa=${SLUG}`);

  if (!APLICAR) { console.log('\ndry-run — rode com --aplicar para inscrever.'); return; }

  const r = await inscreverNaCadencia(tdb);
  console.log(`\n${r.success ? '✓' : '❌'} ${r.message}`);

  const { data: depois } = await tdb.from('fase4_envios').select('id, semana_atual').eq('status', 'ativo');
  console.log(`  ativos agora: ${(depois || []).length} · semana ${[...new Set((depois || []).map((d: any) => d.semana_atual))].join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
