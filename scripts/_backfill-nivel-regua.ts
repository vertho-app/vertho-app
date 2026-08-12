/* eslint-disable */
// Backfill: re-deriva os NÍVEIS dos payloads da IA4 já gravados pela régua
// canônica (lib/nivel-regua) e pela normalização única (lib/ia4-avaliacao).
//
// Corrige duas coisas de uma vez, sem chamar IA nenhuma:
//   1. nível de descritor com nota > 3,5 gravado como N3 (floor) → N4;
//   2. `nivel_sugerido` da IA divergindo do nível derivado no MESMO documento —
//      o que o auditor da 2ª IA classificava como consolidação contraditória.
//
// Uso: npx tsx scripts/_backfill-nivel-regua.ts [slug|--todas] [--aplicar]
// Sem `--aplicar` é DRY-RUN: só conta e mostra exemplos.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { nivelDaNota } from '@/lib/nivel-regua';
import { normalizarNiveisDaAvaliacao } from '@/lib/ia4-avaliacao';

const ALVO = process.argv[2] || '--todas';
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();

  // Percorre TENANT A TENANT, mesmo no `--todas`: toda leitura de `respostas`
  // leva `.eq('empresa_id', …)` na cadeia. Um `select` global aqui seria mais
  // curto e passaria por cima do tenant-read-guard — o guard está certo, e um
  // script de manutenção não é motivo para abrir exceção nele.
  let empresaIds: string[];
  if (ALVO === '--todas') {
    const { data: emps, error: e1 } = await sb.from('empresas').select('id');
    if (e1) throw new Error(e1.message);
    empresaIds = (emps || []).map((e: any) => e.id);
  } else {
    const { data: emp } = await sb.from('empresas').select('id').eq('slug', ALVO).single();
    if (!emp) throw new Error('empresa não encontrada: ' + ALVO);
    empresaIds = [(emp as any).id];
  }

  const respostas: any[] = [];
  for (const empresaId of empresaIds) {
    const { data, error } = await sb.from('respostas')
      .select('id, empresa_id, avaliacao_ia, nivel_ia4, nota_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null);
    if (error) throw new Error(error.message);
    respostas.push(...(data || []));
  }

  console.log(`${respostas.length} avaliação(ões) em ${empresaIds.length} empresa(s) · modo=${APLICAR ? 'APLICAR' : 'dry-run'}`);

  let mudaram = 0, descritoresCorrigidos = 0, sugeridosCorrigidos = 0, erros = 0;
  const exemplos: string[] = [];

  for (const r of respostas) {
    const av: any = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
    const notasPorDesc = av?.consolidacao?.notas_por_descritor;
    if (!notasPorDesc || typeof notasPorDesc !== 'object') continue;

    const antes = JSON.stringify(av);

    // 1. nível de cada descritor pela régua (a nota gravada é a fonte)
    for (const [chave, v] of Object.entries<any>(notasPorDesc)) {
      const correto = nivelDaNota(v?.nota_decimal);
      if (v?.nivel !== correto) {
        if (exemplos.length < 8) exemplos.push(`  ${String(r.id).slice(0, 8)} ${chave}: nota ${v?.nota_decimal} · N${v?.nivel} → N${correto}`);
        v.nivel = correto;
        descritoresCorrigidos++;
      }
    }

    // 2. os campos que a IA escreveu passam a seguir o derivado (fonte única)
    const sugAntes = JSON.stringify((av.avaliacao_por_descritor || []).map((d: any) => d?.nivel_sugerido));
    normalizarNiveisDaAvaliacao(av, notasPorDesc);
    const sugDepois = JSON.stringify((av.avaliacao_por_descritor || []).map((d: any) => d?.nivel_sugerido));
    if (sugAntes !== sugDepois) sugeridosCorrigidos++;

    if (JSON.stringify(av) === antes) continue;
    mudaram++;

    if (APLICAR) {
      const { error: updErr } = await sb.from('respostas')
        .update({ avaliacao_ia: av })
        .eq('empresa_id', r.empresa_id).eq('id', r.id).select('id');
      if (updErr) { erros++; console.error(`  ERRO ${String(r.id).slice(0, 8)}: ${updErr.message}`); }
    }
  }

  console.log(exemplos.join('\n'));
  console.log(`\nrespostas alteradas: ${mudaram}`);
  console.log(`  níveis de descritor corrigidos: ${descritoresCorrigidos}`);
  console.log(`  payloads com nivel_sugerido realinhado: ${sugeridosCorrigidos}`);
  if (erros) console.log(`  ERROS de gravação: ${erros}`);
  if (!APLICAR) console.log('\n(dry-run — rode com --aplicar para gravar)');
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
