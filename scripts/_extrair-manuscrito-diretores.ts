/* eslint-disable */
// Extrai os módulos-base do manuscrito de uma competência (DOCX) — headless.
//
// Dry-run por padrão: PARSEIA o arquivo e RESOLVE os descritores contra o
// modelo da empresa, mostrando o casamento antes de gastar IA. É o passo que
// evita descobrir no fim de 40 minutos que o manuscrito fala de descritores que
// o catálogo não tem.
//
// Uso: npx tsx scripts/_extrair-manuscrito-diretores.ts <caminho.docx> <slug> [--aplicar]
process.loadEnvFile('.env.local');
import { readFileSync } from 'node:fs';
import { tasks } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import { regionOpts } from '@/lib/trigger-region';
import { parsearManuscrito } from '@/lib/manuscrito-parser';
import { resolverDescritores, TRANSICOES_POR_DESCRITOR } from '@/lib/manuscrito-modulos';
import type { gerarModulosManuscritoTask } from '@/trigger/gerar-modulos-manuscrito';

const ARQUIVO = process.argv[2];
const SLUG = process.argv[3] || 'macae';
const APLICAR = process.argv.includes('--aplicar');
// O manuscrito se identifica com o código do material autoral (DIR08); a matriz
// do tenant pode usar outro (C007). O mapeamento é declarado na linha de
// comando, nunca inferido — ver `resolverDescritores`.
const COD_ALVO = (process.argv.find((a) => a.startsWith('--comp='))?.slice(7) || '').trim() || null;
// `--desc=1,2` limita a extração a esses descritores (1-based). Serve para o
// piloto: 3 módulos lidos antes de mandar os 24 — o casamento a gente prova de
// graça no dry-run, a QUALIDADE do texto só se vê depois de gerar.
const DESCRITORES = (process.argv.find((a) => a.startsWith('--desc='))?.slice(7) || '')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);

async function main() {
  if (!ARQUIVO) throw new Error('informe o caminho do .docx');
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const buffer = readFileSync(ARQUIVO);
  const parse = await parsearManuscrito(buffer);
  console.log(`\n${parse.titulo}`);
  console.log(`cod_comp=${parse.cod_comp} · cargo=${parse.cargo} · ${parse.descritores.length} descritores · ${parse.stats?.modulosPrevistos ?? '?'} módulos previstos (${TRANSICOES_POR_DESCRITOR} transições cada)`);

  const { resolvidos, avisos, error } = await resolverDescritores(sb, parse, empresaId, { codCompAlvo: COD_ALVO });
  if (error || !resolvidos) throw new Error(error || 'falha ao resolver descritores');

  console.log(`\ncasamento com o modelo da empresa:`);
  for (const r of resolvidos as any[]) {
    const ok = r.matchExato ? '✓' : '≈';
    console.log(`  ${String(r.indice ?? '?').padStart(2)} ${ok} ${String(r.descritorManuscrito || '').slice(0, 40).padEnd(42)} → ${r.comp?.cod_desc || '—'} ${r.comp?.nome_curto || '—'}`);
  }
  for (const a of [...parse.avisos, ...avisos]) console.log(`  ⚠ ${a}`);

  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar para extrair)'); return; }

  const nDesc = DESCRITORES.length || parse.descritores.length;
  const total = nDesc * TRANSICOES_POR_DESCRITOR;
  if (DESCRITORES.length) console.log(`\nPILOTO: só descritor(es) ${DESCRITORES.join(', ')} → ${total} módulos`);
  const params = {
    cod_comp: parse.cod_comp, codCompAlvo: COD_ALVO, titulo: parse.titulo, cargoManuscrito: parse.cargo,
    empresaId, locale: 'pt-BR', termoCanonico: null,
    apenasDescritores: DESCRITORES.length ? DESCRITORES : null,
    substituirExistentes: false, auditar: true, createdBy: 'script:_extrair-manuscrito-diretores',
    parseStats: parse.stats, recursos: parse.recursos, docxBase64: buffer.toString('base64'),
  };
  const { data: job, error: errJob } = await sb.from('ia_jobs').insert({
    empresa_id: empresaId,
    fase: 'manuscrito',
    params,
    status: 'queued',
    progress: { done: 0, total, current: 'na fila', resultados: [] },
    created_by: 'script:_extrair-manuscrito-diretores',
  }).select('id').single();
  if (errJob) throw new Error(errJob.message);

  const handle = await tasks.trigger<typeof gerarModulosManuscritoTask>('gerar-modulos-manuscrito', { jobId: job.id }, regionOpts());
  // `update` de JSONB SUBSTITUI a coluna inteira — sem o spread, gravar o runId
  // apaga o `docxBase64` que a task acabou de precisar, e o job morre com
  // "params.docxBase64 ausente" (medido 14/08, 1 job perdido). Mesmo padrão de
  // `actions/manuscrito-batch.ts`.
  const { error: errRun } = await sb.from('ia_jobs')
    .update({ params: { ...params, runId: handle.id } }).eq('id', job.id);
  if (errRun) console.warn(`⚠ runId não gravado: ${errRun.message}`);
  console.log(`\n✅ job ${job.id} enfileirado (${total} módulos) · run ${handle.id}`);
  console.log('Acompanhe: select status, progress from ia_jobs where id = ...');
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
