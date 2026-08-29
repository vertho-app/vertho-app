/* eslint-disable */
/**
 * READ-ONLY: mede o que o backfill de `descritor_embedding` mudaria na ESCOLHA de
 * módulo-base, antes de gastar a decisão.
 *
 * Contexto (F-I13): 198 de 216 MBs publicados estão sem vetor, então o resolver decide
 * por overlap de tokens. Preencher os vetores muda o critério de TODO o acervo — na
 * direção que o sistema pretende, mas sem medição isso é fé. Aqui a pergunta é
 * respondida com número: para cada (competência × cargo × descritor) que o acervo
 * atende, qual MB vence hoje (tokens) e qual venceria com embedding?
 *
 * Como: chama o resolver de verdade DUAS vezes por caso — uma com o provider desligado
 * (`EMBEDDING_PROVIDER=none` força o ramo de tokens) e outra com ele ligado. Nada é
 * escrito; os vetores dos MBs não são tocados. Só compara a decisão.
 *
 * ⚠️ O ramo "com embedding" só difere no lado da QUERY enquanto os MBs não têm vetor —
 * `relevancia()` exige vetor nos DOIS lados (`queryVec && emb`). Então este script mede o
 * cenário REAL de hoje (query com vetor, acervo sem) e serve de linha de base; o efeito
 * completo do backfill exige repetir a medição depois de preencher uma AMOSTRA.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_medir-impacto-embedding.ts [limite]
 */
import { createSupabaseAdmin } from '@/lib/supabase';

const LIMITE = Number(process.argv[2] || 40);

async function escolher(sb: any, caso: any, comEmbedding: boolean) {
  const antes = process.env.EMBEDDING_PROVIDER;
  process.env.EMBEDDING_PROVIDER = comEmbedding ? (antes === 'none' ? 'voyage' : (antes || 'voyage')) : 'none';
  // Import dinâmico a cada troca: `getProvider()` lê o env por chamada, mas o módulo do
  // resolver mantém caches internos por execução — reimportar isola as duas medições.
  const mod = await import(`@/lib/season-engine/modulo-base-integration?t=${comEmbedding ? 1 : 0}`);
  try {
    const r: any = await mod.resolverModuloBaseParaConteudo(sb, {
      competenciaNome: caso.competencia, descritor: caso.descritor,
      cargo: caso.cargo, empresaId: caso.empresa_id, nivelMin: 1.0,
    });
    return { id: r?.modulo?.id || r?.id || null, criterio: r?.criterio || '' };
  } finally {
    process.env.EMBEDDING_PROVIDER = antes;
  }
}

async function main() {
  const sb = createSupabaseAdmin();

  // Casos = (competência × cargo × descritor) que o acervo publicado atende.
  const { data: mbs } = await sb.from('modulos_base_conteudo')
    .select('competencia_id, empresa_id, descritor').eq('status', 'publicado').not('competencia_id', 'is', null);
  const { data: comps } = await sb.from('competencias').select('id, nome, cargo, nome_curto, cod_comp');
  const compDe = Object.fromEntries((comps || []).map((c: any) => [c.id, c]));

  const casos = new Map<string, any>();
  for (const mb of (mbs || [])) {
    const c = compDe[(mb as any).competencia_id];
    if (!c?.nome_curto) continue;
    const k = `${c.nome}|${c.cargo}|${c.nome_curto}`;
    if (!casos.has(k)) casos.set(k, { competencia: c.nome, cargo: c.cargo, descritor: c.nome_curto, empresa_id: (mb as any).empresa_id });
  }
  const lista = [...casos.values()].slice(0, LIMITE);
  console.log(`medindo ${lista.length} caso(s) de ${casos.size} (limite ${LIMITE})\n`);

  let iguais = 0, diferentes = 0, semEscolha = 0;
  for (const caso of lista) {
    const tok = await escolher(sb, caso, false);
    const emb = await escolher(sb, caso, true);
    if (!tok.id && !emb.id) { semEscolha++; continue; }
    if (tok.id === emb.id) { iguais++; continue; }
    diferentes++;
    console.log(`≠ ${String(caso.cargo).slice(0, 18).padEnd(18)} ${String(caso.descritor).slice(0, 26).padEnd(26)} tokens=${String(tok.id).slice(0, 8)} (${tok.criterio.split('·')[0].trim()}) → emb=${String(emb.id).slice(0, 8)} (${emb.criterio.split('·')[0].trim()})`);
  }

  console.log(`\n=== iguais: ${iguais} · DIFERENTES: ${diferentes} · sem escolha: ${semEscolha} ===`);
  console.log(diferentes === 0
    ? 'Nenhuma decisão muda nos casos medidos — o backfill é seguro (e o ganho aparece só em descritor parafraseado).'
    : `⚠️ ${diferentes} decisão(ões) mudariam — revisar caso a caso antes do backfill.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
