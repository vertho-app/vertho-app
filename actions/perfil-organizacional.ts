'use server';
/**
 * Perfil Organizacional — gera o "DNA comportamental" (PDF coletivo) de uma
 * empresa a partir do mapeamento DISC (colaboradores). Agrega
 * (lib/perfil-organizacional/aggregate) → PDF (lib/perfil-organizacional-pdf)
 * → bucket PRIVADO → caminho + link da rota que autoriza. Sem IA, tudo calculado.
 */
import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { aggregatePerfilOrg } from '@/lib/perfil-organizacional/aggregate';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';
import { hrefRelatorio, salvarRelatorio } from '@/lib/relatorios/relatorio-privado';

function dataHoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function gerarPerfilOrganizacional(
  empresaId: string,
): Promise<{ success: boolean; url?: string; caminho?: string; avaliados?: number; error?: string }> {
  try {
    // R-63 (revisão de 02/10/2026): o gate era `admin.access`, que o Admin
    // Sócio tem. O Perfil não chama IA, mas gera e publica um PDF da empresa: é ação geradora,
    // e exige `ai.audit.regenerate` pelo gate de plataforma (só
    // `platform_admins`, a permissão vale para qualquer empresa pedida).
    const sb = await requirePlataformaSupabase('ai.audit.regenerate');
    const { data: emp } = await sb.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
    if (!emp) return { success: false, error: 'Empresa não encontrada.' };

    const p = await aggregatePerfilOrg(sb, empresaId);
    if (p.semDados || p.avaliados === 0) {
      return { success: false, error: 'Esta empresa ainda não tem mapeamento comportamental (DISC). Sem dados para o Perfil Organizacional.' };
    }

    const buffer = await renderPerfilOrgPDF({ empresaNome: emp.nome, dataRef: dataHoje(), p });
    // R-74: o PDF traz nome e DISC de cada pessoa. Vai para o bucket PRIVADO
    // e a tela recebe a rota que autoriza no clique, nunca uma URL pública.
    const salvo = await salvarRelatorio(sb.storage, empresaId, 'perfil-org', `${Date.now()}.pdf`, Buffer.from(buffer), 'application/pdf');
    if ('erro' in salvo) return { success: false, error: 'Falha ao salvar o PDF: ' + salvo.erro };

    return { success: true, url: hrefRelatorio(salvo.caminho), caminho: salvo.caminho, avaliados: p.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o Perfil Organizacional.' };
  }
}
