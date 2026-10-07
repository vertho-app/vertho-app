/**
 * Régua ÚNICA da aba "Cenários" da Fase 1
 * (`/admin/empresas/[id]/fase1?tab=cenarios`): quem entra no recorte por cargo e
 * por competência, e de onde saem os grupos que a tela desenha.
 *
 * Por que é um módulo, e não uma expressão dentro da tela: cada grupo de cargo
 * calcula, a partir da MESMA lista, o cabeçalho (`N cenários · N ressalvas · N
 * revisar`) e as filas dos botões de lote ("Revisar todos", "Validar todos",
 * "Regerar selecionados"), e cada um desses botões chama IA. Se o filtro valesse
 * só para a lista de cartões, o número e o botão continuariam falando do cargo
 * inteiro enquanto a tela mostra um recorte (mesma classe do painel da IA4,
 * `lib/ia4-painel-respostas.ts`, medida em 29/08/2026). Com o filtro aplicado
 * ANTES de agrupar, todo número e toda fila nascem do conjunto visível, e o
 * teste (`tests/unit/fase1-cenarios-filtro.test.ts`) acusa se isso mudar.
 *
 * A competência é comparada pelo NOME normalizado (`normalizarComp`), não pelo
 * id: "Autocuidado e resiliência emocional" é uma linha de `competencias` por
 * cargo (COO03 na Coordenação, DIR02 na Gestão Escolar), e quem filtra quer ver
 * a competência atravessando os cargos.
 */

import { normalizarComp } from '@/lib/workshop-competencias';

/** Valor do filtro para cenário cuja competência não resolveu nome (id órfão). */
export const SEM_COMPETENCIA = '__sem_competencia__';

export type CenarioFiltravel = {
  cargo?: string | null;
  competencia_nome?: string | null;
};

export type FiltrosCenarios = {
  /** Nome do cargo, igual ao de `banco_cenarios.cargo`. '' = todos. */
  cargo?: string;
  /** Chave de `opcoesDeCompetencia` (nome normalizado ou `SEM_COMPETENCIA`). '' = todas. */
  competencia?: string;
};

export type OpcaoFiltro = { valor: string; rotulo: string };

/** Há algum filtro escolhido? (decide se a tela mostra o "de N" e o "limpar"). */
export function temFiltroCenarios(f: FiltrosCenarios): boolean {
  return Boolean(f.cargo || f.competencia);
}

/** Chave de competência de um cenário: nome normalizado, ou `SEM_COMPETENCIA`. */
export function chaveCompetencia(c: CenarioFiltravel): string {
  return normalizarComp(c?.competencia_nome) || SEM_COMPETENCIA;
}

/** O conjunto VISÍVEL: a única fonte dos grupos, dos números e das filas de lote. */
export function filtrarCenarios<T extends CenarioFiltravel>(cenarios: T[], f: FiltrosCenarios): T[] {
  return (cenarios || []).filter((c) => {
    if (f.cargo && c.cargo !== f.cargo) return false;
    if (f.competencia && chaveCompetencia(c) !== f.competencia) return false;
    return true;
  });
}

/** Agrupa por cargo mantendo a ordem de chegada (a tela já recebe `order by cargo`). */
export function agruparPorCargo<T extends CenarioFiltravel>(cenarios: T[]): Record<string, T[]> {
  const grupos: Record<string, T[]> = {};
  for (const c of cenarios || []) {
    const chave = c.cargo as string;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(c);
  }
  return grupos;
}

const porRotulo = (a: OpcaoFiltro, b: OpcaoFiltro) => a.rotulo.localeCompare(b.rotulo, 'pt-BR');

/** Cargos que têm cenário, em ordem alfabética. */
export function opcoesDeCargo(cenarios: CenarioFiltravel[]): OpcaoFiltro[] {
  const vistos = new Map<string, OpcaoFiltro>();
  for (const c of cenarios || []) {
    if (c.cargo && !vistos.has(c.cargo)) vistos.set(c.cargo, { valor: c.cargo, rotulo: c.cargo });
  }
  return [...vistos.values()].sort(porRotulo);
}

/**
 * Competências oferecidas, em ordem alfabética: só as do cargo escolhido (ou de
 * todos, sem cargo). `SEM_COMPETENCIA` entra por último e só se existir.
 * O rótulo é o nome do primeiro cenário que trouxe aquela chave.
 */
export function opcoesDeCompetencia(cenarios: CenarioFiltravel[], cargo?: string): OpcaoFiltro[] {
  const vistos = new Map<string, OpcaoFiltro>();
  for (const c of filtrarCenarios(cenarios, { cargo })) {
    const chave = chaveCompetencia(c);
    if (chave === SEM_COMPETENCIA || vistos.has(chave)) continue;
    vistos.set(chave, { valor: chave, rotulo: String(c.competencia_nome).trim() });
  }
  const lista = [...vistos.values()].sort(porRotulo);
  if (filtrarCenarios(cenarios, { cargo }).some((c) => chaveCompetencia(c) === SEM_COMPETENCIA)) {
    lista.push({ valor: SEM_COMPETENCIA, rotulo: '' });
  }
  return lista;
}

/**
 * Trocar o cargo mantém a competência escolhida só se ela existir no cargo novo;
 * senão volta para "todas". Sem isto a tela ficaria com um filtro que não casa
 * com nada e uma lista vazia que parece falha de carregamento.
 */
export function ajustarCompetencia(cenarios: CenarioFiltravel[], cargoNovo: string, competenciaAtual: string): string {
  if (!competenciaAtual) return '';
  return opcoesDeCompetencia(cenarios, cargoNovo).some((o) => o.valor === competenciaAtual) ? competenciaAtual : '';
}

/**
 * Tira da seleção ("Regerar selecionados") o que o filtro escondeu. A fila do
 * botão já nasce do conjunto visível, mas um id marcado e depois escondido
 * continuaria na seleção e voltaria marcado ao limpar o filtro: um clique
 * depois, a IA regeraria um cenário que ninguém estava olhando.
 */
export function podarSelecao(selecionados: Set<string>, visiveis: Array<{ id?: string }>): Set<string> {
  const ids = new Set((visiveis || []).map((c) => c.id).filter(Boolean) as string[]);
  return new Set([...selecionados].filter((id) => ids.has(id)));
}
