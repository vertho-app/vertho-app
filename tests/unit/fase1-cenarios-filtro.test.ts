import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEM_COMPETENCIA, agruparPorCargo, ajustarCompetencia, filtrarCenarios,
  opcoesDeCargo, opcoesDeCompetencia, podarSelecao, temFiltroCenarios,
} from '@/lib/fase1-cenarios-filtro';

/**
 * Filtro por cargo e competência na aba "Cenários" da Fase 1. O que estes testes
 * travam: o cabeçalho de cada cargo, as filas dos botões de lote (cada uma chama
 * IA) e a seleção saem do MESMO conjunto que a lista mostra. Validado por
 * mutação: trocar `filtrarCenarios(...)` por `cenarios` em qualquer ponto derruba
 * pelo menos um `it` daqui.
 */

const AUTOCUIDADO = 'Autocuidado e resiliência emocional';

const AMOSTRA = [
  // Coordenação Pedagógica
  { id: 'c1', cargo: 'Coordenação Pedagógica', competencia_nome: 'Colaboração docente e cultura formativa', status_check: 'aprovado_com_ressalvas' },
  { id: 'c2', cargo: 'Coordenação Pedagógica', competencia_nome: AUTOCUIDADO, status_check: 'revisar' },
  { id: 'c3', cargo: 'Coordenação Pedagógica', competencia_nome: AUTOCUIDADO, status_check: 'aprovado' },
  // Gestão Escolar: o MESMO nome, escrito com caixa e espaço diferentes
  { id: 'g1', cargo: 'Gestão Escolar', competencia_nome: ' autocuidado e resiliência emocional ', status_check: 'revisar' },
  { id: 'g2', cargo: 'Gestão Escolar', competencia_nome: 'Planejamento e Organização', status_check: 'aprovado' },
  // Gestão Educacional, com um id de competência órfão (nome não resolveu)
  { id: 'e1', cargo: 'Gestão Educacional', competencia_nome: null, status_check: null },
];

const ids = (l: Array<{ id: string }>) => l.map((c) => c.id);

describe('filtro de cenários da Fase 1: recorte', () => {
  it('sem filtro, tudo está visível e nada é reordenado', () => {
    expect(ids(filtrarCenarios(AMOSTRA, {}))).toEqual(['c1', 'c2', 'c3', 'g1', 'g2', 'e1']);
    expect(ids(filtrarCenarios(AMOSTRA, { cargo: '', competencia: '' }))).toEqual(['c1', 'c2', 'c3', 'g1', 'g2', 'e1']);
  });

  it('por cargo', () => {
    expect(ids(filtrarCenarios(AMOSTRA, { cargo: 'Gestão Escolar' }))).toEqual(['g1', 'g2']);
  });

  it('a competência atravessa os cargos e ignora caixa e espaço do nome', () => {
    const chave = opcoesDeCompetencia(AMOSTRA).find((o) => o.rotulo === AUTOCUIDADO)!.valor;
    expect(ids(filtrarCenarios(AMOSTRA, { competencia: chave }))).toEqual(['c2', 'c3', 'g1']);
  });

  it('cargo e competência se combinam', () => {
    const chave = opcoesDeCompetencia(AMOSTRA).find((o) => o.rotulo === AUTOCUIDADO)!.valor;
    expect(ids(filtrarCenarios(AMOSTRA, { cargo: 'Coordenação Pedagógica', competencia: chave }))).toEqual(['c2', 'c3']);
  });

  it('cenário sem nome de competência só aparece pelo filtro próprio', () => {
    expect(ids(filtrarCenarios(AMOSTRA, { competencia: SEM_COMPETENCIA }))).toEqual(['e1']);
    const chave = opcoesDeCompetencia(AMOSTRA).find((o) => o.rotulo === AUTOCUIDADO)!.valor;
    expect(ids(filtrarCenarios(AMOSTRA, { competencia: chave }))).not.toContain('e1');
  });

  it('temFiltroCenarios só é verdadeiro quando algo foi escolhido', () => {
    expect(temFiltroCenarios({})).toBe(false);
    expect(temFiltroCenarios({ cargo: '', competencia: '' })).toBe(false);
    expect(temFiltroCenarios({ cargo: 'Gestão Escolar' })).toBe(true);
    expect(temFiltroCenarios({ competencia: SEM_COMPETENCIA })).toBe(true);
  });
});

describe('filtro de cenários da Fase 1: números e filas de lote saem do recorte', () => {
  // A conta que a tela faz por grupo de cargo (page.tsx, aba Cenários).
  const fila = (cens: typeof AMOSTRA) => cens.filter((c) => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas');

  it('"Revisar todos" não alcança cenário que o filtro tirou da tela', () => {
    const chave = opcoesDeCompetencia(AMOSTRA).find((o) => o.rotulo === AUTOCUIDADO)!.valor;
    const grupos = agruparPorCargo(filtrarCenarios(AMOSTRA, { competencia: chave }));
    // Coordenação tem 2 a revisar/com ressalvas (c1, c2) no cargo inteiro: c1 é de
    // OUTRA competência e o botão chamaria IA nele sem ele estar na tela.
    expect(ids(fila(AMOSTRA.filter((c) => c.cargo === 'Coordenação Pedagógica')))).toEqual(['c1', 'c2']);
    expect(ids(fila(grupos['Coordenação Pedagógica']))).toEqual(['c2']);
    expect(grupos['Coordenação Pedagógica']).toHaveLength(2);
  });

  it('um cargo sem cenário no recorte some, não vira grupo vazio', () => {
    const grupos = agruparPorCargo(filtrarCenarios(AMOSTRA, { cargo: 'Gestão Escolar' }));
    expect(Object.keys(grupos)).toEqual(['Gestão Escolar']);
  });

  it('o total geral continua disponível para o "de N" ao lado', () => {
    const visiveis = filtrarCenarios(AMOSTRA, { cargo: 'Gestão Escolar' });
    expect(visiveis).toHaveLength(2);
    expect(AMOSTRA).toHaveLength(6);
  });

  it('agruparPorCargo mantém a ordem de chegada de cada grupo', () => {
    const grupos = agruparPorCargo(AMOSTRA);
    expect(ids(grupos['Coordenação Pedagógica'])).toEqual(['c1', 'c2', 'c3']);
    expect(Object.keys(grupos)).toEqual(['Coordenação Pedagógica', 'Gestão Escolar', 'Gestão Educacional']);
  });

  it('a seleção para regerar perde o que o filtro escondeu', () => {
    const selecao = new Set(['c1', 'c2', 'g1']);
    const visiveis = filtrarCenarios(AMOSTRA, { cargo: 'Coordenação Pedagógica' });
    expect([...podarSelecao(selecao, visiveis)].sort()).toEqual(['c1', 'c2']);
    // Sem filtro nada é podado.
    expect([...podarSelecao(selecao, filtrarCenarios(AMOSTRA, {}))].sort()).toEqual(['c1', 'c2', 'g1']);
  });
});

describe('filtro de cenários da Fase 1: opções dos selects', () => {
  it('cargos em ordem alfabética, sem repetir', () => {
    expect(opcoesDeCargo(AMOSTRA).map((o) => o.valor)).toEqual(['Coordenação Pedagógica', 'Gestão Educacional', 'Gestão Escolar']);
  });

  it('competências do cargo escolhido, sem repetir, e "Sem competência" por último', () => {
    const todas = opcoesDeCompetencia(AMOSTRA);
    // Autocuidado aparece UMA vez, apesar de vir de 2 cargos e de 2 grafias.
    expect(todas.filter((o) => o.rotulo.toLowerCase().trim() === AUTOCUIDADO.toLowerCase())).toHaveLength(1);
    expect(todas[todas.length - 1].valor).toBe(SEM_COMPETENCIA);

    const doCargo = opcoesDeCompetencia(AMOSTRA, 'Gestão Escolar');
    expect(doCargo.map((o) => o.rotulo)).toEqual(['autocuidado e resiliência emocional', 'Planejamento e Organização']);
    expect(doCargo.some((o) => o.valor === SEM_COMPETENCIA)).toBe(false);
  });

  it('trocar o cargo mantém a competência só se ela existir no cargo novo', () => {
    const autocuidado = opcoesDeCompetencia(AMOSTRA, 'Coordenação Pedagógica').find((o) => o.rotulo === AUTOCUIDADO)!.valor;
    const planejamento = opcoesDeCompetencia(AMOSTRA, 'Gestão Escolar').find((o) => o.rotulo === 'Planejamento e Organização')!.valor;
    expect(ajustarCompetencia(AMOSTRA, 'Gestão Escolar', autocuidado)).toBe(autocuidado);
    expect(ajustarCompetencia(AMOSTRA, 'Coordenação Pedagógica', planejamento)).toBe('');
    expect(ajustarCompetencia(AMOSTRA, 'Gestão Escolar', '')).toBe('');
    expect(ajustarCompetencia(AMOSTRA, '', planejamento)).toBe(planejamento);
  });
});

describe('aba Cenários da Fase 1: a tela agrupa o RECORTE', () => {
  const tela = readFileSync(join(__dirname, '../../app/admin/empresas/[empresaId]/fase1/page.tsx'), 'utf8');

  it('os grupos nascem do conjunto filtrado, não da lista inteira', () => {
    expect(tela).toMatch(/const cenariosVisiveis = filtrarCenarios\(cenarios, filtrosCen\);/);
    expect(tela).toMatch(/const cenariosPorCargo = agruparPorCargo\(cenariosVisiveis\);/);
    // O agrupamento manual de antes (a lista inteira) não pode voltar.
    expect(tela).not.toMatch(/cenariosPorCargo\[c\.cargo\]/);
  });

  it('os dois handlers que mudam o filtro podam a seleção do lote', () => {
    expect(tela.match(/podarSelecao\(prev, filtrarCenarios\(cenarios, /g) || []).toHaveLength(2);
  });

  it('lista vazia por filtro tem mensagem própria e o botão de limpar', () => {
    expect(tela).toMatch(/cenariosVisiveis\.length === 0/);
    expect(tela).toMatch(/tr\('filters\.noMatch'\)/);
  });
});
