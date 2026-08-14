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
import { getProgramaConfig } from '@/lib/season-engine/programa-config';

const SLUG = process.argv[2] || 'macae';
const APLICAR = process.argv.includes('--aplicar');
const MODELO = process.argv.find((a) => a.startsWith('claude-')) || 'claude-sonnet-5';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: todos, error } = await sb.from('development_blueprints')
    .select('colaborador_id, auditoria, blueprint, gerado_em')
    .eq('empresa_id', empresaId).order('colaborador_id');
  if (error) throw new Error(error.message);

  // RETOMÁVEL: pula quem já tem o padrão novo (evidência com piso explícito nas
  // semanas de avaliação). Sem isto, retomar uma execução interrompida — e elas
  // são interrompidas, por queda de rede — paga tudo de novo. `--forcar` ignora.
  const TEM_PISO = /ao menos|pelo menos|no m[íi]nimo|\b[1-9]\d*\s+(fichas?|registros?|casos?|atas?|termos?|relat[óo]rios?|devolutivas?|visitas?|reuni[õo]es?)/i;
  // O critério de "já refeito" tem de cobrir TUDO o que a rodada corrige. A
  // primeira versão olhava só o piso da evidência — e teria pulado os 38, que
  // tinham piso mas ainda descreviam 14 semanas quando o programa da empresa é
  // de 7. Filtro que não vê parte do defeito é filtro que mente.
  const { data: emp2 } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  const cfg = getProgramaConfig((emp2 as any)?.sys_config);
  const jaNovo = (bp: any) => {
    const semanas = bp?.trilha?.semanas || [];
    if (semanas.length !== cfg.semanas) return false;
    const aval = semanas.filter((s: any) => s?.tipo === 'avaliacao');
    if (aval.length !== cfg.semanasAvaliacao.length) return false;
    return aval.length > 0 && aval.every((s: any) => TEM_PISO.test(String(s.evidencia_esperada || '')));
  };
  const FORCAR = process.argv.includes('--forcar');

  // `--recentes=N` pula quem foi gerado nas últimas N horas. O filtro `jaNovo`
  // olha a ESTRUTURA (semanas, piso da evidência) e por isso não distingue um
  // blueprint velho de um refeito sobre descritores novos — com `--forcar`, uma
  // execução interrompida recomeçaria do zero e repagaria tudo. Foi o caso em
  // 14/08: a reancoragem trocou os descritores e a regeração morreu na 22ª de 38.
  const RECENTES = Number(process.argv.find((a) => a.startsWith('--recentes='))?.slice(11) || 0);
  const corte = RECENTES ? Date.now() - RECENTES * 3600_000 : 0;
  const recente = (r: any) => corte && r.gerado_em && new Date(r.gerado_em).getTime() > corte;

  const prontos = (todos || []).filter((r: any) => recente(r) || (!FORCAR && jaNovo(r.blueprint)));
  const bps = (todos || []).filter((r: any) => !recente(r) && (FORCAR || !jaNovo(r.blueprint)));

  if (prontos.length) console.log(`↩︎ ${prontos.length} pulado(s)${RECENTES ? ` (gerados nas últimas ${RECENTES}h ou já no padrão novo)` : ' — já no padrão novo (use --forcar para refazer)'}`);
  console.log(`${bps?.length || 0} a regerar · modelo=${MODELO} · ${APLICAR ? 'APLICAR' : 'dry-run'}`);
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
