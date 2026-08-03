/* eslint-disable */
// READ-ONLY: semana 4 (aplicação) de Ibipeba — missão/cenário ENTREGÁVEIS pós-normalize?
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('trilhas')
    .select('temporada_plano, colaboradores(nome_completo)')
    .eq('empresa_id', EMP).eq('status', 'ativa');
  let ok = 0;
  const ruins: any[] = [];
  for (const t of (data as any[]) || []) {
    const plano = normalizeTemporadaPlano(t.temporada_plano);
    const s = plano.find((x: any) => Number(x.semana) === 4);
    const m = s?.missao?.texto || '';
    const c = s?.cenario?.texto || '';
    const bom = m && !m.includes('```') && !m.includes('missao_texto') && m.includes('**Sua missão:**')
      && c && !c.includes('```') && !c.includes('tensao_central');
    if (bom) ok++;
    else ruins.push({ nome: t.colaboradores?.nome_completo, mHead: m.slice(0, 100), cHead: c.slice(0, 100) });
  }
  console.log(`semana 4 ENTREGÁVEL pós-normalize: ${ok}/${(data as any[])?.length}`);
  for (const r of ruins) console.log('❌', JSON.stringify(r));
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
