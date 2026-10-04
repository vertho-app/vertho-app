'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

// O convite de avaliação por e-mail (`dispararEmails`) saiu em 04/10/2026: ele
// apontava para `/avaliacao/{token}`, rota que nunca existiu em `app/`, e nenhuma
// tela o chamava. O que sobra aqui é só a leitura do status dos envios.

// ── Ver status dos envios (com sync automático de respostas) ────────────────

export async function verStatusEnvios(empresaId: string) {
  const sb = await requireAdminSupabase();
  try {
    // Auto-sync: marcar como respondido se sessão concluída
    const { data: enviados } = await sb.from('envios_diagnostico')
      .select('id, colaborador_id')
      .eq('empresa_id', empresaId)
      .eq('status', 'enviado');

    if (enviados?.length) {
      for (const envio of enviados) {
        const { count } = await sb.from('sessoes_avaliacao')
          .select('*', { count: 'exact', head: true })
          .eq('colaborador_id', envio.colaborador_id)
          .eq('empresa_id', empresaId)
          .eq('status', 'concluida');

        if (count && count > 0) {
          await sb.from('envios_diagnostico')
            .update({ status: 'respondido', respondido_em: new Date().toISOString() })
            .eq('id', envio.id);
        }
      }
    }

    // Buscar status atualizado
    const { data: envios } = await sb.from('envios_diagnostico')
      .select('id, email, status, enviado_em, respondido_em, tipo')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    const resumo = {
      total: envios?.length || 0,
      pendente: envios?.filter(e => e.status === 'pendente').length || 0,
      enviado: envios?.filter(e => e.status === 'enviado').length || 0,
      respondido: envios?.filter(e => e.status === 'respondido').length || 0,
    };

    return { success: true, message: `Total: ${resumo.total} | Pendente: ${resumo.pendente} | Enviado: ${resumo.enviado} | Respondido: ${resumo.respondido}`, resumo, envios };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
