/* eslint-disable */
// Acha o(s) colaborador(es) da semana 2 com kit OK mas SEM deck de vídeo (P1/P2)
// e dispara o render da célula. Rodar: npx tsx scripts/_fix-video-restante.ts
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverCelulaVideo } from '@/actions/gerar-video';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const sb = createSupabaseAdmin();

async function main() {
  const { data: trilhas } = await sb.from('trilhas').select('colaborador_id, temporada_plano, colaboradores!inner(nome_completo, cargo, perfil_dominante)').eq('empresa_id', EMP).eq('status', 'ativa');
  const alvos: any[] = [];
  for (const t of (trilhas as any[])) {
    const c = t.colaboradores;
    const disc1 = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    const sem = (t.temporada_plano || []).find((s: any) => Number(s.semana) === 2);
    for (const d of (sem?.conteudos_dia || []).slice(0, 2)) {
      const coreId = d?.conteudo?.core_id; if (!coreId) continue;
      const { data: mc } = await sb.from('micro_conteudos').select('modulo_base_id').eq('id', coreId).maybeSingle();
      const moduloId = (mc as any)?.modulo_base_id; if (!moduloId) continue;
      const { data: deck } = await sb.from('videos_gerados').select('id, status').eq('modulo_base_id', moduloId).eq('empresa_id', EMP).eq('cargo', c.cargo).eq('disc_dominante', disc1).neq('status', 'error').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if ((deck as any)?.status === 'done') continue; // já tem
      alvos.push({ nome: c.nome_completo, colaboradorId: t.colaborador_id, cargo: c.cargo, disc: disc1, moduloId, descritor: d.descritor, temDeck: !!deck, deckStatus: (deck as any)?.status });
    }
  }
  console.log(`Colaboradores sem deck 'done' na semana 2: ${alvos.length}`);
  for (const a of alvos) console.log(`  ${a.nome} · ${a.descritor} · ${a.cargo}/${a.disc} · módulo ${String(a.moduloId).slice(0,8)} · deck atual: ${a.deckStatus || 'nenhum'}`);
  // Dispara render (gerar=true) de cada célula única
  const vistas = new Set<string>();
  for (const a of alvos) {
    const key = `${a.moduloId}/${a.cargo}/${a.disc}`;
    if (vistas.has(key)) continue; vistas.add(key);
    const r: any = await resolverCelulaVideo(a.moduloId, EMP, a.cargo, a.disc, 'fix-restante', { sb, gerar: true, colaboradorId: a.colaboradorId }).catch((e: any) => ({ error: e?.message }));
    console.log(`  → ${a.nome} [${key.slice(0,20)}]: ${r?.error ? 'ERRO ' + String(r.error).slice(0,80) : `dispatch ok (id ${String(r?.id).slice(0,8)}, status ${r?.status})`}`);
  }
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
