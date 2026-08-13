import { describe, it, expect } from 'vitest';
import { resolverConfigEfetiva, resolverModoDaTurma } from '@/lib/turmas/config-efetiva';
import { CHAVES_DE_TURMA, CHAVES_DE_EMPRESA, SPEC_CONFIG } from '@/lib/turmas/chaves';

describe('resolverConfigEfetiva', () => {
  it('🔴 a turma DESLIGA o que a empresa ligou (o caso que `||` quebraria)', () => {
    // É metade do caso de uso: os diretores fecharam o assessment, os
    // professores ainda não abrem. Um merge com `||` perderia o `false` e a
    // turma nova herdaria a liberação da antiga.
    const { config, procedencia } = resolverConfigEfetiva({
      empresa: { mapeamento_cenarios_liberado: true },
      turma: { mapeamento_cenarios_liberado: false },
    });
    expect(config.mapeamento_cenarios_liberado).toBe(false);
    expect(procedencia.mapeamento_cenarios_liberado).toBe('turma');
  });

  it('a turma LIGA o que a empresa não definiu', () => {
    const { config } = resolverConfigEfetiva({
      empresa: {},
      turma: { perfil_comportamental_liberado: true },
    });
    expect(config.perfil_comportamental_liberado).toBe(true);
  });

  it('sem turma, a config da empresa passa intacta (compatibilidade)', () => {
    const empresa = {
      mapeamento_cenarios_liberado: true,
      votacao_ativa: false,
      ai: { modelo_padrao: 'claude-sonnet-4-6' },
      origem: 'gas-legado-macae',
    };
    const { config } = resolverConfigEfetiva({ empresa });
    expect(config).toEqual(empresa);
  });

  it('array SUBSTITUI, nunca concatena', () => {
    const { config } = resolverConfigEfetiva({
      empresa: { competencias_regular_duo: ['Trabalho em Equipe', 'Postura Profissional'] },
      turma: { competencias_regular_duo: ['Gestão Escolar'] },
    });
    expect(config.competencias_regular_duo).toEqual(['Gestão Escolar']);
  });

  it('cadencia mescla CHAVE A CHAVE (a turma muda o dia e herda o resto)', () => {
    const { config } = resolverConfigEfetiva({
      empresa: { cadencia: { fase4_dia_pilula: 1, fase4_dia_pilula2: 2, fase4_dia_evidencia: 4 } },
      turma: { cadencia: { fase4_dia_pilula: 3 } },
    });
    expect(config.cadencia).toEqual({ fase4_dia_pilula: 3, fase4_dia_pilula2: 2, fase4_dia_evidencia: 4 });
  });

  it('a participação vence a turma', () => {
    const { config, procedencia } = resolverConfigEfetiva({
      empresa: { programa_modo: 'regular_duo' },
      turma: { programa_modo: 'jornada' },
      participacao: { programa_modo: 'piloto' },
    });
    expect(config.programa_modo).toBe('piloto');
    expect(procedencia.programa_modo).toBe('participacao');
  });

  it('chave institucional na turma é IGNORADA e reportada', () => {
    const { config, ignoradas } = resolverConfigEfetiva({
      empresa: { ai: { modelo_padrao: 'claude-sonnet-4-6' }, votacao_ativa: false },
      turma: { ai: { modelo_padrao: 'gpt-5.6-terra' }, votacao_ativa: true },
    });
    expect(config.ai).toEqual({ modelo_padrao: 'claude-sonnet-4-6' });
    expect(config.votacao_ativa).toBe(false);
    expect(ignoradas.map((i) => i.chave).sort()).toEqual(['ai', 'votacao_ativa']);
  });

  it('chave sem spec na turma não entra em silêncio — é reportada', () => {
    const { config, ignoradas } = resolverConfigEfetiva({
      empresa: {},
      turma: { chave_inventada: true },
    });
    expect(config.chave_inventada).toBeUndefined();
    expect(ignoradas[0]).toMatchObject({ chave: 'chave_inventada', nivel: 'turma' });
  });

  it('a turma vence o override legado do colaborador', () => {
    const { config, procedencia } = resolverConfigEfetiva({
      empresa: {}, turma: { programa_modo: 'jornada' },
      colaboradorLegado: { programa_modo: 'piloto' },
    });
    expect(config.programa_modo).toBe('jornada');
    expect(procedencia.programa_modo).toBe('turma');
  });

  it('🔴 o override legado do colaborador VENCE a empresa (regressão do acme)', () => {
    // Medido em 13/08: `acme` tem programa_modo 'regular' na empresa e 1
    // colaborador marcado 'piloto'. A precedência de hoje é
    // `colab.programa_modo || empresa.…` — aplicar o legado por último jogaria
    // essa pessoa em regular_duo, calado, num tenant vivo.
    const { config, procedencia } = resolverConfigEfetiva({
      empresa: { programa_modo: 'regular' },
      colaboradorLegado: { programa_modo: 'piloto' },
    });
    expect(config.programa_modo).toBe('piloto');
    expect(procedencia.programa_modo).toBe('colaborador_legado');
  });

  it('a participação vence o legado (é o mecanismo que veio substituí-lo)', () => {
    const { config } = resolverConfigEfetiva({
      empresa: { programa_modo: 'regular' },
      participacao: { programa_modo: 'onboarding' },
      colaboradorLegado: { programa_modo: 'piloto' },
    });
    expect(config.programa_modo).toBe('onboarding');
  });

  it('valor `false` da empresa não é apagado por undefined da turma', () => {
    const { config } = resolverConfigEfetiva({
      empresa: { perfil_comportamental_liberado: false },
      turma: { perfil_comportamental_liberado: undefined },
    });
    expect(config.perfil_comportamental_liberado).toBe(false);
  });

  it('resolverModoDaTurma normaliza o rótulo como resolverModoColab', () => {
    expect(resolverModoDaTurma({ empresa: {}, turma: { programa_modo: 'jornada' } })).toBe('jornada');
    expect(resolverModoDaTurma({ empresa: { programa_modo: 'regular' } })).toBe('regular_duo');
    expect(resolverModoDaTurma({ empresa: {} })).toBe('regular_duo');
    expect(resolverModoDaTurma({ empresa: { programa_modo: 'xpto' } })).toBe('regular_duo');
  });
});

describe('spec de chaves', () => {
  it('votacao_ativa é de EMPRESA — o resultado grava por cargo, empresa-wide', () => {
    expect(SPEC_CONFIG.votacao_ativa.escopo).toBe('empresa');
    expect(CHAVES_DE_TURMA).not.toContain('votacao_ativa');
  });

  it('os dois gates de etapa são de TURMA (é o problema que as turmas resolvem)', () => {
    expect(CHAVES_DE_TURMA).toContain('perfil_comportamental_liberado');
    expect(CHAVES_DE_TURMA).toContain('mapeamento_cenarios_liberado');
  });

  it('nenhuma chave está nos dois níveis', () => {
    const dupes = CHAVES_DE_TURMA.filter((c) => CHAVES_DE_EMPRESA.includes(c));
    expect(dupes).toEqual([]);
  });
});
