'use server';

/**
 * Regerar UM PDI a partir da auditoria (25/09/2026).
 *
 * A auditoria roda em todo PDI desde 27/08 e grava em `conteudo.auditoria`, mas
 * nenhuma tela a lia. Agora ela aparece na aba PDI desta página (é para cá que a
 * etapa "Consolidar os PDIs" da turma aponta), e a leitura sai do mesmo
 * `loadRelatoriosEmpresa` que já traz o `conteudo`. Aqui fica só a escrita.
 *
 * Roda nesta rota, e o `maxDuration = 300` do layout da empresa cobre a geração
 * (o core dá até 300s ao `callAI`).
 */
import { requireAdminAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';
import { logAdminAction } from '@/lib/audit';
import { getModelForTask } from '@/lib/ai-tasks';
import { gerarRelatorioIndividual } from '@/actions/relatorios';

/**
 * Gera de novo o PDI de uma pessoa: texto, auditoria e PDF. Passa pelo mesmo
 * `gerarRelatorioIndividual` do painel da empresa (gate e service-role são dele).
 *
 * 🔑 O modelo é resolvido AQUI, pelo configurado para a task: o `callAI` não
 * consulta `getModelForTask`, e sem `model` o PDI sairia no modelo padrão do
 * wrapper, diferente do de todos os outros PDIs.
 *
 * Não reenvia o aviso de plano: a idempotência por `kind='plano'` segura, e a
 * pessoa passa a ver o texto novo quando abrir o plano.
 */
export async function regerarPdi(empresaId: string, colaboradorId: string) {
  const ctx = await requireAdminAction('ai.audit.regenerate');
  if (!empresaId || !colaboradorId) {
    return { success: false as const, error: 'empresaId e colaboradorId obrigatórios' };
  }
  const model = await getModelForTask(empresaId, 'pdi_individual');

  let r: { success: boolean; error?: string } = { success: false, error: 'não executado' };
  let status: string | null = null;
  try {
    r = await gerarRelatorioIndividual(empresaId, colaboradorId, { model });
    if (r.success) {
      const { data, error } = await tenantDb(empresaId).from('relatorios')
        .select('auditoria:conteudo->auditoria')
        .eq('colaborador_id', colaboradorId).eq('tipo', 'individual').maybeSingle();
      if (!error) status = (data as any)?.auditoria?.status ?? null;
    }
  } catch (e: any) {
    r = { success: false, error: e?.message || 'falha ao regerar' };
  } finally {
    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'pdi.regerar',
      empresaId,
      alvo: colaboradorId,
      detalhes: { model, auditoria: status },
      resultado: r.success ? 'ok' : 'erro',
    });
  }
  return r.success
    ? { success: true as const, status }
    : { success: false as const, error: r.error || 'falha ao regerar' };
}
