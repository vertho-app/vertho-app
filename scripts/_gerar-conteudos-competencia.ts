/* eslint-disable */
// Gera os micro_conteudos CORE de uma competência (todos os descritores × formatos).
//
// POR QUE (medido 14/08): módulo-base NÃO é conteúdo. Os 21 MBs publicados de
// C007 são matéria-prima; o que a trilha entrega são `micro_conteudos`, e Macaé
// tinha ZERO contra 440 de Ibipeba. A trilha piloto morria em "Sem conteúdo para
// GERENCIAMENTO DE CONFLITOS × Aprendizado institucional × Diretor(a) Escolar".
//
// O programa de 7 semanas (PROGRAMA_JORNADA) pede 2 conteúdos por semana em 6
// semanas de conteúdo, cada entrega num descritor distinto, e o formato segue a
// preferência da pessoa — por isso cobre-se descritor × formato, não só um por
// descritor.
//
// `gerarConteudoIA` é idempotente por (empresa, competência, descritor, cargo,
// formato) com `kit_id IS NULL`, então repetir a execução não duplica nem
// repaga. Recebe `sb` injetado: é o caminho headless já previsto pela action
// (mesmo padrão de `_regerar-core-gestao-escolar.ts`).
//
// Uso: npx tsx scripts/_gerar-conteudos-competencia.ts <slug> <competencia> [--cargo=X] [--max=N] [--formatos=texto,case,audio] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarConteudoIA } from '@/actions/conteudos';

const SLUG = process.argv[2] || 'macae';
const COMP = process.argv[3] || 'GERENCIAMENTO DE CONFLITOS';
const CARGO = process.argv.find((a) => a.startsWith('--cargo='))?.slice(8) || 'Diretor(a) Escolar';
const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.slice(6) || 999);
const FORMATOS = (process.argv.find((a) => a.startsWith('--formatos='))?.slice(11) || 'texto,case,audio').split(',');
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: descs } = await sb.from('competencias')
    .select('cod_desc, nome_curto').eq('empresa_id', empresaId)
    .eq('nome', COMP).eq('cargo', CARGO).not('cod_desc', 'is', null).order('cod_desc');
  if (!descs?.length) throw new Error(`sem descritores para "${COMP}" × ${CARGO}`);

  // Pares que FALTAM — a idempotência da action já protege, mas listar antes
  // deixa o custo visível em vez de descobri-lo no fim.
  const { data: existentes } = await sb.from('micro_conteudos')
    .select('descritor, formato').eq('empresa_id', empresaId)
    .eq('competencia', COMP).eq('cargo', CARGO).is('kit_id', null);
  const tem = new Set((existentes || []).map((c: any) => `${c.descritor}|${c.formato}`));

  const pares: { descritor: string; formato: string }[] = [];
  for (const d of descs as any[]) {
    for (const f of FORMATOS) {
      if (!tem.has(`${d.nome_curto}|${f}`)) pares.push({ descritor: d.nome_curto, formato: f });
    }
  }
  const alvo = pares.slice(0, MAX);
  console.log(`${descs.length} descritores × ${FORMATOS.length} formatos = ${descs.length * FORMATOS.length} pares · ${tem.size} já existem · ${pares.length} a gerar`);
  if (MAX < pares.length) console.log(`(limitado a ${alvo.length} nesta execução)`);
  for (const p of alvo.slice(0, 10)) console.log(`  ${p.formato.padEnd(6)} ${p.descritor}`);
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  let ok = 0, pulados = 0; const erros: string[] = [];
  const t0 = Date.now();
  for (const [i, p] of alvo.entries()) {
    let r: any;
    try {
      r = await gerarConteudoIA({
        formato: p.formato as any, competencia: COMP, descritor: p.descritor,
        nivelMin: 1.0, nivelMax: 2.0, cargo: CARGO, contexto: 'educacional',
        empresaId, sb,
      } as any);
    } catch (e: any) { r = { success: false, error: e?.message || String(e) }; }
    if (!r?.success) { erros.push(`${p.formato} ${p.descritor}: ${r?.error}`); console.log(`  [${i + 1}/${alvo.length}] ❌ ${p.formato} ${p.descritor}: ${r?.error}`); continue; }
    if (r.skipped) { pulados++; console.log(`  [${i + 1}/${alvo.length}] ↩︎ ${p.formato} ${p.descritor} (já existia)`); continue; }
    ok++;
    console.log(`  [${i + 1}/${alvo.length}] ✅ ${p.formato.padEnd(6)} ${p.descritor}`);
  }
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n${ok} gerado(s), ${pulados} pulado(s)${erros.length ? `, ${erros.length} erro(s)` : ''} em ${min} min`);
  for (const e of erros) console.log(`  ✗ ${e}`);

  const { count } = await sb.from('micro_conteudos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('competencia', COMP).eq('cargo', CARGO).is('kit_id', null);
  console.log(`${count ?? '?'} conteúdo(s) CORE em ${COMP} × ${CARGO}.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
