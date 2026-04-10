'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

/**
 * Carrega o PDI ativo do colaborador.
 * O campo `conteudo` é JSONB com objetivos por competência.
 */
export async function loadPDI(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, email, cargo, area_depto, empresa_id');
  if (!colab) return { error: 'Colaborador nao encontrado' };

  const sb = createSupabaseAdmin();

  // Buscar PDI ativo
  const { data: pdi } = await sb.from('pdis')
    .select('id, conteudo, status, created_at')
    .eq('colaborador_id', colab.id)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pdi) {
    // Verificar se o colab já completou TODAS as competências do top5 do cargo
    // (não só "tem pelo menos uma resposta" — diferencia "em progresso" de "tudo concluído, aguardando admin gerar PDI")
    const { data: cargoEmp } = await sb.from('cargos_empresa')
      .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
    const totalTop5 = (cargoEmp?.top5_workshop || []).length;
    const { count: respondidas } = await sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id);
    const concluiuAvaliacao = totalTop5 > 0 && (respondidas || 0) >= totalTop5;
    return {
      colaborador: colab,
      pdiAtivo: false,
      concluiuAvaliacao,
      respondidas: respondidas || 0,
      totalAvaliacao: totalTop5,
    };
  }

  return {
    colaborador: colab,
    pdiAtivo: true,
    conteudo: pdi.conteudo,
    pdiId: pdi.id,
    criadoEm: pdi.created_at,
  };
}
