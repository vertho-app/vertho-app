/* eslint-disable */
/**
 * Remove os kits de "Autocuidado × Gestão Escolar" (Ibipeba) gerados com âncora errada,
 * para que `_gerar-kits-semana5.ts --apply` os refaça sobre os MBs já corrigidos.
 *
 * Por que apagar o BRIEF também: `resolverOuCriarBrief` grava `modulo_base_id` no brief e
 * semeia o núcleo a partir dele — o brief herdou o módulo errado. Reaproveitá-lo
 * reproduziria o mesmo conteúdo com um verniz novo.
 *
 * Ordem: micro_conteudos (kit_id) → kits → kit_briefs. Sem FK entre eles, a ordem é
 * responsabilidade daqui.
 *
 * Seguro quanto a referências: conteúdo de KIT não é apontado por `temporada_plano` — o
 * kit entra na LEITURA, pelo overlay (`overlayKitNaSemana`), resolvido por
 * (empresa × competência × descritor × cargo × DISC). Confirmado antes de apagar.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_limpar-kits-gestao-escolar.ts [--apply]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { writeFileSync } from 'fs';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const COMP = 'Autocuidado e resiliência emocional';
const CARGO = 'Gestão Escolar';
const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createSupabaseAdmin();

  const { data: briefs } = await sb.from('kit_briefs')
    .select('id, competencia, descritor, cargo, modulo_base_id')
    .eq('empresa_id', EMP).eq('cargo', CARGO).ilike('competencia', `%${COMP}%`);
  if (!briefs?.length) { console.log('nenhum brief do par — nada a limpar'); return; }

  const briefIds = briefs.map((b: any) => b.id);
  const { data: kits } = await sb.from('kits').select('id, brief_id, disc, status').in('brief_id', briefIds);
  const kitIds = (kits || []).map((k: any) => k.id);
  const { data: conteudos } = await sb.from('micro_conteudos')
    .select('id, formato, descritor, disc').in('kit_id', kitIds.length ? kitIds : ['00000000-0000-0000-0000-000000000000']);

  // Guarda: se algum plano apontar para conteúdo de kit, o pressuposto está errado.
  const { data: trilhas } = await sb.from('trilhas').select('id, temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  const idsConteudo = new Set((conteudos || []).map((c: any) => c.id));
  let refs = 0;
  for (const t of (trilhas || [])) {
    for (const s of ((t as any).temporada_plano || [])) {
      for (const e of (s?.conteudos_dia || [])) {
        const c = e?.conteudo; if (!c) continue;
        if (c.core_id && idsConteudo.has(c.core_id)) refs++;
        for (const v of Object.values<any>(c.formatos_disponiveis || {})) if (v?.id && idsConteudo.has(v.id)) refs++;
      }
    }
  }

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · ${briefs.length} brief(s) · ${kitIds.length} kit(s) · ${conteudos?.length || 0} micro_conteudo(s) de kit`);
  console.log(`referências em temporada_plano: ${refs} ${refs ? '⚠️ INESPERADO — kit não deveria estar no snapshot' : '(nenhuma, como esperado)'}`);
  for (const b of briefs) console.log(`  ${String(b.descritor).padEnd(26)} brief ${String(b.id).slice(0, 8)} · kits: ${(kits || []).filter((k: any) => k.brief_id === b.id).map((k: any) => k.disc).join('') || '—'}`);

  if (!APPLY) { console.log('\n→ rode com --apply'); return; }

  // ── Reaponte kit → CORE (o pressuposto acima falhou, e o motivo importa) ────
  // Medido 28/07: 81 slots do plano apontam para conteúdo de KIT. É resíduo do F-I4 —
  // antes da correção de 27/07 o pool do build não excluía `kit_id`, então o snapshot
  // capturou conteúdo DISC-específico. O certo é o plano guardar o CORE e o kit entrar
  // por cima na LEITURA (`overlayKitNaSemana`); reapontar restaura esse desenho, em vez
  // de só evitar o órfão.
  const porChave = new Map<string, any>();
  for (const c of (conteudos || [])) porChave.set(String(c.id), c);

  const { data: cores } = await sb.from('micro_conteudos')
    .select('id, formato, descritor').eq('empresa_id', EMP).eq('cargo', CARGO)
    .is('kit_id', null).ilike('competencia', `%${COMP}%`);
  const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const coreDe = new Map<string, string>();
  for (const c of (cores || [])) coreDe.set(`${norm(c.descritor)}|${c.formato}`, c.id);

  let trocados = 0, semCore = 0, tocadas = 0;
  for (const t of (trilhas || [])) {
    const plano = JSON.parse(JSON.stringify((t as any).temporada_plano || []));
    let mudou = false;
    const trocar = (id: string | undefined): string | null => {
      if (!id) return null;
      const doKit = porChave.get(String(id));
      if (!doKit) return null;
      const novo = coreDe.get(`${norm(doKit.descritor)}|${doKit.formato}`);
      if (!novo) { semCore++; return null; }
      return novo;
    };
    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      for (const e of (s.conteudos_dia || [])) {
        const c = e?.conteudo; if (!c) continue;
        const nc = trocar(c.core_id);
        if (nc) { c.core_id = nc; trocados++; mudou = true; }
        for (const v of Object.values<any>(c.formatos_disponiveis || {})) {
          const nf = trocar(v?.id);
          if (nf) { v.id = nf; trocados++; mudou = true; }
        }
      }
    }
    if (mudou) {
      tocadas++;
      const { error } = await sb.from('trilhas').update({ temporada_plano: plano }).eq('id', (t as any).id).eq('empresa_id', EMP);
      if (error) throw new Error(`trilha ${(t as any).id}: ${error.message}`);
    }
  }
  console.log(`✓ reapontados kit→core: ${trocados} referência(s) em ${tocadas} trilha(s)${semCore ? ` · ⚠️ ${semCore} sem core equivalente` : ''}`);
  if (semCore) throw new Error('há referência de kit sem core equivalente — abortando antes de deletar');

  const backup = { briefs, kits, conteudos };
  const path = `${process.env.TEMP || '.'}/kits-gestao-escolar-backup-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\nbackup: ${path}`);

  if (conteudos?.length) {
    const { error } = await sb.from('micro_conteudos').delete().in('id', conteudos.map((c: any) => c.id)).eq('empresa_id', EMP);
    if (error) throw new Error(`micro_conteudos: ${error.message}`);
    console.log(`✓ ${conteudos.length} conteúdo(s) de kit removidos`);
  }
  if (kitIds.length) {
    const { error } = await sb.from('kits').delete().in('id', kitIds);
    if (error) throw new Error(`kits: ${error.message}`);
    console.log(`✓ ${kitIds.length} kit(s) removidos`);
  }
  const { error: errB } = await sb.from('kit_briefs').delete().in('id', briefIds).eq('empresa_id', EMP);
  if (errB) throw new Error(`kit_briefs: ${errB.message}`);
  console.log(`✓ ${briefIds.length} brief(s) removidos`);
  console.log('\n→ refazer: npx tsx --env-file=.env.local scripts/_gerar-kits-semana5.ts --apply');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
