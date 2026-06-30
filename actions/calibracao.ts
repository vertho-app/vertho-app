'use server';
/**
 * Diagnóstico de Calibração (Fase 1) — orquestrador DEV-ONLY (admin-gated).
 *
 * Junta as camadas: higiene (0), cartão engine-free (1), direção (consistency-check) e a
 * materialidade (SIMULAÇÃO rotulada — única peça que toca o motor). DESCREVE e CLASSIFICA;
 * NUNCA prescreve. NÃO entra no PDF do cliente — é instrumentação interna de autoria.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { camada0Higiene, camada1Cartao, camada1Direcao } from '@/lib/calibracao/diagnostico';
import { simularMaterialidade } from '@/lib/calibracao/materialidade';
import { candidateColumns } from '@/lib/scoring/candidate';

export async function listarCargosCalibracao(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa').select('nome, gabarito').eq('empresa_id', empresaId);
    const cargos = (data || []).filter((c: any) => c.gabarito?.tela4).map((c: any) => c.nome).sort((a: string, b: string) => a.localeCompare(b));
    return { cargos };
  } catch { return { cargos: [] }; }
}

export async function diagnosticarCalibracao(empresaId: string, cargo: string): Promise<any> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const data = await aggregateAdequacao(sb, empresaId, cargo);
    if (data.semGabarito) return { success: false, error: 'Cargo sem gabarito.' };
    if (data.semColaboradores) return { success: false, error: 'Nenhum colaborador com DISC.' };

    // Camada 0 — higiene (lista de candidatos crua)
    const { data: cl } = await sb.from('colaboradores').select('id, nome_completo, email, d_natural').eq('empresa_id', empresaId).eq('cargo', cargo);
    const higiene = camada0Higiene((cl || []).map((r: any) => ({ id: r.id, nome: r.nome_completo, email: r.email, dNatural: r.d_natural })));

    // Camada 1 — cartão (engine-free, lê o resultado) + direção (consistency-check)
    const { n, cartao, semTracos } = camada1Cartao(data);
    const direcao = camada1Direcao(data);

    // Materialidade — SIMULAÇÃO (engine) só p/ os traços flagados (não design-by-choice / não curvilíneo-correto)
    const { data: cgRow } = await sb.from('cargos_empresa').select('gabarito, eh_lideranca').eq('empresa_id', empresaId).eq('nome', cargo).maybeSingle();
    const { data: colabs } = await sb.from('colaboradores')
      .select(['id', ...candidateColumns()].join(', '))
      .eq('empresa_id', empresaId).eq('cargo', cargo).not('d_natural', 'is', null).not('email', 'ilike', '%@vertho.ai%');
    const materialidade: Record<string, any> = {};
    if (cgRow?.gabarito && colabs) {
      for (const l of cartao.filter((x) => x.quadrante === 'sinal-recuperavel' || x.quadrante === 'tensao-de-autoria')) {
        const m = simularMaterialidade(cgRow.gabarito, cargo, !!cgRow.eh_lideranca, colabs, l.key);
        if (m) materialidade[l.key] = m;
      }
    }

    return { success: true, cargo, n, semTracos, higiene, cartao, direcao, materialidade };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro no diagnóstico de calibração.' };
  }
}
