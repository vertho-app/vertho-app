/* eslint-disable */
// READ-ONLY: quem terminou a semana 4 (aplicação/missão) em Ibipeba?
// Cruza: população (trilhas ativas), aberturas (trilha_eventos semana=4),
// progresso (temporada_semana_progresso semana=4: status + feedback).
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = 4;

async function main() {
  const sb = createSupabaseAdmin();

  const { data: trilhas, error: e1 } = await sb.from('trilhas')
    .select('id, colaborador_id, temporada_plano, colaboradores(nome_completo, cargo)')
    .eq('empresa_id', EMP).eq('status', 'ativa');
  if (e1) throw new Error(e1.message);
  const porColab = new Map<string, any>();
  for (const t of (trilhas as any[]) || []) porColab.set(t.colaborador_id, t);

  const { data: eventos, error: e2 } = await sb.from('trilha_eventos')
    .select('colaborador_id, tipo, pilula, formato')
    .eq('empresa_id', EMP).eq('semana', SEMANA);
  if (e2) throw new Error(e2.message);

  const { data: prog, error: e3 } = await sb.from('temporada_semana_progresso')
    .select('colaborador_id, tipo, status, feedback, reflexao, iniciado_em, concluido_em')
    .eq('empresa_id', EMP).eq('semana', SEMANA);
  if (e3) throw new Error(e3.message);
  const progPorColab = new Map<string, any>();
  for (const p of (prog as any[]) || []) progPorColab.set(p.colaborador_id, p);

  const abriu = new Set((eventos || []).filter((x: any) => x.tipo === 'abertura').map((x: any) => x.colaborador_id));
  const qualquerEvento = new Set((eventos || []).map((x: any) => x.colaborador_id));

  console.log(`\n=== SEMANA ${SEMANA} (aplicação) · IBIPEBA ===`);
  console.log(`trilhas ativas:            ${porColab.size}`);
  console.log(`abriram o link (abertura): ${abriu.size}`);
  console.log(`qualquer evento na semana: ${qualquerEvento.size}`);

  const porStatus: Record<string, number> = {};
  for (const p of (prog as any[]) || []) porStatus[`${p.tipo}/${p.status}`] = (porStatus[`${p.tipo}/${p.status}`] || 0) + 1;
  console.log(`progresso por tipo/status: ${JSON.stringify(porStatus)}`);

  const nome = (id: string) => porColab.get(id)?.colaboradores?.nome_completo || id;
  const concluidos = (prog as any[] || []).filter((p) => p.status === 'concluido');
  const iniciados = (prog as any[] || []).filter((p) => p.status === 'em_andamento');
  const comFeedback = (prog as any[] || []).filter((p) => {
    const f = p.feedback;
    return f && (f.modo || (Array.isArray(f.transcript_completo) && f.transcript_completo.length > 0));
  });

  console.log(`\nCONCLUÍDOS (${concluidos.length}):`);
  for (const p of concluidos) console.log(`  ✓ ${nome(p.colaborador_id)} · concluído em ${p.concluido_em || '—'}`);
  console.log(`\nEM ANDAMENTO (${iniciados.length}):`);
  for (const p of iniciados) {
    const f = p.feedback || {};
    const turnos = Array.isArray(f.transcript_completo) ? f.transcript_completo.length : 0;
    console.log(`  … ${nome(p.colaborador_id)} · modo=${f.modo || '—'} · turnos=${turnos} · iniciado ${p.iniciado_em || '—'}`);
  }
  console.log(`\ncom feedback (escolheram modo/iniciaram relato): ${comFeedback.length}`);

  // quem abriu mas não tem NENHUMA linha de progresso
  const semProgresso = [...abriu].filter((id) => !progPorColab.has(id));
  console.log(`\nabriram o link mas SEM linha de progresso (${semProgresso.length}):`);
  for (const id of semProgresso) console.log(`  · ${nome(id)}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
