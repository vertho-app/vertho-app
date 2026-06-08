'use server';
/**
 * Perfil Organizacional — gera o "DNA comportamental" (PDF coletivo) de uma
 * empresa a partir do mapeamento DISC (colaboradores). Agrega
 * (lib/perfil-organizacional/aggregate) → PDF (lib/perfil-organizacional-pdf)
 * → Storage → URL. Sem IA — tudo calculado.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { aggregatePerfilOrg } from '@/lib/perfil-organizacional/aggregate';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function gerarPerfilOrganizacional(
  empresaId: string,
): Promise<{ success: boolean; url?: string; avaliados?: number; error?: string }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data: emp } = await sb.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
    if (!emp) return { success: false, error: 'Empresa não encontrada.' };

    const p = await aggregatePerfilOrg(sb, empresaId);
    if (p.semDados || p.avaliados === 0) {
      return { success: false, error: 'Esta empresa ainda não tem mapeamento comportamental (DISC). Sem dados para o Perfil Organizacional.' };
    }

    const buffer = await renderPerfilOrgPDF({ empresaNome: emp.nome, dataRef: dataHoje(), p });
    const storagePath = `final/perfil-org/${empresaId}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(storagePath, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
    if (upErr) return { success: false, error: 'Falha ao salvar o PDF: ' + upErr.message };
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(storagePath);

    return { success: true, url: publicUrl, avaliados: p.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o Perfil Organizacional.' };
  }
}
