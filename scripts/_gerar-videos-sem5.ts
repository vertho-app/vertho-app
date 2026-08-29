/* eslint-disable */
/**
 * Gera os decks de vídeo que faltam na SEMANA 5 do Ibipeba.
 *
 * Diferença do `_gerar-videos-semana.ts`: ele só atende **video-preferrers**, e aqui a
 * medição de 28/07 mostrou que restringir não vale — **33 das 36 pessoas** preferem vídeo,
 * então o filtro pouparia 4 células de 42 (~$2,50) e deixaria 3 pessoas sem o formato.
 * Gera as 42.
 *
 * Combo = (`modulo_base` do CORE × cargo × 1ª letra do DISC) — a MESMA âncora que
 * `resolverVideoDaSemana` usa na leitura, senão o vídeo é renderizado e não aparece
 * (armadilha do vídeo órfão, F-V1/KIT-SEMANAL).
 *
 * Custo medido: ~$0,64-0,75 por render (HeyGen domina) + box Hetzner efêmera.
 * ⚠️ Ao fim, CONFERIR que as boxes morreram (`_hetzner-drain.ts` / API) — box viva é
 * dinheiro parado.
 *
 * Uso: npx tsx scripts/_gerar-videos-sem5.ts            (dry-run)
 *      npx tsx scripts/_gerar-videos-sem5.ts --apply [--limite N] [--conc 4]
 */
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverCelulaVideo } from '@/actions/gerar-video';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = 5;
const APPLY = process.argv.includes('--apply');
const iLim = process.argv.indexOf('--limite');
const LIMITE = iLim > -1 ? Number(process.argv[iLim + 1]) : Infinity;
const iConc = process.argv.indexOf('--conc');
const CONC = iConc > -1 ? Number(process.argv[iConc + 1]) : 4;

async function main() {
  const sb = createSupabaseAdmin();

  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano').eq('empresa_id', EMP).eq('status', 'ativa');
  const ids = (trilhas || []).map((t: any) => t.colaborador_id);
  const { data: cs } = await sb.from('colaboradores').select('id, nome_completo, cargo, perfil_dominante').in('id', ids);
  const colabs = Object.fromEntries((cs || []).map((c: any) => [c.id, c]));

  const { data: mcAll } = await sb.from('micro_conteudos').select('id, modulo_base_id').eq('empresa_id', EMP);
  const mbById = Object.fromEntries((mcAll || []).map((m: any) => [m.id, m.modulo_base_id]));

  // Já tem deck ASSISTÍVEL? (status done — o resolver da entrega exige isso)
  const { data: vg } = await sb.from('videos_gerados')
    .select('modulo_base_id, cargo, disc_dominante, status').eq('empresa_id', EMP).neq('status', 'error');
  const jaTem = new Set((vg || []).map((v: any) =>
    `${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`));

  const combos = new Map<string, { mb: string; cargo: string; disc: string; colab: string; pessoas: number }>();
  for (const t of (trilhas || [])) {
    const c = colabs[(t as any).colaborador_id];
    if (!c) continue;
    const disc = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc)) continue;
    const sw = ((t as any).temporada_plano || []).find((s: any) => Number(s.semana) === SEMANA);
    for (const e of (sw?.conteudos_dia || []).slice(0, 2)) {
      const mb = mbById[e.conteudo?.core_id];
      if (!mb) continue;
      const key = `${mb}|${c.cargo}|${disc}`;
      const atual = combos.get(key);
      if (atual) { atual.pessoas++; continue; }
      combos.set(key, { mb, cargo: c.cargo, disc, colab: c.id, pessoas: 1 });
    }
  }

  const todos = [...combos.values()];
  const faltam = todos.filter((cb) => !jaTem.has(`${cb.mb}|${cb.cargo}|${cb.disc}`));
  const lista = faltam.slice(0, Number.isFinite(LIMITE) ? LIMITE : undefined);

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · semana ${SEMANA}`);
  console.log(`${todos.length} célula(s) demandada(s) · ${faltam.length} sem deck · processando ${lista.length} (conc ${CONC})`);
  console.log(`estimativa: ~$${(lista.length * 0.7).toFixed(2)} (~$0,64-0,75/render) + box(es) Hetzner\n`);
  for (const cb of lista.slice(0, 12)) {
    console.log(`  ${cb.cargo.padEnd(22)} ${cb.disc}  mb=${cb.mb.slice(0, 8)}  ${cb.pessoas} pessoa(s)`);
  }
  if (lista.length > 12) console.log(`  … +${lista.length - 12}`);

  if (!APPLY) { console.log('\n→ rode com --apply (comece com --limite 1 para validar o caminho)'); return; }

  let ok = 0, err = 0, reusou = 0, feitos = 0;
  const fila = [...lista];
  async function fire(cb: any) {
    try {
      const r: any = await resolverCelulaVideo(cb.mb, EMP, cb.cargo, cb.disc, `batch-video-sem${SEMANA}`, {
        sb, gerar: true, colaboradorId: cb.colab,
      });
      if (r?.error) { err++; console.log(`  ✗ ${cb.cargo}/${cb.disc} mb=${cb.mb.slice(0, 8)}: ${r.error}`); }
      else if (r?.reused) { reusou++; }
      else { ok++; console.log(`  ✓ ${cb.cargo.padEnd(22)} ${cb.disc} mb=${cb.mb.slice(0, 8)} → ${String(r?.id || '').slice(0, 8)}`); }
    } catch (e: any) { err++; console.log(`  ✗ ${cb.cargo}/${cb.disc}: ${e?.message || e}`); }
    feitos++;
    if (feitos % 5 === 0) console.log(`  … ${feitos}/${lista.length}`);
  }
  await Promise.all(Array.from({ length: Math.min(CONC, fila.length) }, async () => {
    while (fila.length) { const cb = fila.shift(); if (cb) await fire(cb); }
  }));

  console.log(`\nDISPARADOS: ${ok} · reusados: ${reusou} · erros: ${err}`);
  console.log('⚠️ conferir boxes Hetzner ao fim: npx tsx scripts/_hetzner-drain.ts');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
