/**
 * Import de cargos (Empresas › Gerenciar › Importar Cargos): os títulos da
 * planilha (na tela) e a coluna de liderança (no servidor).
 */
import { chaveSemAcento, traduzirTitulos } from '@/lib/planilha-titulos';

/**
 * Título → coluna de `cargos_empresa`. Os títulos do modelo (25/09/2026) e os
 * antigos (`nome`, `area_depto`, `entregas`, `lideranca`...) valem igual.
 */
const COLUNA_DO_TITULO: Record<string, string> = {
  'cargo': 'nome',
  'nome': 'nome',
  'nome do cargo': 'nome',
  'area': 'area_depto',
  'area depto': 'area_depto',
  'departamento': 'area_depto',
  'descricao': 'descricao',
  'descricao do cargo': 'descricao',
  'principais entregas': 'principais_entregas',
  'entregas': 'principais_entregas',
  'stakeholders': 'stakeholders',
  'decisoes recorrentes': 'decisoes_recorrentes',
  'decisoes': 'decisoes_recorrentes',
  'tensoes comuns': 'tensoes_comuns',
  'tensoes': 'tensoes_comuns',
  'contexto cultural': 'contexto_cultural',
  'contexto': 'contexto_cultural',
  'cargo de lideranca': 'eh_lideranca',
  'eh lideranca': 'eh_lideranca',
  'lideranca': 'eh_lideranca',
};

export function colunasDoCargo(linhas: Record<string, string>[]): Record<string, string>[] {
  return traduzirTitulos(linhas, COLUNA_DO_TITULO);
}

const NAO = new Set(['nao', 'n', 'no', 'false', '0']);

/**
 * "Cargo de liderança?" da planilha. Em branco é SIM, como no formulário do
 * cargo e em /admin/cargos (`eh_lideranca !== false`), e como a tela do import
 * sempre anunciou ("default: sim"). Até 25/09/2026 o import gravava em branco,
 * e "Sim" com maiúscula, como NÃO; e o fit tira o bloco de liderança do cargo
 * não-líder (actions/fit-v2.ts).
 */
export function liderancaDaPlanilha(valor: unknown): boolean {
  if (typeof valor === 'boolean') return valor;
  return !NAO.has(chaveSemAcento(valor));
}
