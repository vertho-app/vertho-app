/* eslint-disable */
/**
 * Muda os DIAS da cadência de um tenant (`sys_config.cadencia`).
 *
 * A tela `/admin/empresas/<id>/configuracoes` faz o mesmo; este script existe
 * para a mudança ficar registrada com o motivo e para ser conferível antes de
 * aplicar — dia de cadência decide QUAL conteúdo sai (P1 ≠ P2), e trocar o
 * número errado entrega a pílula 2 de uma semana que nunca teve a 1.
 *
 * ⚠️ MERGE, NUNCA SOBRESCREVE: `sys_config` guarda muito mais que a cadência.
 * O script lê, funde só as chaves pedidas e grava — e imprime o antes/depois.
 *
 * Dias: 1=segunda … 7=domingo (mesma convenção de `diaDaSemanaBRT`).
 *
 * Uso:
 *   npx tsx scripts/_cadencia-empresa.ts --empresa=macae                   → mostra
 *   npx tsx scripts/_cadencia-empresa.ts --empresa=macae --p1=2 --p2=3 --ev=4 --aplicar
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const APLICAR = process.argv.includes('--aplicar');
const NOMES = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

function dia(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error(`dia inválido: ${v} (use 1..7)`);
  return n;
}

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp, error } = await sb.from('empresas')
    .select('id, slug, nome, sys_config').eq('slug', SLUG).maybeSingle();
  if (error) throw new Error(`empresas: ${error.message}`);
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);

  const atual = ((emp as any).sys_config?.cadencia || {}) as Record<string, any>;
  const p1 = dia(arg('p1')), p2 = dia(arg('p2')), ev = dia(arg('ev'));

  const novo = {
    ...atual,
    ...(p1 !== null ? { fase4_dia_pilula: p1 } : {}),
    ...(p2 !== null ? { fase4_dia_pilula2: p2 } : {}),
    ...(ev !== null ? { fase4_dia_evidencia: ev } : {}),
  };

  const linha = (c: Record<string, any>) =>
    `P1=${c.fase4_dia_pilula ?? 1} (${NOMES[c.fase4_dia_pilula ?? 1]}) · ` +
    `P2=${c.fase4_dia_pilula2 ?? 2} (${NOMES[c.fase4_dia_pilula2 ?? 2]}) · ` +
    `cobrança=${c.fase4_dia_evidencia ?? 4} (${NOMES[c.fase4_dia_evidencia ?? 4]})`;

  console.log(`${(emp as any).nome} (${SLUG})`);
  console.log(`  antes:  ${linha(atual)}`);
  console.log(`  depois: ${linha(novo)}`);

  if (p1 !== null && p2 !== null && p1 === p2) {
    throw new Error('P1 e P2 no mesmo dia: o motor manda a P2 e a P1 nunca sai');
  }

  if (!APLICAR) { console.log('\ndry-run — rode com --aplicar.'); return; }

  const { error: eU } = await sb.from('empresas')
    .update({ sys_config: { ...((emp as any).sys_config || {}), cadencia: novo } })
    .eq('id', (emp as any).id);
  if (eU) throw new Error(`update: ${eU.message}`);

  console.log('\n✓ aplicado');
}

main().catch((e) => { console.error(e); process.exit(1); });
