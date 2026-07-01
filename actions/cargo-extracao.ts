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

/** Cargos da empresa (nome + eh_lideranca) — p/ o badge novo/existente e pré-carga do toggle. */
export async function listarCargosDaEmpresa(empresaId: string): Promise<{ cargos: { nome: string; eh_lideranca: boolean }[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa').select('nome, eh_lideranca').eq('empresa_id', empresaId);
    const cargos = (data || []).filter((c: any) => c.nome).map((c: any) => ({ nome: c.nome, eh_lideranca: !!c.eh_lideranca })).sort((a: any, b: any) => a.nome.localeCompare(b.nome));
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

/** Persiste a extração REVISADA num cargo. CRIA (INSERT) se `nome` não existe na empresa,
 *  senão ATUALIZA (UPDATE) com PATCH PARCIAL (campo vazio NUNCA apaga coluna existente).
 *  `ehLideranca` (decisão do gestor, não do doc) grava sempre que informado — muda pesos/
 *  knockouts na IA2. `nome` é o nome final (editável, pode ser novo). */
export async function salvarRevisaoCargo(
  empresaId: string,
  nome: string,
  extracaoRevisada: ExtracaoCargo,
  opts: AchatarOpts = {},
  ehLideranca?: boolean,
): Promise<{ success: boolean; criado?: boolean; gravados?: string[]; diagnostico?: any; error?: string }> {
  try {
    if (!empresaId || !nome?.trim()) return { success: false, error: 'Empresa e nome do cargo são obrigatórios.' };
    const nomeCargo = nome.trim();
    const sb = await requireAdminSupabase('admin.access');
    const { patch, diagnostico } = achatarExtracao(extracaoRevisada, opts);
    if (diagnostico.documentoInvalido) return { success: false, error: 'Documento marcado como inválido — nada a gravar.', diagnostico };

    const registro: Record<string, any> = { ...patch, ...(ehLideranca !== undefined ? { eh_lideranca: ehLideranca } : {}) };
    const { data: existe } = await sb.from('cargos_empresa').select('nome').eq('empresa_id', empresaId).eq('nome', nomeCargo).maybeSingle();

    if (existe) {
      if (!Object.keys(registro).length) return { success: true, criado: false, gravados: [], diagnostico };
      const { error } = await sb.from('cargos_empresa').update(registro).eq('empresa_id', empresaId).eq('nome', nomeCargo);
      if (error) return { success: false, error: `Falha ao atualizar o cargo: ${error.message}`, diagnostico };
      return { success: true, criado: false, gravados: Object.keys(registro), diagnostico };
    }
    const { error } = await sb.from('cargos_empresa').insert({ empresa_id: empresaId, nome: nomeCargo, ...registro });
    if (error) return { success: false, error: `Falha ao criar o cargo: ${error.message}`, diagnostico };
    return { success: true, criado: true, gravados: ['nome', ...Object.keys(registro)], diagnostico };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao salvar a revisão do cargo.' };
  }
}
