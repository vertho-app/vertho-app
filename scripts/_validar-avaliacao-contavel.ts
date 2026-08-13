/* eslint-disable */
// Valida a regra nova das semanas de AVALIAÇÃO do blueprint: evidência contável
// (piso explícito) e critério que ENUMERA o que verificar.
//
// Medida determinística, sem depender do auditor: conta quantas semanas de
// avaliação trazem piso ("ao menos N") e quantas caem no genérico ("amostra",
// "registros completos"). Nada é persistido.
//
// Contexto (13/08): Ibipeba, gerado em julho com Sonnet 4.6, tinha piso em 60 de
// 74 semanas de avaliação (81%) e ZERO fails em `avaliacao-mede`. Macaé, gerado
// hoje com Sonnet 5 e o MESMO prompt, teve piso em 1 de 76 (1,3%) e 32 fails. O
// prompt não pedia a quantidade — o 4.6 fazia por conta, o 5 não.
//
// Uso: npx tsx scripts/_validar-avaliacao-contavel.ts <slug> [n] [modelo]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarBlueprintCore } from '@/lib/blueprint/core';

const SLUG = process.argv[2] || 'macae';
const N = Number(process.argv[3] || 4);
const MODELO = process.argv[4] || 'claude-sonnet-5';

const TEM_PISO = /ao menos|pelo menos|no m[íi]nimo|\b[1-9]\d*\s+(fichas?|registros?|casos?|atas?|termos?|relat[óo]rios?|devolutivas?|visitas?|reuni[õo]es?)/i;
const GENERICO = /\bamostra\b|alguns registros|registros do per[íi]odo|material adequado/i;
const ENUMERA = /consegue verificar|quais\b|o que foi|se houve/i;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  // Os mesmos colaboradores que já têm blueprint — assim o "antes" é o gravado.
  const { data: bps } = await sb.from('development_blueprints')
    .select('colaborador_id, blueprint')
    .eq('empresa_id', empresaId).order('colaborador_id').limit(N);
  if (!bps?.length) throw new Error('sem blueprints');

  const medir = (bp: any) => {
    const sem = (bp?.trilha?.semanas || []).filter((s: any) => s?.tipo === 'avaliacao');
    return {
      total: sem.length,
      piso: sem.filter((s: any) => TEM_PISO.test(String(s.evidencia_esperada || ''))).length,
      generico: sem.filter((s: any) => GENERICO.test(String(s.evidencia_esperada || ''))).length,
      enumera: sem.filter((s: any) => ENUMERA.test(String(s.criterio_de_sucesso || ''))).length,
    };
  };

  let a = { total: 0, piso: 0, generico: 0, enumera: 0 };
  let d = { total: 0, piso: 0, generico: 0, enumera: 0 };
  const soma = (acc: any, x: any) => { for (const k of Object.keys(acc)) acc[k] += x[k]; };

  for (const [i, row] of bps.entries()) {
    const antes = medir(row.blueprint);
    soma(a, antes);
    // gerarBlueprintCore PERSISTE; aqui só queremos o texto → dryRun.
    const r: any = await gerarBlueprintCore(sb, { colaboradorId: row.colaborador_id, aiConfig: { model: MODELO }, dryRun: true });
    if (!r?.blueprint) { console.log(`  ${String(row.colaborador_id).slice(0, 8)} ❌ ${r?.error}`); continue; }
    const depois = medir(r.blueprint);
    soma(d, depois);
    console.log(`[${i + 1}/${bps.length}] ${String(row.colaborador_id).slice(0, 8)}  piso ${antes.piso}/${antes.total} → ${depois.piso}/${depois.total} · genérico ${antes.generico} → ${depois.generico} · enumera ${antes.enumera} → ${depois.enumera}`);
  }

  console.log(`\n══════ semanas de avaliação ══════`);
  console.log(`ANTES  (gravado): piso ${a.piso}/${a.total} · genérico ${a.generico} · critério que enumera ${a.enumera}`);
  console.log(`DEPOIS (prompt novo, ${MODELO}): piso ${d.piso}/${d.total} · genérico ${d.generico} · critério que enumera ${d.enumera}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
