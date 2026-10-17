import { describe, it, expect } from 'vitest';
import { mesclarBlueprintCorrigido, adotavel } from '@/lib/blueprint/correcao';

/**
 * Correção guiada do blueprint (decisão do dono, 16/10/2026): a trilha e o Kit da semana 1 (com vídeo) dependem dos
 * DESCRITORES de cada semana, então a correção não pode mexer neles, nem nas competências, níveis, ids e calendário.
 * E o auditor de uma rodada troca de veredito no mesmo blueprint: só se adota o que passa nas duas.
 */
const original = () => ({
  spec_version: 1,
  colaborador: { nome: 'Ana', cargo: 'CAIXA' },
  competencias: [{
    nome: 'Rotina', nivel_atual: 'N1', prioridade: 'alta', leitura: 'leitura antiga',
    descritores_foco: [{ id: 'd1', nome: 'Pontualidade', gap_observado: 'antigo' }],
    objetivos_30_dias: [
      { id: 'obj-1', objetivo: 'Vou cumprir o horário em todos os turnos', criterio_de_sucesso: 'todos' },
      { id: 'obj-2', objetivo: 'Vou registrar todas as ordens', criterio_de_sucesso: 'todas' },
    ],
  }],
  trilha: {
    duracao_semanas: 7,
    semanas: [
      { semana: 1, tipo: 'conteudo', competencia_foco: ['Rotina'], descritores_foco: ['Pontualidade', 'Organização'], objetivo_da_semana: 'velho', conexao_com_pdi: ['obj-1'], evidencia_esperada: 'alguns registros', criterio_de_sucesso: 'x' },
      { semana: 7, tipo: 'avaliacao', competencia_foco: ['Rotina'], descritores_foco: ['Pontualidade'], objetivo_da_semana: 'aval', conexao_com_pdi: ['obj-1', 'obj-2'], evidencia_esperada: 'ao menos 2', criterio_de_sucesso: 'y' },
    ],
  },
});

describe('mesclarBlueprintCorrigido: estrutura travada, texto corrigido', () => {
  it('os descritores de cada semana, a competência, o tipo e o número da semana não mudam', () => {
    const c: any = original();
    c.trilha.semanas[0].descritores_foco = ['Outro', 'Mais um'];
    c.trilha.semanas[0].competencia_foco = ['Simplicidade'];
    c.trilha.semanas[0].tipo = 'missao';
    c.trilha.semanas[1].semana = 6;
    const m = mesclarBlueprintCorrigido(original(), c);
    expect(m.trilha.semanas.map((s: any) => [s.semana, s.tipo, s.competencia_foco, s.descritores_foco])).toEqual([
      [1, 'conteudo', ['Rotina'], ['Pontualidade', 'Organização']],
      [7, 'avaliacao', ['Rotina'], ['Pontualidade']],
    ]);
  });

  it('competência, nível, prioridade e ids dos objetivos não mudam; o texto dos objetivos e das semanas muda', () => {
    const c: any = original();
    c.competencias[0].nome = 'Outra'; c.competencias[0].nivel_atual = 'N3'; c.competencias[0].prioridade = 'baixa';
    c.competencias[0].objetivos_30_dias[0].id = 'obj-9';
    c.competencias[0].objetivos_30_dias[0].objetivo = 'Vou iniciar ao menos 8 turnos no horário';
    c.competencias[0].objetivos_30_dias[0].criterio_de_sucesso = 'ao menos 8';
    c.trilha.semanas[1].evidencia_esperada = 'ao menos 8 registros de início de turno';
    c.competencias[0].descritores_foco[0].nome = 'Renomeado';
    c.competencias[0].descritores_foco[0].gap_observado = 'novo';
    const m = mesclarBlueprintCorrigido(original(), c);
    expect([m.competencias[0].nome, m.competencias[0].nivel_atual, m.competencias[0].prioridade]).toEqual(['Rotina', 'N1', 'alta']);
    expect(m.competencias[0].objetivos_30_dias.map((o: any) => o.id)).toEqual(['obj-1', 'obj-2']);
    expect(m.competencias[0].objetivos_30_dias[0].objetivo).toBe('Vou iniciar ao menos 8 turnos no horário');
    expect(m.competencias[0].objetivos_30_dias[0].criterio_de_sucesso).toBe('ao menos 8');
    expect(m.trilha.semanas[1].evidencia_esperada).toBe('ao menos 8 registros de início de turno');
    expect(m.competencias[0].descritores_foco[0]).toEqual({ id: 'd1', nome: 'Pontualidade', gap_observado: 'novo' });
  });

  it('conexao_com_pdi só aceita ids que existem e nunca fica vazia', () => {
    const c: any = original();
    c.trilha.semanas[0].conexao_com_pdi = ['obj-1', 'obj-2', 'obj-inventado'];
    c.trilha.semanas[1].conexao_com_pdi = ['obj-inventado'];
    const m = mesclarBlueprintCorrigido(original(), c);
    expect(m.trilha.semanas[0].conexao_com_pdi).toEqual(['obj-1', 'obj-2']);
    expect(m.trilha.semanas[1].conexao_com_pdi).toEqual(['obj-1', 'obj-2']);
  });

  it('objetivo ou semana a mais ou a menos na correção: fica a lista original', () => {
    const c: any = original();
    c.competencias[0].objetivos_30_dias.push({ id: 'obj-3', objetivo: 'novo' });
    c.trilha.semanas.pop();
    const m = mesclarBlueprintCorrigido(original(), c);
    expect(m.competencias[0].objetivos_30_dias).toHaveLength(2);
    expect(m.trilha.semanas).toHaveLength(2);
    expect(m.trilha.duracao_semanas).toBe(7);
  });
});

describe('adotavel (régua do PDI: o relatório combinado das duas rodadas)', () => {
  it('só sem reprovação e com a auditoria completa', () => {
    expect(adotavel({ ok: true, parcial: false })).toBe(true);
    expect(adotavel({ ok: false, parcial: false })).toBe(false);
    expect(adotavel({ ok: true, parcial: true })).toBe(false);
    expect(adotavel(null)).toBe(false);
  });
});
