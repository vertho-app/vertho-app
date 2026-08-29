/* eslint-disable */
/**
 * Backfill de `descritor_embedding` nos módulos-base publicados que estão sem vetor
 * (198 de 216 em 28/07 — F-I13), com medição ANTES e DEPOIS da decisão do resolver.
 *
 * Por que medir em volta: preencher os vetores muda o critério de escolha de TODO o
 * acervo (hoje overlap de tokens). É a direção que o sistema pretende, mas "provavelmente
 * melhor" não é medição. Então: fotografa a decisão de cada caso, preenche, fotografa de
 * novo e imprime as que mudaram. Reversível — `descritor_embedding = NULL` volta ao
 * estado anterior por MB.
 *
 * Fórmula do vetor: a MESMA da publicação (`aprovarPublicar`): `descritor + ' ' + titulo`.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_backfill-embeddings-mb.ts [--apply]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { embedText, estatisticasEmbedding } from '@/lib/embeddings';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const APPLY = process.argv.includes('--apply');

async function decisoes(sb: any, casos: any[]) {
  const out = new Map<string, string | null>();
  for (const c of casos) {
    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: c.competencia, descritor: c.descritor, cargo: c.cargo,
      empresaId: c.empresa_id, nivelMin: 1.0,
    });
    out.set(c.chave, r?.modulo?.id || r?.id || null);
  }
  return out;
}

async function main() {
  const sb = createSupabaseAdmin();

  const { data: mbs } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, titulo, competencia_id, empresa_id, descritor_embedding')
    .eq('status', 'publicado');
  const semVetor = (mbs || []).filter((m: any) => !m.descritor_embedding);

  const { data: comps } = await sb.from('competencias').select('id, nome, cargo, nome_curto');
  const compDe = Object.fromEntries((comps || []).map((c: any) => [c.id, c]));

  const casos = new Map<string, any>();
  for (const mb of (mbs || [])) {
    const c = compDe[(mb as any).competencia_id];
    if (!c?.nome_curto) continue;
    const chave = `${c.nome}|${c.cargo}|${c.nome_curto}`;
    if (!casos.has(chave)) casos.set(chave, { chave, competencia: c.nome, cargo: c.cargo, descritor: c.nome_curto, empresa_id: (mb as any).empresa_id });
  }
  const lista = [...casos.values()];

  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · ${mbs?.length} MB(s) publicados · ${semVetor.length} sem vetor · ${lista.length} caso(s) de decisão`);
  if (!APPLY) { console.log('\n→ rode com --apply (mede antes, preenche, mede depois)'); return; }

  console.log('\n1) fotografando decisões ANTES...');
  const antes = await decisoes(sb, lista);

  console.log(`2) preenchendo ${semVetor.length} vetor(es)...`);
  let ok = 0, falhou = 0;
  for (const m of semVetor) {
    const emb = await embedText(`${m.descritor || ''} ${m.titulo || ''}`.trim());
    if (!emb?.vector) { falhou++; continue; }
    const { error } = await sb.from('modulos_base_conteudo').update({ descritor_embedding: emb.vector }).eq('id', m.id);
    if (error) { falhou++; console.log(`   ✗ ${m.id}: ${error.message}`); continue; }
    ok++;
    if (ok % 25 === 0) console.log(`   ${ok}/${semVetor.length}...`);
  }
  console.log(`   preenchidos: ${ok} · falhas: ${falhou} · ${JSON.stringify(estatisticasEmbedding())}`);

  console.log('\n3) fotografando decisões DEPOIS...');
  const depois = await decisoes(sb, lista);

  let iguais = 0, mudou = 0;
  for (const c of lista) {
    const a = antes.get(c.chave), d = depois.get(c.chave);
    if (a === d) { iguais++; continue; }
    mudou++;
    console.log(`≠ ${String(c.cargo).slice(0, 18).padEnd(18)} ${String(c.descritor).slice(0, 28).padEnd(28)} ${String(a).slice(0, 8)} → ${String(d).slice(0, 8)}`);
  }
  console.log(`\n=== decisões: ${iguais} iguais · ${mudou} MUDARAM ===`);
  if (mudou) console.log('Revisar as mudanças acima. Reverter um MB: descritor_embedding = NULL (volta a tokens).');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
