/* eslint-disable */
// Extrai o material para JULGAMENTO HUMANO do item A2 do checklist ("toda
// evidência citada existe de fato nas respostas"). A2 é o único item FATAL —
// sozinho ele segura o veredito —, e no A/B de 12/08 foi acusado 12 vezes em
// 45 rodadas. Ou a IA4 inventa evidência com frequência, ou o auditor acusa
// falso; nenhuma medição decide isso, só leitura.
//
// Para cada acusação, imprime: o que o auditor alegou, as evidências que a
// avaliação citou, e as respostas ORIGINAIS da pessoa — lado a lado.
//
// A saída tem PII (respostas reais). Grave FORA do repo.
//
// Uso: npx tsx scripts/_auditar-item-a2.ts <slug> <n> <saida.txt>
process.loadEnvFile('.env.local');
import { writeFileSync } from 'node:fs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { montarCheckIA4Prompt, processCheckResult } from '@/lib/check-ia4-core';

const SLUG = process.argv[2] || 'macae';
const N = Number(process.argv[3] || 10);
const SAIDA = process.argv[4] || 'a2-casos.txt';
const MODELO = 'gpt-5.6-terra';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: respostas } = await sb.from('respostas')
    .select('id, empresa_id, colaborador_id, competencia_id, competencia_nome, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
    .eq('empresa_id', empresaId)
    .not('avaliacao_ia', 'is', null)
    .order('id')
    .limit(N);

  const blocos: string[] = [];
  let acusadas = 0;

  for (const [i, resp] of (respostas || []).entries()) {
    const { system, prefix, user } = await montarCheckIA4Prompt(sb, resp, empresaId);
    let check: any = null;
    try {
      const txt = await callAI(system, user, { model: MODELO }, 8192,
        { timeoutMs: 180000, maxRetries: 0, cachedUserPrefix: prefix, taskKey: 'ia4_check', empresaId });
      check = processCheckResult(await extractJSON(txt), resp.avaliacao_ia).check;
    } catch (e: any) { console.error(`  ${String(resp.id).slice(0, 8)}: ${e?.message}`); continue; }

    const a2 = check?.verificacoes?.A2;
    console.log(`[${i + 1}/${respostas?.length}] ${String(resp.id).slice(0, 8)} A2=${a2?.ok === false ? 'ACUSADO' : 'ok'}`);
    if (a2?.ok !== false) continue;
    acusadas++;

    const av: any = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;
    const evidencias = (av?.avaliacao_por_descritor || []).flatMap((d: any) =>
      (d.evidencias || []).map((e: any) => `    [${d.nome}] ${e.resposta || '?'}: "${e.trecho || ''}"`)
    );

    blocos.push([
      `═══════════════════════════════════════════════════════════`,
      `RESPOSTA ${String(resp.id).slice(0, 8)} · ${resp.competencia_nome}`,
      ``,
      `O QUE O AUDITOR ALEGA (A2 = evidência inventada):`,
      `  ${a2.obs || '(sem observação)'}`,
      ``,
      `EVIDÊNCIAS QUE A AVALIAÇÃO CITOU:`,
      ...(evidencias.length ? evidencias : ['    (nenhuma)']),
      ``,
      `RESPOSTAS ORIGINAIS DA PESSOA:`,
      `  R1: ${resp.r1 || '—'}`,
      `  R2: ${resp.r2 || '—'}`,
      `  R3: ${resp.r3 || '—'}`,
      `  R4: ${resp.r4 || '—'}`,
      ``,
      `VEREDITO: a evidência citada aparece nas respostas?  [ ] sim (auditor errou)   [ ] não (IA4 inventou)`,
      ``,
    ].join('\n'));
  }

  writeFileSync(SAIDA, blocos.join('\n'), 'utf8');
  console.log(`\n${acusadas} de ${respostas?.length} acusadas em A2 · material em ${SAIDA}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
