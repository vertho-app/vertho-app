/* eslint-disable */
// Regera os blueprints de uma empresa (prompt atual) e re-audita cada um,
// reportando o score antes/depois. Headless — não passa por HTTP nem prende aba.
//
// Motivo (13/08): os blueprints de Macaé saíram com score 79,8 e drift em 34 de
// 38, contra 88,4 e ZERO drift em Ibipeba. Mesma estrutura (14 semanas, 2 de
// avaliação) e MESMO prompt — a diferença era o modelo: Ibipeba rodou em julho
// no Sonnet 4.6, Macaé hoje no Sonnet 5, e o 5 escrevia "amostra de registros"
// onde o 4.6 escrevia "ao menos duas fichas". O prompt não exigia a quantidade;
// agora exige (evidência contável + critério que enumera).
//
// Uso: npx tsx scripts/_regerar-blueprints.ts <slug> [--aplicar] [modelo]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarBlueprintCore, auditarBlueprintCore } from '@/lib/blueprint/core';

const SLUG = process.argv[2] || 'macae';
const APLICAR = process.argv.includes('--aplicar');
const MODELO = process.argv.find((a) => a.startsWith('claude-')) || 'claude-sonnet-5';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: bps, error } = await sb.from('development_blueprints')
    .select('colaborador_id, auditoria')
    .eq('empresa_id', empresaId).order('colaborador_id');
  if (error) throw new Error(error.message);

  console.log(`${bps?.length || 0} blueprints · modelo=${MODELO} · ${APLICAR ? 'APLICAR' : 'dry-run'}`);
  if (!APLICAR) { console.log('(dry-run — rode com --aplicar)'); return; }

  let ok = 0, falhas = 0;
  const antes: number[] = [], depois: number[] = [];
  let driftAntes = 0, driftDepois = 0;

  for (const [i, row] of (bps || []).entries()) {
    const sAntes = Number((row.auditoria as any)?.score);
    if (Number.isFinite(sAntes)) { antes.push(sAntes); if ((row.auditoria as any)?.drift) driftAntes++; }

    const g: any = await gerarBlueprintCore(sb, { colaboradorId: row.colaborador_id, aiConfig: { model: MODELO }, empresaIdEsperado: empresaId });
    if (g?.error) { falhas++; console.log(`  [${i + 1}/${bps!.length}] ${String(row.colaborador_id).slice(0, 8)} ❌ ${g.error}`); continue; }

    const a: any = await auditarBlueprintCore(sb, { colaboradorId: row.colaborador_id, empresaIdEsperado: empresaId });
    const sDepois = Number(a?.relatorio?.score);
    if (Number.isFinite(sDepois)) { depois.push(sDepois); if (a?.relatorio?.drift) driftDepois++; }
    ok++;
    console.log(`  [${i + 1}/${bps!.length}] ${String(row.colaborador_id).slice(0, 8)} score ${sAntes}→${sDepois}${a?.relatorio?.drift ? ' · DRIFT' : ''}${a?.relatorio?.parcial ? ' · PARCIAL' : ''}`);
  }

  const med = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0);
  console.log(`\n${ok} regerados${falhas ? `, ${falhas} falhas` : ''}`);
  console.log(`score médio ${med(antes)} → ${med(depois)} · drift ${driftAntes} → ${driftDepois}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
