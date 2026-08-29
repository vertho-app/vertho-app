/* eslint-disable */
// Debug: por que o resolver não acha o kit? Mostra os briefs/kits REAIS da competência
// e testa o resolver nos dois nomes (limpo vs COO03_D1 — ...), SEM catch.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverDesafioDoKit } from '@/lib/season-engine/kit/desafio-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP = 'Autocuidado e resiliência emocional';

async function main() {
  const sb = createSupabaseAdmin();
  console.log('normDescritor é função?', typeof normDescritor);
  console.log('norm("COO03_D1 — Consciência de limites") =', JSON.stringify(normDescritor('COO03_D1 — Consciência de limites')));
  console.log('norm("Consciência de limites")            =', JSON.stringify(normDescritor('Consciência de limites')));

  console.log(`\n=== kit_briefs da competência "${COMP}" (empresa ${EMP.slice(0, 8)} ou global) ===`);
  const { data: briefs, error } = await sb.from('kit_briefs')
    .select('id, empresa_id, cargo, competencia, descritor')
    .eq('competencia', COMP)
    .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  if (error) console.log('ERRO briefs:', error.message);
  console.log('briefs achados:', briefs?.length || 0);
  for (const b of (briefs || [])) {
    const { data: kits } = await sb.from('kits').select('disc,status').eq('brief_id', b.id);
    console.log(`  brief ${String(b.id).slice(0, 8)} | cargo=${b.cargo} | emp=${b.empresa_id ? 'própria' : 'global'} | desc="${b.descritor}"`);
    console.log(`     kits: ${(kits || []).map((k: any) => k.disc + ':' + k.status).join(', ') || '(nenhum)'}`);
  }

  console.log('\n=== teste do resolver (sem catch) ===');
  for (const desc of ['Consciência de limites', 'COO03_D1 — Consciência de limites']) {
    for (const disc of ['C', 'D', 'I', 'S']) {
      try {
        const r = await resolverDesafioDoKit(sb, { empresaId: EMP, competencia: COMP, descritor: desc, disc, cargo: 'Coordenação Pedagógica' });
        console.log(`  "${desc}" / ${disc} → ${r ? 'ACHOU kit ' + String(r.kitId).slice(0, 8) : 'null'}`);
      } catch (e: any) { console.log(`  "${desc}" / ${disc} → THREW: ${e?.message}`); }
    }
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
