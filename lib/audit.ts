import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';

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
  /** Payload livre: canal, filtros, contagem, erro, etc. */
  detalhes?: Record<string, any>;
  resultado?: 'ok' | 'parcial' | 'erro';
  adminUserId?: string | null;
};

export async function logAdminAction(entry: AuditEntry): Promise<void> {
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
    await sb.from('admin_audit_log').insert({
      admin_email: entry.adminEmail,
      admin_user_id: entry.adminUserId ?? null,
      acao: entry.acao,
      empresa_id: entry.empresaId ?? null,
      empresa_slug: entry.empresaSlug ?? null,
      alvo: entry.alvo ?? null,
      detalhes: entry.detalhes ?? {},
      resultado: entry.resultado ?? 'ok',
      ip,
      user_agent: userAgent,
    });
  } catch (err: any) {
    // Auditoria nunca pode quebrar a ação que está auditando.
    console.warn('[audit] falha ao registrar (não-bloqueante):', err?.message);
  }
}
