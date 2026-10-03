'use server';
/**
 * DNA Organizacional — gera o "Retrato de Competências" (PDF coletivo anônimo)
 * de uma empresa a partir do diagnóstico de competências (descriptor_assessments).
 * Agrega (lib/dna-organizacional/aggregate) → narrativa IA (segment-aware) →
 * PDF premium (lib/dna-organizacional-pdf) → bucket PRIVADO → caminho + link
 * da rota que autoriza no clique.
 */
import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { aggregateDna } from '@/lib/dna-organizacional/aggregate';
import { gerarNarrativaDna } from '@/lib/dna-organizacional/narrative';
import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import type { AIConfig } from '@/actions/ai-client';
import { hrefRelatorio, salvarRelatorio } from '@/lib/relatorios/relatorio-privado';

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function gerarDnaOrganizacional(
  empresaId: string,
): Promise<{ success: boolean; url?: string; caminho?: string; avaliados?: number; error?: string }> {
  try {
    // R-63 (revisão de 02/10/2026): o gate era `admin.access`, que o Admin
    // Sócio tem. O DNA chama IA (narrativa) e publica um PDF: é ação geradora,
    // e exige `ai.audit.regenerate` pelo gate de plataforma (só
    // `platform_admins`, a permissão vale para qualquer empresa pedida).
    const sb = await requirePlataformaSupabase('ai.audit.regenerate');
    const { data: emp } = await sb
      .from('empresas').select('id, nome, segmento, sys_config').eq('id', empresaId).maybeSingle();
    if (!emp) return { success: false, error: 'Empresa não encontrada.' };

    const dna = await aggregateDna(sb, empresaId);
    if (dna.semDados || dna.avaliados === 0) {
      return { success: false, error: 'Esta empresa ainda não tem avaliações de competência (diagnóstico). Sem dados para o DNA Organizacional.' };
    }

    const aiConfig: AIConfig = { model: (emp.sys_config as any)?.ai?.modelo_padrao };
    const narrativa = await gerarNarrativaDna(dna, { empresaNome: emp.nome, segmento: emp.segmento, aiConfig });
    const buffer = await renderDnaPDF({ empresaNome: emp.nome, dataRef: dataHoje(), segmento: emp.segmento, dna, narrativa });

    // R-74: bucket PRIVADO e o caminho; a tela abre pela rota que autoriza.
    const salvo = await salvarRelatorio(sb.storage, empresaId, 'dna', `${Date.now()}.pdf`, Buffer.from(buffer), 'application/pdf');
    if ('erro' in salvo) return { success: false, error: 'Falha ao salvar o PDF: ' + salvo.erro };

    return { success: true, url: hrefRelatorio(salvo.caminho), caminho: salvo.caminho, avaliados: dna.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o DNA Organizacional.' };
  }
}
