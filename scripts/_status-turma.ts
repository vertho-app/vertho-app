/* eslint-disable */
/**
 * Muda o STATUS de uma turma (a safra) — com o mesmo rastro da tela.
 *
 * O status é rótulo operacional: só `concluida`/`arquivada` tiram a turma de
 * operação (`TURMA_ENCERRADAS`); os demais valores não mudam comportamento
 * nenhum. Mas é o rótulo que a equipe lê no painel, e um rótulo errado é o tipo
 * de coisa que faz alguém tomar decisão sobre uma turma que já não está ali.
 *
 * ⚠️ AUDITA como a action da tela (`turma.editar`). Um update direto no banco
 * mudaria o mesmo campo e apagaria a resposta para "quem disse que essa turma
 * entrou em jornada?" — que é a pergunta que aparece depois.
 *
 * Uso:
 *   npx tsx scripts/_status-turma.ts --empresa=macae                       → lista
 *   npx tsx scripts/_status-turma.ts --empresa=macae --turma="Diretores" --status=em_jornada --aplicar
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { logAdminAction } from '@/lib/audit';
import { TURMA, type TurmaStatus } from '@/lib/status';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const ALVO = arg('turma');
const STATUS = arg('status') as TurmaStatus | undefined;
const APLICAR = process.argv.includes('--aplicar');
const VALIDOS = Object.values(TURMA) as string[];

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp, error: eE } = await sb.from('empresas')
    .select('id, nome').eq('slug', SLUG).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);
  const empresaId = (emp as any).id as string;

  const { data: turmas, error: eT } = await sb.from('turmas')
    .select('id, nome, status').eq('empresa_id', empresaId).order('nome');
  if (eT) throw new Error(`turmas: ${eT.message}`);

  console.log(`${(emp as any).nome}`);
  for (const t of (turmas || []) as any[]) {
    const { count } = await sb.from('turma_membros')
      .select('id', { count: 'exact', head: true })
      .eq('turma_id', t.id).eq('status', 'ativo');
    // Distribuição junto do rótulo: o status sozinho mente sobre uma turma que
    // tem gente em jornada e gente parada no diagnóstico ao mesmo tempo.
    const { count: comTrilha } = await sb.from('trilhas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId).eq('status', 'ativa')
      .in('colaborador_id', (await sb.from('turma_membros')
        .select('colaborador_id').eq('turma_id', t.id).eq('status', 'ativo'))
        .data?.map((m: any) => m.colaborador_id) || ['-']);
    console.log(`  · ${t.nome} — status=${t.status} · ${count ?? 0} membros · ${comTrilha ?? 0} com trilha ativa`);
  }

  if (!ALVO || !STATUS) {
    console.log('\nPara mudar: --turma="<parte do nome>" --status=<' + VALIDOS.join('|') + '> --aplicar');
    return;
  }
  if (!VALIDOS.includes(STATUS)) throw new Error(`status inválido: ${STATUS} (use ${VALIDOS.join(', ')})`);

  const casadas = ((turmas || []) as any[]).filter((t) => t.nome.toLowerCase().includes(ALVO.toLowerCase()));
  if (casadas.length !== 1) {
    throw new Error(`"${ALVO}" casou ${casadas.length} turma(s): ${casadas.map((t) => t.nome).join(' | ') || '(nenhuma)'} — seja mais específico`);
  }
  const turma = casadas[0];

  console.log(`\n${turma.nome}: ${turma.status} → ${STATUS}`);
  if (!APLICAR) { console.log('dry-run — rode com --aplicar.'); return; }

  const { data, error } = await sb.from('turmas')
    .update({ status: STATUS, updated_at: new Date().toISOString() })
    .eq('id', turma.id).eq('empresa_id', empresaId)   // tenant: nunca cruza empresa
    .select('id, nome, status').maybeSingle();
  if (error) throw new Error(`update: ${error.message}`);
  if (!data) throw new Error('turma não encontrada nesta empresa');

  await logAdminAction({
    adminEmail: 'system:script',
    acao: 'turma.editar',
    empresaId,
    turmaId: turma.id,
    alvo: turma.nome,
    detalhes: { status: STATUS, anterior: turma.status, via: 'scripts/_status-turma.ts' },
  });

  console.log(`✓ ${(data as any).nome} agora é ${(data as any).status}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
