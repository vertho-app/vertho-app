/* eslint-disable */
// Valida o prompt novo da IA4 pelo item A3 (evidência tem de declarar origem em
// R1–R4). É medição DETERMINÍSTICA: não depende de julgamento de auditor.
//
// Para cada resposta: mede o A3 da avaliação JÁ GRAVADA (prompt antigo) e o A3
// de uma avaliação NOVA gerada agora (prompt novo), sobre a mesma entrada.
// Nada é persistido — usa montar/chamar/consolidar sem a etapa de gravação.
//
// Uso: npx tsx scripts/_validar-evidencia-a3.ts [slug] [n] [modelo]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import {
  IA4_SYSTEM, IA4_MAX_TOKENS, IA4_COLAB_COLS, IA4_CALL_OPTIONS,
  carregarContextoLoteIA4, carregarContextoRespostaIA4, buildIA4UserPrompt,
  consolidarNotasIA4, blocoConsolidacao, normalizarNiveisDaAvaliacao,
} from '@/lib/ia4-avaliacao';
import { verificarEmCodigo } from '@/lib/check-ia4-core';

const SLUG = process.argv[2] || 'macae';
const N = Number(process.argv[3] || 8);
const MODELO = process.argv[4] || 'claude-sonnet-5';
const CONC = 3;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;
  const tdb = tenantDb(empresaId);

  const { data: respostas } = await tdb.from('respostas')
    .select('*').not('avaliacao_ia', 'is', null).not('r1', 'is', null)
    .order('id').limit(N);
  if (!respostas?.length) throw new Error('sem respostas');

  const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
  const { data: colabs } = await tdb.from('colaboradores').select(IA4_COLAB_COLS).in('id', colabIds);
  const colabMap: Record<string, any> = {};
  (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });
  const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sb, empresaId);

  console.log(`${respostas.length} respostas · modelo=${MODELO} · A3 = evidência declara origem R1–R4\n`);

  const gerar = async (resp: any) => {
    const colab = colabMap[resp.colaborador_id] || {};
    const ctx = await carregarContextoRespostaIA4(tdb, sb, resp);
    const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, colab, empresa, contextoPPP, ctx);
    const txt = await callAI(IA4_SYSTEM, user, { model: MODELO }, IA4_MAX_TOKENS,
      { ...IA4_CALL_OPTIONS, cachedUserPrefix, taskKey: 'ia4_avaliacao', empresaId });
    const av = await extractJSON(txt);
    if (!Array.isArray(av?.avaliacao_por_descritor)) return null;
    // Consolida como a produção faria (sem gravar), para o A3 ver o payload real.
    const cons = consolidarNotasIA4(av.avaliacao_por_descritor);
    normalizarNiveisDaAvaliacao(av, cons.notasPorDesc);
    av.consolidacao = blocoConsolidacao(cons);
    return av;
  };

  let antesRuim = 0, depoisRuim = 0, avaliadas = 0;
  for (let i = 0; i < respostas.length; i += CONC) {
    const lote = respostas.slice(i, i + CONC);
    await Promise.all(lote.map(async (resp: any) => {
      const antes = verificarEmCodigo(resp.avaliacao_ia)?.A3;
      let depois: any = null;
      try { const nova = await gerar(resp); if (nova) depois = verificarEmCodigo(nova)?.A3; }
      catch (e: any) { console.error(`  ${String(resp.id).slice(0, 8)}: ${e?.message}`); }
      if (antes?.ok === false) antesRuim++;
      if (depois) { avaliadas++; if (depois.ok === false) depoisRuim++; }
      console.log(`${String(resp.id).slice(0, 8)}  antes: ${antes?.ok === false ? '❌ ' + (antes.obs || '').slice(0, 80) : '✅'}`);
      console.log(`          depois: ${depois ? (depois.ok === false ? '❌ ' + (depois.obs || '').slice(0, 80) : '✅') : '(falhou)'}`);
    }));
  }

  console.log(`\n══════ A3 (evidência com origem declarada) ══════`);
  console.log(`avaliações GRAVADAS (prompt antigo): ${antesRuim} de ${respostas.length} com evidência solta`);
  console.log(`avaliações NOVAS (prompt novo):      ${depoisRuim} de ${avaliadas} com evidência solta`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
