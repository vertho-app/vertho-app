/* eslint-disable */
/**
 * Saneia `formatos_disponiveis[].id` ÓRFÃO em slots cujo `core_id` está VÁLIDO.
 *
 * Por que não usar `_reparar-core-orfao.ts` aqui: ele chama `selecionarConteudoDaSemana`,
 * que re-escolhe o CORE — trocaria o conteúdo principal de quem está com o dele intacto.
 * Aqui o core não se toca: só as entradas de formato que apontam para nada.
 *
 * Origem do estado (medido 28/07, Ibipeba): 22 slots com core bom e 27 entradas de
 * formato órfãs, em "Priorização estratégica", "Definição de metas" e "Troca de práticas"
 * (Planejamento e Organização / Colaboração docente). É resíduo da dedup de
 * `micro_conteudos` de 27/07, que reapontou `core_id` mas **não** os
 * `formatos_disponiveis[].id` — a mesma classe de referência JSONB sem FK que já morde
 * este pipeline várias vezes.
 *
 * Política por entrada órfã:
 *  1. Substituir pelo conteúdo ATIVO equivalente — (empresa, competência, descritor,
 *     cargo do colaborador, mesmo formato, `kit_id IS NULL`). Cargo-safe: nunca serve
 *     conteúdo de outro cargo.
 *  2. Sem equivalente → REMOVER a entrada. Oferecer um formato que não existe é pior:
 *     o viewer mostra a aba e o clique cai em 404 (F-I9 / pegadinha 4 do FMEA).
 *
 * Uso: npx tsx --env-file=.env.local scripts/_sanear-formatos-orfaos.ts [--apply]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { chaveDescritor } from '@/lib/descritores';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createSupabaseAdmin();

  const { data: trilhas } = await sb.from('trilhas')
    .select('id, colaborador_id, temporada_plano, competencia_foco')
    .eq('empresa_id', EMP).eq('status', 'ativa');
  const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').eq('empresa_id', EMP);
  const colabDe = Object.fromEntries((colabs || []).map((c: any) => [c.id, c]));

  const { data: mcs } = await sb.from('micro_conteudos')
    .select('id, competencia, descritor, cargo, formato, ativo, kit_id, titulo, url')
    .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const existe = new Set((mcs || []).map((m: any) => m.id));
  // Índice do substituto: (competência|descritor|cargo|formato) → conteúdo ativo do build.
  const idx = new Map<string, any>();
  for (const m of (mcs || [])) {
    if (!m.ativo || m.kit_id) continue;
    const k = `${chaveDescritor(m.competencia || '')}|${chaveDescritor(m.descritor || '')}|${chaveDescritor(m.cargo || '')}|${m.formato}`;
    if (!idx.has(k)) idx.set(k, m);
  }

  let trocados = 0, removidos = 0, tocadas = 0, slots = 0;
  for (const t of (trilhas || [])) {
    const colab = colabDe[(t as any).colaborador_id];
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    let mudou = false;

    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      for (const [i, e] of (s.conteudos_dia || []).entries()) {
        const c = e?.conteudo;
        if (!c || !c.core_id || !existe.has(c.core_id)) continue;   // core órfão é do outro script
        const fmts = c.formatos_disponiveis || {};
        const orfaos = Object.entries<any>(fmts).filter(([, v]) => v?.id && !existe.has(v.id));
        if (!orfaos.length) continue;
        slots++;

        const comp = e.competencia || (t as any).competencia_foco || '';
        for (const [formato, v] of orfaos) {
          const k = `${chaveDescritor(comp)}|${chaveDescritor(e.descritor || '')}|${chaveDescritor(colab?.cargo || '')}|${formato}`;
          const sub = idx.get(k);
          if (sub) {
            fmts[formato] = { id: sub.id, url: sub.url || null, titulo: sub.titulo || null };
            trocados++;
            console.log(`  ~ sem${s.semana} P${i + 1} ${String(colab?.nome_completo || '').slice(0, 22).padEnd(22)} ${formato.padEnd(6)} "${String(e.descritor).slice(0, 26)}" → ${String(sub.id).slice(0, 8)}`);
          } else {
            delete fmts[formato];
            removidos++;
            console.log(`  − sem${s.semana} P${i + 1} ${String(colab?.nome_completo || '').slice(0, 22).padEnd(22)} ${formato.padEnd(6)} "${String(e.descritor).slice(0, 26)}" (sem equivalente ativo — entrada removida)`);
          }
          mudou = true;
        }
      }
    }

    if (mudou) {
      tocadas++;
      if (APPLY) {
        const { error } = await sb.from('trilhas').update({ temporada_plano: plano }).eq('id', (t as any).id).eq('empresa_id', EMP);
        if (error) throw new Error(`trilha ${(t as any).id}: ${error.message}`);
      }
    }
  }

  console.log(`\n${APPLY ? '✓ gravado' : 'seria feito'}: ${trocados} substituído(s) + ${removidos} removido(s) em ${slots} slot(s) de ${tocadas} trilha(s)`);
  if (!APPLY) console.log('→ rode com --apply');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
