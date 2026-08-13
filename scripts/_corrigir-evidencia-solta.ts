/* eslint-disable */
// Corrige as avaliações cuja EVIDÊNCIA não declara origem em R1–R4 (item A3) —
// tipicamente o cenário citado como se fosse prova do que a pessoa demonstrou.
//
// Seleção DETERMINÍSTICA (`verificarEmCodigo(...).A3`), não julgamento: entra só
// quem tem o defeito. Corrige por REAVALIAÇÃO, não regerando do zero — a revisão
// preserva o que já era defensável, mantém o histórico `_revisao` e o prompt
// dela manda REMOVER a evidência de cenário herdada.
//
// ⚠️ Não aplica o piso de `lib/ia4-fila-reavaliacao`: aquele piso existe para não
// mexer em avaliação que só está com nota baixa. Aqui o critério é DEFEITO
// objetivo, e defeito se conserta mesmo em quem está com nota alta.
//
// Uso: npx tsx scripts/_corrigir-evidencia-solta.ts <slug> [--aplicar] [modelo]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { verificarEmCodigo, checarUmaRespostaCore } from '@/lib/check-ia4-core';
import { reavaliarRespostaCore } from '@/lib/ia4-reavaliacao';

const SLUG = process.argv[2] || 'macae';
const APLICAR = process.argv.includes('--aplicar');
const MODELO = process.argv.find((a) => a.startsWith('claude-')) || 'claude-sonnet-5';
const CHECK_MODEL = 'gpt-5.6-terra';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: todas, error } = await sb.from('respostas')
    .select('id, competencia_nome, avaliacao_ia, status_ia4, payload_ia4, nivel_ia4, nota_ia4')
    .eq('empresa_id', empresaId)
    .not('avaliacao_ia', 'is', null)
    .order('id');
  if (error) throw new Error(error.message);

  const afetadas = (todas || [])
    .map((r: any) => ({ r, a3: verificarEmCodigo(r.avaliacao_ia)?.A3 }))
    .filter((x) => x.a3?.ok === false);

  console.log(`${afetadas.length} de ${todas?.length} avaliações com evidência sem origem · modelo=${MODELO} · ${APLICAR ? 'APLICAR' : 'dry-run'}\n`);
  for (const { r, a3 } of afetadas) {
    console.log(`  ${String(r.id).slice(0, 8)} ${r.competencia_nome?.slice(0, 34)} · ${r.status_ia4} ${(r.payload_ia4 as any)?.nota ?? '—'}pts · ${a3!.obs?.slice(0, 90)}`);
  }
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  let ok = 0, falhas = 0, limpos = 0;
  for (const [i, { r }] of afetadas.entries()) {
    const antes = { status: r.status_ia4, nota: (r.payload_ia4 as any)?.nota, nivel: r.nivel_ia4 };
    const rev: any = await reavaliarRespostaCore(sb, r.id, { model: MODELO });
    if (!rev?.success) { falhas++; console.log(`  [${i + 1}/${afetadas.length}] ${String(r.id).slice(0, 8)} ❌ ${rev?.error}`); continue; }
    await checarUmaRespostaCore(sb, r.id, { model: CHECK_MODEL });

    const { data: novo } = await sb.from('respostas')
      .select('avaliacao_ia, status_ia4, payload_ia4, nivel_ia4')
      .eq('empresa_id', empresaId).eq('id', r.id).maybeSingle();
    const a3Depois = verificarEmCodigo(novo?.avaliacao_ia)?.A3;
    if (a3Depois?.ok) limpos++;
    ok++;
    console.log(`  [${i + 1}/${afetadas.length}] ${String(r.id).slice(0, 8)} A3 ${a3Depois?.ok ? '✅' : '❌ ' + (a3Depois?.obs || '').slice(0, 60)} · check ${antes.nota}→${(novo?.payload_ia4 as any)?.nota} · ${antes.status}→${novo?.status_ia4} · N${antes.nivel}→N${novo?.nivel_ia4}`);
  }

  console.log(`\n${ok} reavaliadas${falhas ? `, ${falhas} falhas` : ''} · A3 limpo em ${limpos} de ${ok}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
