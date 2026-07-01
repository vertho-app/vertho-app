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

/** VAGAS da empresa (nome + eh_lideranca) — a tela de extração cria SÓ vagas (eh_vaga=true),
 *  então o badge "atualiza existente" compara só entre vagas, nunca com cargos operacionais. */
export async function listarCargosDaEmpresa(empresaId: string): Promise<{ cargos: { nome: string; eh_lideranca: boolean }[] }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa').select('nome, eh_lideranca').eq('empresa_id', empresaId).eq('eh_vaga', true);
    const cargos = (data || []).filter((c: any) => c.nome).map((c: any) => ({ nome: c.nome, eh_lideranca: !!c.eh_lideranca })).sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    return { cargos };
  } catch { return { cargos: [] }; }
}

/** VAGAS abertas da empresa (Módulo de Seleção) — com status de descrição/gabarito. */
export async function listarVagas(empresaId: string): Promise<{ vagas: { id: string; nome: string; area: string | null; temDescricao: boolean; temGabarito: boolean; ehLideranca: boolean; criadaEm: string | null }[]; erro?: string }> {
  try {
    const sb = await requireAdminSupabase('admin.access');
    const { data } = await sb.from('cargos_empresa')
      .select('id, nome, area_depto, descricao, gabarito, eh_lideranca, created_at')
      .eq('empresa_id', empresaId).eq('eh_vaga', true).order('created_at', { ascending: false });
    const vagas = (data || []).map((c: any) => ({
      id: c.id, nome: c.nome, area: c.area_depto || null,
      temDescricao: !!(c.descricao && String(c.descricao).trim()),
      temGabarito: !!(typeof c.gabarito === 'string' ? JSON.parse(c.gabarito || '{}') : c.gabarito)?.tela4,
      ehLideranca: !!c.eh_lideranca, criadaEm: c.created_at || null,
    }));
    return { vagas };
  } catch (e: any) { return { vagas: [], erro: e?.message || 'Falha ao listar vagas.' }; }
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

/** Persiste a extração REVISADA como VAGA (eh_vaga=true — a tela de extração cria sempre
 *  vaga aberta). CRIA (INSERT) se não existe vaga com esse nome, senão ATUALIZA (UPDATE
 *  parcial; campo vazio nunca apaga coluna). Se o nome colide com um CARGO OPERACIONAL
 *  existente, NÃO sobrescreve — avisa (cargo operacional é cadastrado pela tela interna). */
export async function salvarRevisaoCargo(
  empresaId: string,
  nome: string,
  extracaoRevisada: ExtracaoCargo,
  opts: AchatarOpts = {},
  ehLideranca?: boolean,
): Promise<{ success: boolean; criado?: boolean; gravados?: string[]; diagnostico?: any; error?: string }> {
  try {
    if (!empresaId || !nome?.trim()) return { success: false, error: 'Empresa e nome da vaga são obrigatórios.' };
    const nomeCargo = nome.trim();
    const sb = await requireAdminSupabase('admin.access');
    const { patch, diagnostico } = achatarExtracao(extracaoRevisada, opts);
    if (diagnostico.documentoInvalido) return { success: false, error: 'Documento marcado como inválido — nada a gravar.', diagnostico };

    const registro: Record<string, any> = { ...patch, ...(ehLideranca !== undefined ? { eh_lideranca: ehLideranca } : {}) };
    const { data: existe } = await sb.from('cargos_empresa').select('nome, eh_vaga').eq('empresa_id', empresaId).eq('nome', nomeCargo).maybeSingle();

    if (existe) {
      if (!existe.eh_vaga) return { success: false, error: `Já existe um cargo operacional chamado "${nomeCargo}". Use outro nome para a vaga, ou edite esse cargo pela tela de Colaboradores & Cargos.`, diagnostico };
      if (!Object.keys(registro).length) return { success: true, criado: false, gravados: [], diagnostico };
      const { error } = await sb.from('cargos_empresa').update(registro).eq('empresa_id', empresaId).eq('nome', nomeCargo);
      if (error) return { success: false, error: `Falha ao atualizar a vaga: ${error.message}`, diagnostico };
      return { success: true, criado: false, gravados: Object.keys(registro), diagnostico };
    }
    const { error } = await sb.from('cargos_empresa').insert({ empresa_id: empresaId, nome: nomeCargo, eh_vaga: true, ...registro });
    if (error) return { success: false, error: `Falha ao criar a vaga: ${error.message}`, diagnostico };
    return { success: true, criado: true, gravados: ['nome', ...Object.keys(registro)], diagnostico };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao salvar a vaga.' };
  }
}
