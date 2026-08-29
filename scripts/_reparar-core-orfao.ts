/* eslint-disable */
// Repara `core_id` órfão no temporada_plano (aponta p/ micro_conteudo apagado).
// Uso: npx tsx scripts/_reparar-core-orfao.ts          → DRY RUN
//      npx tsx scripts/_reparar-core-orfao.ts --apply  → grava
//
// Reusa `selecionarConteudoDaSemana` (a MESMA função do motor) — não reimplementa o
// scoring, senão os campos derivados dessincronizam ("título ≠ blocos").
// Só mexe no objeto `conteudo` (core_*/formato_core/formatos_disponiveis); descritor,
// desafio e o resto do slot ficam intactos.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { selecionarConteudoDaSemana } from '@/lib/season-engine/build-season';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas } = await sb.from('trilhas')
    .select('id,colaborador_id,temporada_plano,competencia_foco').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores')
    .select('id,nome_completo,cargo,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));
  const { data: mcAll } = await sb.from('micro_conteudos').select('*').or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const existe = new Set((mcAll || []).map((m: any) => m.id));
  const ativos = (mcAll || []).filter((m: any) => m.ativo);

  console.log(APPLY ? '🔥 APPLY\n' : '🔍 DRY RUN\n');
  let reparados = 0, semSubstituto = 0, trilhasTocadas = 0;

  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id]; if (!c) continue;
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    const prioridadeFormatos = derivarPrioridadeFormatos(c);
    let mudou = false;

    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      for (const [i, e] of (s.conteudos_dia || []).entries()) {
        const cid = e.conteudo?.core_id;
        if (!cid || existe.has(cid)) continue;
        const comp = e.competencia || (t as any).competencia_foco;

        // Espelha o buildQ do motor: filtra por nível; se sobrar <=1, usa todos.
        const nivelMedio = ((Number(s.nivel_atual) || 1) + 3.0) / 2;
        const porComp = ativos.filter((m: any) => m.competencia === comp);
        let cand = porComp.filter((m: any) => Number(m.nivel_min) <= nivelMedio && Number(m.nivel_max) >= nivelMedio);
        if (cand.length <= 1) cand = porComp;

        const sel = selecionarConteudoDaSemana(cand as any, {
          cargo: c.cargo, descritor: e.descritor, prioridadeFormatos,
        });
        if (!sel.coreContent) {
          semSubstituto++;
          console.log(`   ⚠️ SEM substituto: ${c.nome_completo} sem${s.semana} P${i + 1} "${e.descritor}"`);
          continue;
        }
        console.log(`   sem${s.semana} P${i + 1} | ${c.nome_completo} (${c.cargo}) "${e.descritor}"`);
        console.log(`        ${String(cid).slice(0, 8)} (órfão) → ${String(sel.coreContent.id).slice(0, 8)} [${sel.formatoCore}] "${String(sel.coreContent.titulo).slice(0, 45)}"`);
        console.log(`        formatos: ${Object.keys(sel.formatosDisponiveis).join(',')}`);

        e.conteudo.formato_core = sel.formatoCore;
        e.conteudo.core_id = sel.coreContent.id;
        e.conteudo.core_url = sel.coreContent.url || null;
        e.conteudo.core_titulo = sel.coreContent.titulo || e.conteudo.core_titulo;
        e.conteudo.core_reuso = false;
        e.conteudo.fallback_gerado = false;
        e.conteudo.formatos_disponiveis = Object.fromEntries(
          Object.entries(sel.formatosDisponiveis).map(([f, x]: any) => [f, { id: x.id, url: x.url, titulo: x.titulo }]),
        );
        reparados++; mudou = true;
      }
    }

    if (mudou) {
      trilhasTocadas++;
      if (APPLY) {
        const { error } = await sb.from('trilhas').update({ temporada_plano: plano })
          .eq('id', (t as any).id).eq('empresa_id', EMP);
        if (error) throw new Error(`trilha ${(t as any).id}: ${error.message}`);
      }
    }
  }

  console.log(`\n${APPLY ? '✓ gravado' : 'seria reparado'}: ${reparados} entrega(s) em ${trilhasTocadas} trilha(s)`);
  if (semSubstituto) console.log(`⚠️ sem substituto: ${semSubstituto}`);
  if (!APPLY) console.log('→ rode com --apply');
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
