/**
 * Contexto rico do CARGO (cargos_empresa) para alimentar IA com o cenário da
 * função do colaborador: descrição, entregas, stakeholders, decisões, tensões,
 * contexto cultural e se é liderança. Usado pela devolutiva em voz e pelo Beto.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CargoInfo {
  nome?: string | null;
  area_depto?: string | null;
  descricao?: string | null;
  principais_entregas?: string | null;
  stakeholders?: string | null;
  decisoes_recorrentes?: string | null;
  tensoes_comuns?: string | null;
  contexto_cultural?: string | null;
  eh_lideranca?: boolean | null;
}

const CARGO_COLS = 'nome, area_depto, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns, contexto_cultural, eh_lideranca';

/** Carrega o cargo oficial (cargos_empresa) que casa com o nome do cargo do colab. */
export async function carregarCargoInfo(
  sb: SupabaseClient,
  empresaId?: string | null,
  cargoNome?: string | null,
): Promise<CargoInfo | null> {
  if (!empresaId || !cargoNome) return null;
  const { data } = await sb.from('cargos_empresa')
    .select(CARGO_COLS)
    .eq('empresa_id', empresaId)
    .ilike('nome', cargoNome)
    .limit(1)
    .maybeSingle<CargoInfo>();
  return data || null;
}

/** Bloco de texto com o contexto da função, para injetar num prompt. */
export function formatBlocoCargo(cargo?: CargoInfo | null, empresaNome?: string | null): string {
  if (!cargo && !empresaNome) return '';
  const linhas = [
    empresaNome ? `Instituição: ${empresaNome}` : '',
    cargo?.nome ? `Cargo: ${cargo.nome}${cargo.area_depto ? ` (${cargo.area_depto})` : ''}${cargo.eh_lideranca ? ' — posição de liderança' : ''}` : '',
    cargo?.descricao ? `Descrição: ${cargo.descricao}` : '',
    cargo?.principais_entregas ? `Principais entregas: ${cargo.principais_entregas}` : '',
    cargo?.stakeholders ? `Stakeholders: ${cargo.stakeholders}` : '',
    cargo?.decisoes_recorrentes ? `Decisões recorrentes: ${cargo.decisoes_recorrentes}` : '',
    cargo?.tensoes_comuns ? `Tensões comuns: ${cargo.tensoes_comuns}` : '',
    cargo?.contexto_cultural ? `Contexto cultural: ${cargo.contexto_cultural}` : '',
  ].filter(Boolean);
  if (!linhas.length) return '';
  return `═══ CONTEXTO DA FUNÇÃO DO COLABORADOR ═══\n${linhas.join('\n')}\n\nUse como cenário real do dia a dia ao orientar — conecte suas respostas às entregas, stakeholders e decisões do cargo. Não invente atribuições além destas.`;
}
