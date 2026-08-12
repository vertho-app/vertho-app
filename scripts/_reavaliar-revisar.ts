/* eslint-disable */
// Reavalia (revisão controlada com o feedback do auditor) as respostas em
// `revisar` de uma empresa e recheca cada uma — headless, sem prender aba.
//
// Existe porque o botão "Reavaliar todos" da fase 2 roda no CLIENTE, uma Server
// Action por item: a ~120 s por resposta, 55 respostas prendem a aba ~2 h. E a
// tela chama `reavaliarResposta(id)` SEM config, então lá não dá para escolher
// o modelo.
//
// Uso: npx tsx scripts/_reavaliar-revisar.ts <slug> <modelo> <n|--todas> [--aplicar]
// Sem `--aplicar` só LISTA o que faria (nenhuma chamada de IA).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { reavaliarRespostaCore } from '@/lib/ia4-reavaliacao';
import { checarUmaRespostaCore } from '@/lib/check-ia4-core';

const SLUG = process.argv[2] || 'macae';
const MODELO = process.argv[3] || 'claude-sonnet-5';
const LIMITE = process.argv[4] === '--todas' ? Infinity : Number(process.argv[4] || 5);
const APLICAR = process.argv.includes('--aplicar');
const CHECK_MODEL = 'gpt-5.6-terra';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;

  const { data: alvos, error } = await sb.from('respostas')
    .select('id, colaborador_id, competencia_nome, nivel_ia4, nota_ia4, status_ia4, payload_ia4')
    .eq('empresa_id', empresaId)
    .eq('status_ia4', 'revisar')
    .order('id');
  if (error) throw new Error(error.message);

  // Piores primeiro: é onde o modelo novo tem mais o que mostrar.
  const fila = (alvos || [])
    .sort((a: any, b: any) => ((a.payload_ia4 as any)?.nota ?? 0) - ((b.payload_ia4 as any)?.nota ?? 0))
    .slice(0, LIMITE === Infinity ? undefined : LIMITE);

  console.log(`${fila.length} de ${alvos?.length || 0} em 'revisar' · modelo=${MODELO} · check=${CHECK_MODEL} · ${APLICAR ? 'APLICAR' : 'dry-run'}`);
  if (!APLICAR) {
    for (const r of fila) console.log(`  ${String(r.id).slice(0, 8)} ${r.competencia_nome} · nota check ${(r.payload_ia4 as any)?.nota} · N${r.nivel_ia4} (${r.nota_ia4})`);
    console.log('\n(dry-run — rode com --aplicar)');
    return;
  }

  const linhas: any[] = [];
  for (const [i, r] of fila.entries()) {
    const antes = { check: (r.payload_ia4 as any)?.nota, status: r.status_ia4, nivel: r.nivel_ia4, nota: r.nota_ia4, tipo: (r.payload_ia4 as any)?.tipo_de_erro_predominante };
    const rev: any = await reavaliarRespostaCore(sb, r.id, { model: MODELO });
    if (!rev?.success) {
      console.log(`  [${i + 1}/${fila.length}] ${String(r.id).slice(0, 8)} ❌ reavaliação: ${rev?.error}`);
      linhas.push({ id: r.id, antes, erro: rev?.error });
      continue;
    }
    await checarUmaRespostaCore(sb, r.id, { model: CHECK_MODEL });
    const { data: novo } = await sb.from('respostas')
      .select('status_ia4, payload_ia4, nivel_ia4, nota_ia4')
      .eq('empresa_id', empresaId).eq('id', r.id).maybeSingle();
    const depois = { check: (novo?.payload_ia4 as any)?.nota, status: novo?.status_ia4, nivel: novo?.nivel_ia4, nota: novo?.nota_ia4, tipo: (novo?.payload_ia4 as any)?.tipo_de_erro_predominante };
    linhas.push({ id: r.id, competencia: r.competencia_nome, antes, depois });
    const d = (depois.check ?? 0) - (antes.check ?? 0);
    console.log(`  [${i + 1}/${fila.length}] ${String(r.id).slice(0, 8)} check ${antes.check}→${depois.check} (${d >= 0 ? '+' : ''}${d}) · ${antes.status}→${depois.status} · N${antes.nivel}(${antes.nota})→N${depois.nivel}(${depois.nota}) · ${antes.tipo}→${depois.tipo}`);
  }

  const ok = linhas.filter((l) => l.depois);
  const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  console.log(`\ncheck médio ${media(ok.map((l) => l.antes.check))} → ${media(ok.map((l) => l.depois.check))}`);
  console.log(`aprovados_com_ajustes: ${ok.filter((l) => l.depois.status === 'aprovado_com_ajustes').length} de ${ok.length}`);
  console.log(`nota da avaliação média ${media(ok.map((l) => Number(l.antes.nota)))} → ${media(ok.map((l) => Number(l.depois.nota)))}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
