'use server';
/**
 * DNA Organizacional — gera o "Retrato de Competências" (PDF coletivo anônimo)
 * de uma empresa a partir do diagnóstico de competências (descriptor_assessments).
 * Agrega (lib/dna-organizacional/aggregate) → narrativa IA (segment-aware) →
 * PDF premium (lib/dna-organizacional-pdf) → Storage → URL pública.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { aggregateDna } from '@/lib/dna-organizacional/aggregate';
import { gerarNarrativaDna } from '@/lib/dna-organizacional/narrative';
import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import type { AIConfig } from '@/actions/ai-client';

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function gerarDnaOrganizacional(
  empresaId: string,
): Promise<{ success: boolean; url?: string; avaliados?: number; error?: string }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
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

    const storagePath = `final/dna/${empresaId}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(storagePath, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
    if (upErr) return { success: false, error: 'Falha ao salvar o PDF: ' + upErr.message };
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(storagePath);

    return { success: true, url: publicUrl, avaliados: dna.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o DNA Organizacional.' };
  }
}
