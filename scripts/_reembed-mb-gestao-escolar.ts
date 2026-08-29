/* eslint-disable */
/**
 * Reconstrói `descritor_embedding` dos MBs de Autocuidado × Gestão Escolar depois da
 * correção do campo `descritor` (`_corrigir-mb-gestao-escolar.ts`).
 *
 * Por que em duas etapas: a Voyage está em **3 RPM** (429 — sem método de pagamento na
 * conta), então metade dos recálculos falhou no primeiro passe. Um MB com descritor NOVO
 * e vetor ANTIGO é o pior estado possível: o embedding tem precedência absoluta sobre
 * tokens (`modulo-base-integration.ts`), então o vetor do título continuaria mandando e
 * o bug seguiria de pé — agora invisível, porque o texto parece certo.
 *
 * Ordem, portanto:
 *  1. ZERA todos os vetores do par → o match cai em tokens e casa exato pelo nome (1.00).
 *     Estado correto e determinístico, sem depender de API.
 *  2. Tenta recalcular um a um com throttle. Falha deixa NULL — que já está certo.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_reembed-mb-gestao-escolar.ts [--apply] [--rpm 3]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';

const APPLY = process.argv.includes('--apply');
const iRpm = process.argv.indexOf('--rpm');
const RPM = iRpm > -1 ? Number(process.argv[iRpm + 1]) : 3;
const ESPERA_MS = Math.ceil(60_000 / Math.max(1, RPM)) + 1_000;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias')
    .select('id').ilike('nome', 'Autocuidado e resiliência emocional').eq('cargo', 'Gestão Escolar');
  const compIds = (comps || []).map((c: any) => c.id);

  const { data: mbs } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, titulo, nivel_entrada, descritor_embedding')
    .in('competencia_id', compIds).order('descritor');

  const comVetor = (mbs || []).filter((m: any) => m.descritor_embedding);
  console.log(`${APPLY ? '🔥 APPLY' : '🔍 DRY RUN'} · ${mbs?.length || 0} MB(s) · ${comVetor.length} com vetor hoje · throttle ${RPM} RPM (${(ESPERA_MS / 1000).toFixed(0)}s entre chamadas)`);
  if (!APPLY) { console.log('\n→ rode com --apply'); return; }

  // 1) Zerar: estado seguro imediato (tokens casam exato com o nome já corrigido).
  const { error: errZero } = await sb.from('modulos_base_conteudo')
    .update({ descritor_embedding: null }).in('id', (mbs || []).map((m: any) => m.id));
  if (errZero) throw new Error(`zerar: ${errZero.message}`);
  console.log(`✓ ${mbs?.length} vetor(es) zerados — match agora é por tokens (exato)\n`);

  // 2) Recalcular com throttle. Falhar aqui é aceitável: NULL já está correto.
  let ok = 0, falhou = 0;
  for (const [i, m] of (mbs || []).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, ESPERA_MS));
    try {
      const emb = await embedText(`${m.descritor} ${m.titulo || ''}`.trim());
      if (!emb?.vector) { falhou++; console.log(`  · ${String(m.descritor).padEnd(26)} ${m.nivel_entrada} — sem vetor (fica NULL)`); continue; }
      const { error } = await sb.from('modulos_base_conteudo')
        .update({ descritor_embedding: emb.vector }).eq('id', m.id);
      if (error) { falhou++; console.log(`  ✗ ${m.descritor}: ${error.message}`); continue; }
      ok++;
      console.log(`  ✓ ${String(m.descritor).padEnd(26)} ${m.nivel_entrada} +emb`);
    } catch (e: any) {
      falhou++;
      console.log(`  · ${String(m.descritor).padEnd(26)} ${m.nivel_entrada} — ${String(e?.message || e).slice(0, 60)} (fica NULL)`);
    }
  }
  console.log(`\nembeddings: ${ok} recalculado(s) · ${falhou} em NULL (correto por tokens)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
