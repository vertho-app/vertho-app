/**
 * CONTROLE do piloto E1: o harness é fiel, ou a nota da produção é pós-regeneração?
 *
 * O piloto deu Sonnet 4.6 = 63 e Qwen = 80. Mas o piso da produção na ACME Demo
 * é 88, e a régua que eu fixei ANTES de rodar dizia que o Sonnet 4.6 tinha que
 * sair perto disso para a medição valer. Saiu 63. Duas hipóteses:
 *
 *   (a) o harness ainda perde algo → o 63 e o 80 são ambos sem significado;
 *   (b) a nota da produção é o FIM do laço de regeneração com feedback
 *       (`regenerarCenarioIA3ComTrava`: gera candidata, audita, só aplica se a
 *       nota for ≥ a atual), e um primeiro rascunho valer 63 é normal.
 *
 * O teste separa as duas sem ambiguidade: pega cenários JÁ PERSISTIDOS, com
 * `nota_check` conhecido, e roda o MESMO caminho de check do piloto sobre eles.
 * Se voltar perto da nota guardada → harness fiel, hipótese (b), piloto válido.
 * Se voltar ~30 pontos abaixo → harness lossy, hipótese (a), piloto inválido.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_piloto-controle-harness.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { montarCheckIA3Prompt, normalizarResultadoCheckIA3 } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));

const EMPRESA = '455f9366-fb4f-4c58-a79e-f94193464744'; // ACME Demo
const CHECKER = 'gpt-5.6-terra';

async function main() {
  const sb = createSupabaseAdmin();
  // ⏭️ PRÓXIMO PASSO desta investigação: trocar o filtro por uma amostra que
  // ATRAVESSE tenants (`.gte('nota_check', 88)` sem `.eq('empresa_id')`). Se só
  // a ACME Demo divergir, a causa é dela — ela tinha override do auditor para
  // `gpt-5.4`, que morreu e foi removido na migration 227. Se divergir em TODOS,
  // a causa é o auditor de hoje contra as notas guardadas, e o problema deixa de
  // ser deste piloto: passa a ser a comparabilidade de `status_check` no tempo.
  const { data: cenarios, error } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, cargo, competencia_id, empresa_id, ppp_escola_id, alternativas, nota_check, status_check, created_at, updated_at')
    .eq('empresa_id', EMPRESA)
    .not('nota_check', 'is', null)
    .order('nota_check', { ascending: false })
    .limit(4);
  if (error) { console.error('erro lendo cenários:', error.message); process.exit(1); }
  if (!cenarios?.length) { console.error('nenhum cenário com nota_check na ACME Demo'); process.exit(1); }

  console.log('re-checando cenários JÁ APROVADOS pelo mesmo caminho do piloto\n');
  const deltas: number[] = [];
  for (const cen of cenarios as any[]) {
    // Sinal de regeneração: linha tocada depois de criada.
    const regerado = cen.updated_at && cen.created_at
      && new Date(cen.updated_at).getTime() - new Date(cen.created_at).getTime() > 60_000;
    try {
      const { system, user } = await montarCheckIA3Prompt(sb, cen);
      const r = await callAI(system, user, { model: CHECKER }, 4096, { taskKey: 'ia3_check', source: 'controle', timeoutMs: 300_000 });
      const normed = normalizarResultadoCheckIA3(await extractJSON(r));
      const nova = Number(normed?.resultado?.nota ?? NaN);
      const delta = nova - cen.nota_check;
      if (Number.isFinite(delta)) deltas.push(delta);
      console.log(`  ${String(cen.titulo || cen.id).slice(0, 44).padEnd(46)} guardada ${String(cen.nota_check).padStart(3)} → re-check ${String(Number.isFinite(nova) ? nova : '?').padStart(3)}  (${delta >= 0 ? '+' : ''}${Number.isFinite(delta) ? delta : '?'})${regerado ? '  [linha atualizada após criação]' : ''}`);
    } catch (e: any) {
      console.log(`  ${String(cen.titulo || cen.id).slice(0, 44).padEnd(46)} 🔴 ${String(e?.message || e).slice(0, 60)}`);
    }
  }

  const media = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : NaN;
  console.log(`\ndelta médio: ${Number.isFinite(media) ? (media >= 0 ? '+' : '') + media.toFixed(1) : '—'} ponto(s)`);
  console.log(Math.abs(media) <= 10
    ? '✅ HARNESS FIEL — o caminho de check do piloto reproduz a nota guardada.\n'
      + '   Logo o 63 do Sonnet 4.6 é nota de PRIMEIRO RASCUNHO, e a comparação do piloto vale.'
    : '🔴 HARNESS INFIEL — o mesmo cenário volta com nota muito diferente.\n'
      + '   O piloto NÃO vale: os dois números foram produzidos por um instrumento que desloca a escala.');
  process.exit(0);
}

main();
