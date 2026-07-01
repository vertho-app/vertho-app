'use server';
/**
 * Fase 0 da parametrização — EXTRAÇÃO de descrição de cargo.
 *
 *   1. extrairDescricaoCargo(doc)  → ExtracaoCargo pré-marcada p/ a tela de revisão
 *   2. [revisão humana na UI: aprova/edita/rejeita itens]
 *   3. salvarRevisaoCargo(...)     → achata (adapter) → PATCH parcial em cargos_empresa
 *
 * Só campos que a IA2 (gabarito) consome; nomes já são as colunas de cargos_empresa.
 * NÃO gera competências/faixas/DISC — isso é da IA2 (actions/fase1.ts).
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { extrairCargo, type ExtratorInput } from '@/lib/cargo-extracao/extrator';
import { achatarExtracao, prepararRevisao, type ExtracaoCargo, type AchatarOpts } from '@/lib/cargo-extracao/adapter';

/** Cargos da empresa (todos — a extração é ANTES do gabarito) p/ o seletor da tela. */
export async function listarCargosDaEmpresa(empresaId: string): Promise<{ cargos: string[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa').select('nome').eq('empresa_id', empresaId);
    const cargos = (data || []).map((c: any) => c.nome).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b));
    return { cargos };
  } catch { return { cargos: [] }; }
}

/** Extrai a descrição de um documento → estrutura RICA pré-marcada p/ revisão. NÃO grava. */
export async function extrairDescricaoCargo(
  input: ExtratorInput,
): Promise<{ success: boolean; extracao?: ExtracaoCargo; error?: string }> {
  try {
    await requireAdminSupabase('admin.access');
    const extracao = await extrairCargo(input);
    return { success: true, extracao: prepararRevisao(extracao) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao extrair a descrição do cargo.' };
  }
}

/** Persiste a extração REVISADA: achata (só aprovados) → PATCH parcial em cargos_empresa.
 *  Patch parcial NUNCA apaga coluna existente com "" (campo vazio não entra no update). */
export async function salvarRevisaoCargo(
  empresaId: string,
  cargo: string,
  extracaoRevisada: ExtracaoCargo,
  opts: AchatarOpts = {},
): Promise<{ success: boolean; gravados?: string[]; diagnostico?: any; error?: string }> {
  try {
    if (!empresaId || !cargo) return { success: false, error: 'Empresa e cargo são obrigatórios.' };
    const sb = await requireAdminSupabase('admin.access');
    const { patch, diagnostico } = achatarExtracao(extracaoRevisada, opts);

    if (diagnostico.documentoInvalido) return { success: false, error: 'Documento marcado como inválido — nada a gravar.', diagnostico };
    const gravados = Object.keys(patch);
    if (!gravados.length) return { success: true, gravados: [], diagnostico }; // nada aprovado ainda — não toca no cargo

    const { error } = await sb.from('cargos_empresa').update(patch).eq('empresa_id', empresaId).eq('nome', cargo);
    if (error) return { success: false, error: `Falha ao gravar no cargo: ${error.message}`, diagnostico };
    return { success: true, gravados, diagnostico };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao salvar a revisão do cargo.' };
  }
}
