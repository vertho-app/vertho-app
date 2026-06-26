'use server';
/**
 * Relatório de Adequação ao Cargo — match dos colaboradores de um cargo com o
 * PERFIL IDEAL (gabarito). Agrega (lib/adequacao-cargo/aggregate) → narrativa IA
 * opcional (lib/adequacao-cargo/narrative) → PDF (lib/adequacao-cargo-pdf) →
 * Storage → URL.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { aggregateAdequacao } from '@/lib/adequacao-cargo/aggregate';
import { renderAdequacaoCargoPDF } from '@/lib/adequacao-cargo-pdf';

/** Cargos da empresa que TÊM gabarito (perfil ideal) — alimenta o seletor da UI. */
export async function listarCargosComGabarito(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa')
      .select('nome, gabarito').eq('empresa_id', empresaId);
    const cargos = (data || [])
      .filter((c: any) => c.gabarito?.tela4)
      .map((c: any) => c.nome)
      .sort((a: string, b: string) => a.localeCompare(b));
    return { cargos };
  } catch {
    return { cargos: [] };
  }
}

export async function gerarRelatorioAdequacao(
  empresaId: string,
  cargo: string,
  opts: { comAnaliseIA?: boolean } = {},
): Promise<{ success: boolean; url?: string; avaliados?: number; error?: string }> {
  try {
    if (!empresaId || !cargo) return { success: false, error: 'Empresa e cargo são obrigatórios.' };
    const sb = await requireAdminSupabase('admin.access');
    const { data: emp } = await sb.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
    if (!emp) return { success: false, error: 'Empresa não encontrada.' };

    const data = await aggregateAdequacao(sb, empresaId, cargo);
    if (data.semGabarito) return { success: false, error: `O cargo "${cargo}" ainda não tem perfil ideal (gabarito). Gere o gabarito do cargo primeiro.` };
    if (data.semColaboradores) return { success: false, error: `Nenhum colaborador do cargo "${cargo}" tem mapeamento comportamental (DISC). Sem dados para o relatório.` };

    const narrativas = opts.comAnaliseIA
      ? await (await import('@/lib/adequacao-cargo/narrative')).gerarNarrativasAdequacao(data).catch(() => ({}))
      : {};

    const buffer = await renderAdequacaoCargoPDF({ data, empresaNome: emp.nome, dataISO: new Date().toISOString(), narrativas });
    const storagePath = `final/adequacao-cargo/${empresaId}-${encodeURIComponent(cargo).replace(/%/g, '')}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(storagePath, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
    if (upErr) return { success: false, error: 'Falha ao salvar o PDF: ' + upErr.message };
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(storagePath);

    return { success: true, url: publicUrl, avaliados: data.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao gerar o Relatório de Adequação ao Cargo.' };
  }
}
