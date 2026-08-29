/* eslint-disable */
// Prova, contra o banco REAL, que regenerar uma trilha não apaga o que o
// colaborador escreveu. O teste unitário cobre a REGRA; este cobre o CAMINHO —
// upsert, onConflict e a query de órfãs, que um mock não exercita.
//
// Roda em tenant DEMO e é auto-limpo: cria a reflexão de teste, regenera, confere,
// e restaura o estado anterior. Nunca toca em tenant real.
//
// Uso:  npx tsx scripts/_test-regen-preserva.ts
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { persistirTrilha } from '@/lib/season-engine/trilha-core';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: demo } = await sb.from('empresas').select('id, slug').eq('is_demo', true).limit(1).maybeSingle();
  if (!demo) throw new Error('nenhum tenant demo — não rodar isto em tenant real');

  const { data: trilha } = await sb.from('trilhas')
    .select('id, colaborador_id, temporada_plano, competencia_foco, competencias_foco, descritores_selecionados, programa_modo')
    .eq('empresa_id', (demo as any).id).limit(1).maybeSingle();
  if (!trilha) throw new Error(`tenant demo ${(demo as any).slug} sem trilha`);
  const t = trilha as any;

  const plano = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
  const semanaAlvo = plano.find((s: any) => s?.tipo === 'conteudo')?.semana;
  if (!semanaAlvo) throw new Error('trilha demo sem semana de conteúdo');

  const MARCA = { texto: `__teste_preservacao_${Date.now()}__` };
  const { data: antes } = await sb.from('temporada_semana_progresso')
    .select('reflexao, conteudo_consumido, status').eq('trilha_id', t.id).eq('semana', semanaAlvo).maybeSingle();

  console.log(`tenant=${(demo as any).slug} trilha=${t.id} semana=${semanaAlvo}`);
  await sb.from('temporada_semana_progresso')
    .update({ reflexao: MARCA, conteudo_consumido: true })
    .eq('trilha_id', t.id).eq('semana', semanaAlvo);
  console.log('  · reflexão de teste gravada');

  // Regenera com o MESMO plano — é o caminho que antes fazia delete+insert.
  // `tenantDb` (não o cliente cru) porque persistirTrilha grava por tenant.
  const { tenantDb } = await import('@/lib/tenant-db');
  const tdb = tenantDb((demo as any).id);
  const r = await persistirTrilha(tdb, {
    colaboradorId: t.colaborador_id,
    semanas: plano, competenciaFoco: t.competencia_foco, competenciasFoco: t.competencias_foco,
    descritoresSelecionados: t.descritores_selecionados || [], programaModo: t.programa_modo,
  } as any);
  if ((r as any).error) throw new Error(`persistirTrilha: ${(r as any).error}`);
  console.log('  · trilha regenerada');

  const { data: depois } = await sb.from('temporada_semana_progresso')
    .select('reflexao, conteudo_consumido').eq('trilha_id', t.id).eq('semana', semanaAlvo).maybeSingle();

  const sobreviveu = (depois as any)?.reflexao?.texto === MARCA.texto;
  const consumoSobreviveu = (depois as any)?.conteudo_consumido === true;
  console.log(`\n${sobreviveu ? '✅' : '❌'} reflexão ${sobreviveu ? 'PRESERVADA' : 'APAGADA pela regeneração'}`);
  console.log(`${consumoSobreviveu ? '✅' : '❌'} conteudo_consumido ${consumoSobreviveu ? 'preservado' : 'zerado'}`);

  // Restaura o estado original.
  await sb.from('temporada_semana_progresso')
    .update({ reflexao: antes?.reflexao ?? null, conteudo_consumido: (antes as any)?.conteudo_consumido ?? false })
    .eq('trilha_id', t.id).eq('semana', semanaAlvo);
  console.log('\n(estado original restaurado)');
  if (!sobreviveu || !consumoSobreviveu) process.exit(1);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
