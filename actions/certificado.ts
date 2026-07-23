'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import { findColabByEmail, canViewColabJourney } from '@/lib/authz';
import { calcularParticipacao, isTrilhaPiloto } from '@/lib/season-engine/participacao';
import { TRILHA } from '@/lib/status';

/**
 * Carrega os dados do Certificado de Conclusão da temporada mais recente do
 * colaborador. Mesmo gate de posse de `temporada-concluida.ts` (auditoria
 * 23/07, grupo C): o email vem do CLIENTE — passam o próprio colab, gestor da
 * mesma área, RH/tutor do tenant e platform admin.
 *
 * Regras de emissão (produto): temporada concluída + participação ≥ 75%
 * (calcularParticipacao). Piloto (degustação) NÃO emite certificado.
 *
 * Retorna `{ error, motivo }` nos bloqueios — motivo: 'piloto' |
 * 'participacao' — pra rota responder 409 e a UI explicar o critério.
 */
export async function loadCertificadoData(email: string) {
  const ctx = await requireUserAction();
  if (!email) return { error: 'Não autenticado' };

  const sb = createSupabaseAdmin();

  // findColabByEmail resolve o TENANT (multi-tenant → query direta quebrava).
  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id') as any;
  if (!colab) return { error: 'Colaborador não encontrado' };
  if (!canViewColabJourney(ctx, colab)) return { error: 'Sem permissão' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, numero_temporada, competencia_foco, competencias_foco, data_inicio, evolution_generated_at, temporada_plano, evolution_report, programa_modo, empresa_id, status')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  if (!trilha) return { error: 'Nenhuma trilha encontrada' };
  if (trilha.status !== TRILHA.CONCLUIDA) return { error: 'Temporada ainda não concluída' };

  // Piloto (degustação) não emite certificado — decisão de produto.
  if (isTrilhaPiloto(trilha)) return { error: 'Piloto não emite certificado', motivo: 'piloto' };

  const { data: progressos } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilha.id);
  const participacao = calcularParticipacao(trilha.temporada_plano, progressos || []);
  if (!participacao.elegivel) {
    return { error: 'Participação abaixo do mínimo (75%)', motivo: 'participacao', participacao };
  }

  const { data: empresa } = await sb.from('empresas')
    .select('nome, ui_config, default_locale')
    .eq('id', trilha.empresa_id).maybeSingle();

  // Branding dupla: logo do tenant (ui_config.logo_url) → data URI. react-pdf
  // em Node não resolve URL remota direito — o padrão do repo é base64
  // (lib/pdf-assets.ts). Falha/ausência → null (layout cai pro nome em texto).
  let logoEmpresaBase64: string | null = null;
  const logoUrl = (empresa?.ui_config as any)?.logo_url;
  if (logoUrl && typeof logoUrl === 'string') {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const mime = res.headers.get('content-type') || 'image/png';
        const buf = Buffer.from(await res.arrayBuffer());
        logoEmpresaBase64 = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch { /* fallback: nome da empresa em texto */ }
  }

  return {
    ok: true,
    colab: { nome: colab.nome_completo, cargo: colab.cargo },
    trilha: {
      numeroTemporada: trilha.numero_temporada,
      competencias: Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length
        ? trilha.competencias_foco
        : [trilha.competencia_foco].filter(Boolean),
      dataInicio: trilha.data_inicio,
      dataConclusao: trilha.evolution_generated_at,
    },
    empresa: { nome: empresa?.nome || '', locale: empresa?.default_locale || 'pt-BR' },
    participacao,
    logoEmpresaBase64,
  };
}
