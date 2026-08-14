/* eslint-disable */
// Publica os módulos-base de uma competência que já passaram na auditoria.
//
// POR QUE headless: `publicado` é o ÚNICO status que o resolver da trilha
// enxerga, e a publicação é o momento em que o `descritor_embedding` nasce.
// Pela tela, são 21 cliques para o DIR08 — e o núcleo é o MESMO que a action
// usa (`lib/modulos-base/publicar.ts`), então não há risco de os dois caminhos
// divergirem: reprovado continua barrado aqui também.
//
// Uso: npx tsx scripts/_publicar-modulos-aprovados.ts <slug> <cod_comp> [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { publicarModuloCore } from '@/lib/modulos-base/publicar';

const SLUG = process.argv[2] || 'macae';
const COD = process.argv[3] || 'C007';
const APLICAR = process.argv.includes('--aplicar');
const QUEM = 'script:_publicar-modulos-aprovados';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);

  const { data: comps } = await sb.from('competencias').select('id')
    .eq('empresa_id', (emp as any).id).eq('cod_comp', COD).not('cod_desc', 'is', null);
  const compIds = (comps || []).map((c: any) => c.id);
  if (!compIds.length) throw new Error(`nenhum descritor de ${COD} em ${SLUG}`);

  const { data: mbs, error } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, nivel_entrada, nivel_destino, status, auditoria_ia')
    .eq('empresa_id', (emp as any).id).in('competencia_id', compIds)
    .eq('status', 'revisao').order('id');
  if (error) throw new Error(error.message);

  const publicaveis = (mbs || []).filter((m: any) => m.auditoria_ia?.veredito !== 'reprovado');
  const barrados = (mbs || []).length - publicaveis.length;
  console.log(`${mbs?.length || 0} em revisão · ${publicaveis.length} publicáveis · ${barrados} reprovados (ficam parados)`);
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  let ok = 0; const erros: string[] = [];
  for (const m of publicaveis as any[]) {
    const r: any = await publicarModuloCore(sb, QUEM, m.id);
    if (r?.error) erros.push(`${m.nivel_entrada}→${m.nivel_destino} ${m.descritor}: ${r.error}`);
    else ok++;
  }
  console.log(`\n✅ ${ok} publicado(s)${erros.length ? `, ${erros.length} com erro:` : ''}`);
  for (const e of erros) console.log(`  ✗ ${e}`);

  const { count } = await sb.from('modulos_base_conteudo')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', (emp as any).id).in('competencia_id', compIds)
    .eq('status', 'publicado').not('descritor_embedding', 'is', null);
  console.log(`${count ?? '?'} publicado(s) COM embedding — é o que o resolver da trilha enxerga.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
