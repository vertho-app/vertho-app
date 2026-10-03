import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Trilha de auditoria de ações de platform admin.
 *
 * Chamada de 1 linha no fim das ações sensíveis (disparos + mutações). É
 * **best-effort**: nunca lança — uma falha de auditoria jamais quebra a ação
 * de negócio. Grava via service-role (createSupabaseAdmin) na tabela
 * admin_audit_log (migration 116). IP/user-agent são capturados do request
 * quando disponíveis.
 *
 * Ações sugeridas (string livre, mas mantenha o padrão `dominio.verbo`):
 *   whatsapp.broadcast · whatsapp.magic_links · envio.pdfs_lote · pulse.envio
 *   empresa.criar · empresa.editar · empresa.excluir
 *   temporada.gerar · temporada.regerar · colaboradores.export · colaborador.excluir
 */
export type AuditEntry = {
  adminEmail: string;
  acao: string;
  empresaId?: string | null;
  empresaSlug?: string | null;
  /** Descrição curta do alvo: "53 colaboradores", um id, um nome. */
  alvo?: string | null;
  /**
   * TURMA em cujo escopo a ação rodou (mig 210). `null` = empresa inteira ou
   * ação anterior às turmas. Sem isto, "gerou 38 trilhas" no log não diz PARA
   * QUEM — e num tenant com duas safras essa é a única pergunta que importa.
   */
  turmaId?: string | null;
  /** Payload livre: canal, filtros, contagem, erro, etc. */
  detalhes?: Record<string, any>;
  resultado?: 'ok' | 'parcial' | 'erro';
  adminUserId?: string | null;
};

/**
 * Devolve `true` quando a linha foi gravada.
 *
 * R-65 (revisão de 02/10/2026): o insert não olhava o `{ error }` que o
 * supabase-js DEVOLVE (ele não lança), então uma auditoria perdida era
 * indistinguível de uma gravada, e o `catch` abaixo nunca via nada. Continua
 * sem lançar (a ação de negócio não para por causa do rastro), mas a perda vai
 * para o `logger.error`, que encaminha ao Sentry: um rastro que falha em
 * silêncio é a mesma coisa que não ter rastro.
 */
export async function logAdminAction(entry: AuditEntry): Promise<boolean> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || null;
      userAgent = h.get('user-agent');
    } catch {
      /* headers() indisponível fora de request — segue sem ip/ua */
    }

    const sb = createSupabaseAdmin();
    const { error } = await sb.from('admin_audit_log').insert({
      admin_email: entry.adminEmail,
      admin_user_id: entry.adminUserId ?? null,
      acao: entry.acao,
      empresa_id: entry.empresaId ?? null,
      empresa_slug: entry.empresaSlug ?? null,
      alvo: entry.alvo ?? null,
      turma_id: entry.turmaId ?? null,
      detalhes: entry.detalhes ?? {},
      resultado: entry.resultado ?? 'ok',
      ip,
      user_agent: userAgent,
    });
    if (error) {
      registrarPerda(entry, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    // Auditoria nunca pode quebrar a ação que está auditando.
    registrarPerda(entry, err?.message || String(err));
    return false;
  }
}

/**
 * Sem `detalhes` nem e-mail no aviso: eles podem carregar dado de pessoa, e o
 * que o alarme precisa dizer é QUAL ação ficou sem rastro.
 */
function registrarPerda(entry: AuditEntry, mensagem: string) {
  logger.error('audit', 'registro de auditoria não gravado', {
    acao: entry.acao,
    empresaId: entry.empresaId ?? null,
    resultado: entry.resultado ?? 'ok',
    erro: mensagem,
  });
}
