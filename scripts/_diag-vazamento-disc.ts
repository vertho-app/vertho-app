/* eslint-disable */
// READ-ONLY: alguém está lendo conteúdo de kit de OUTRO DISC?
// core_id do plano → micro_conteudo → kit_id → kits.disc. Se kit.disc != disc da pessoa:
//   - existe kit do DISC dela p/ (comp, desc)? → o overlay corrige na leitura (OK)
//   - não existe?                              → VAZAMENTO REAL (lê o DISC errado)
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id,nome_completo,cargo,perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  const { data: mcAll } = await sb.from('micro_conteudos').select('id,kit_id,formato,competencia,descritor,cargo').eq('empresa_id', EMP);
  const mcById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m]));
  const { data: briefs } = await sb.from('kit_briefs').select('id,competencia,descritor,cargo').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const bById = Object.fromEntries((briefs || []).map((b: any) => [b.id, b]));
  const { data: kits } = await sb.from('kits').select('id,brief_id,disc,status').in('brief_id', (briefs || []).map((b: any) => b.id));
  const kitById = Object.fromEntries((kits || []).map((k: any) => [k.id, k]));
  // (comp|desc|cargo|disc) → existe kit publicado?
  const kitExiste = new Set<string>();
  for (const k of (kits || [])) {
    if (k.status !== 'published') continue;
    const b = bById[k.brief_id]; if (!b) continue;
    kitExiste.add(`${b.competencia}|${normDescritor(b.descritor)}|${b.cargo}|${k.disc}`);
  }

  let vaza = 0, corrigidoPeloOverlay = 0, semKit = 0, total = 0;
  const casos: string[] = [];
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    for (const s of ((t as any).temporada_plano || [])) {
      if (s?.tipo !== 'conteudo') continue;
      for (const e of (s.conteudos_dia || [])) {
        const comp = e.competencia || (t as any).competencia_foco;
        const core = e.conteudo?.core_id ? mcById[e.conteudo.core_id] : null;
        total++;
        if (!core?.kit_id) { semKit++; continue; }
        const kit = kitById[core.kit_id];
        const discDoConteudo = kit?.disc;
        if (!discDoConteudo || discDoConteudo === disc) continue; // conteúdo do DISC certo
        // conteúdo é de OUTRO disc → o overlay salva?
        const temKitDela = kitExiste.has(`${comp}|${normDescritor(e.descritor)}|${c.cargo}|${disc}`);
        if (temKitDela) corrigidoPeloOverlay++;
        else {
          vaza++;
          if (casos.length < 15) casos.push(`  sem${s.semana} | ${c.nome_completo} (${c.cargo}/${disc}) lê conteúdo do DISC ${discDoConteudo} — "${e.descritor}" [${core.formato}]`);
        }
      }
    }
  }
  console.log(`entregas de conteúdo analisadas: ${total}`);
  console.log(`  core sem kit (conteúdo normal): ${semKit}`);
  console.log(`  core de kit do DISC CERTO: ${total - semKit - corrigidoPeloOverlay - vaza}`);
  console.log(`  core de kit de OUTRO DISC, mas overlay corrige na leitura: ${corrigidoPeloOverlay}`);
  console.log(`\n  ⚠️ VAZAMENTO REAL (lê DISC errado, overlay NÃO corrige): ${vaza}`);
  if (casos.length) { console.log('\n--- casos ---'); casos.forEach((x) => console.log(x)); }
}
main().catch((e) => { console.error(e); process.exit(1); });
