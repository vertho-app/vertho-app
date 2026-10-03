import { describe, it, expect, vi } from 'vitest';
import {
  parseProgramaCustom,
  derivarConfigCustom,
  deveEncerrarSemFechamento,
  ehConfigSemFechamento,
  montarReportSemFechamento,
  parseConfigSnapshot,
  parseSequenciaPersonalizado,
  configDaProximaCompetencia,
  CUSTOM_LIMITES,
  REPORT_MODO_SEM_FECHAMENTO,
} from '@/lib/season-engine/programa-custom';
import {
  resolverModoColab,
  getProgramaConfigDaTrilha,
  PROGRAMA_JORNADA,
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
  PROGRAMA_ONBOARDING,
  PROGRAMA_PILOTO,
} from '@/lib/season-engine/programa-config';
import { resolverConfigDaTrilha, totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { sanitizarNarrativaPiloto } from '@/lib/season-engine/piloto-trava';
import { relatorioMedeEvolucao } from '@/lib/season-engine/convergencia';
import { isTrilhaPiloto } from '@/lib/season-engine/participacao';
import { reguaTemporalDoPrograma } from '@/lib/season-engine/fechamento-scorer';

/**
 * Personalizado (decisão do dono, 03/10/2026): uma Jornada de duração
 * ajustável. 1 a 6 semanas de conteúdo POR COMPETÊNCIA, 1 ou 2 competências
 * EM SEQUÊNCIA, fechamento opcional, regras de programa completo (sem trava de
 * piso, relatório com nível e avanço, certificado proporcional).
 *
 * Validado por mutação (ver o relatório da onda 2): `modo: 'piloto'` de volta
 * em `derivarConfigCustom` derruba "programa completo"; `semanasMax: 4` derruba
 * os limites; `posicao + 1` trocado por `posicao` derruba o encadeamento.
 */

// Mock chainável mínimo do supabase: rotas por tabela → resultado de maybeSingle.
function sbMock(porTabela: Record<string, any>) {
  const from = vi.fn((tabela: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: porTabela[tabela] ?? null }),
    };
    return chain;
  });
  return { from };
}

describe('parseProgramaCustom: limites novos (1 a 6 semanas, 1 ou 2 competências)', () => {
  it('os limites são os decididos pelo dono', () => {
    expect(CUSTOM_LIMITES).toEqual({ semanasMin: 1, semanasMax: 6, compsMin: 1, compsMax: 2 });
  });

  it('aceita as pontas e normaliza fechamento pra boolean', () => {
    expect(parseProgramaCustom({ semanas: 1, numCompetencias: 1, fechamento: 0 }))
      .toEqual({ semanas: 1, numCompetencias: 1, fechamento: false });
    expect(parseProgramaCustom({ semanas: 6, numCompetencias: 2, fechamento: true }))
      .toEqual({ semanas: 6, numCompetencias: 2, fechamento: true });
    expect(parseProgramaCustom({ semanas: 5, numCompetencias: 1, fechamento: true })).not.toBeNull();
  });

  it('a config gravada em produção (unianchieta) continua válida, no MESMO formato', () => {
    expect(parseProgramaCustom({ semanas: 1, fechamento: false, numCompetencias: 1 }))
      .toEqual({ semanas: 1, numCompetencias: 1, fechamento: false });
  });

  it('aceita até 10 semanas de conteúdo', () => {
    expect(parseProgramaCustom({ semanas: 10, numCompetencias: 2, fechamento: true }))
      .toEqual({ semanas: 10, numCompetencias: 2, fechamento: true });
  });

  it('rejeita fora dos limites e lixo', () => {
    expect(parseProgramaCustom({ semanas: 0, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 7, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 2, numCompetencias: 3, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 2, numCompetencias: 0, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 2.5, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom(null)).toBeNull();
    expect(parseProgramaCustom('piloto')).toBeNull();
    expect(parseProgramaCustom({})).toBeNull();
  });
});

describe('derivarConfigCustom: uma Jornada com a duração escolhida', () => {
  it('🔴 programa COMPLETO: modo regular, nunca piloto (sem trava de piso, sem spec piloto-v1)', () => {
    for (const fechamento of [true, false]) {
      for (let semanas = 1; semanas <= 6; semanas++) {
        const c = derivarConfigCustom({ semanas, numCompetencias: 2, fechamento });
        expect(c.modo).toBe('regular');
        // É o modo da config que liga a trava de piso e a narrativa de
        // degustação no scorer (`reguaTemporalDoPrograma`).
        expect(reguaTemporalDoPrograma(c).isPiloto).toBe(false);
        expect(reguaTemporalDoPrograma(c).notaPrograma).toBe('');
      }
    }
  });

  it('6 semanas COM fechamento = exatamente a Jornada de 7 semanas', () => {
    expect(derivarConfigCustom({ semanas: 6, numCompetencias: 1, fechamento: true })).toEqual({ ...PROGRAMA_JORNADA });
  });

  it('COM fechamento: semana própria no calendário (sem espelho), acumulada na última de conteúdo', () => {
    const c = derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: true });
    expect(c.semanas).toBe(4);
    expect(c.slotsConteudo).toEqual([1, 2, 3]);
    expect(c.semanasAvaliacao).toEqual([4]);
    expect(c.semanaCenarioB).toBe(4);
    expect(c.semanaAcumulada).toBe(3);
    expect(c.semanaEspelhoCalendario).toBeUndefined();
    expect(c.semanasMissao).toEqual([]);
    expect(c.conteudosPorSemana).toBe(2);
    expect(c.desafioUnicoPorCompetencia).toBe(true);
    expect(c.arguicao).toEqual({ ativa: true, maxTurnos: 6 });
    expect(ehConfigSemFechamento(c)).toBe(false);
  });

  it('SEM fechamento: sem slot de avaliação, acumulada inalcançável, arguição off', () => {
    const c = derivarConfigCustom({ semanas: 1, numCompetencias: 1, fechamento: false });
    expect(c.semanas).toBe(1);
    expect(c.slotsConteudo).toEqual([1]);
    expect(c.semanasAvaliacao).toEqual([]);
    expect(c.semanaAcumulada).toBe(0);
    expect(c.semanaCenarioB).toBe(0);
    expect(c.arguicao?.ativa).toBe(false);
    expect(ehConfigSemFechamento(c)).toBe(true);
  });

  it('cada trilha é UMA competência: a 2ª do programa é outra trilha, encadeada', () => {
    const c = derivarConfigCustom({ semanas: 4, numCompetencias: 2, fechamento: true });
    expect(c.numCompetencias).toBe(1);
    expect(c.sequenciaPersonalizado).toBeUndefined(); // a sequência é decidida na geração
  });

  it('sem checkpoint do gestor, como a Jornada (desenho do produto, 04/09)', () => {
    expect(derivarConfigCustom({ semanas: 6, numCompetencias: 1, fechamento: false }).semanasCheckpoint).toEqual([]);
  });

  it('input inválido explode explícito (nunca degrada calado)', () => {
    expect(() => derivarConfigCustom({ semanas: 11, numCompetencias: 1, fechamento: false })).toThrow(/programa_custom inválido/);
  });
});

describe('sequência de 2 competências (snapshot) e a próxima competência', () => {
  const base = derivarConfigCustom({ semanas: 2, numCompetencias: 2, fechamento: true });
  const primeira = { ...base, sequenciaPersonalizado: { competencias: ['Liderança', 'Comunicação'], posicao: 1 } };

  it('da 1ª trilha sai a config da 2ª: mesmas regras, posição seguinte', () => {
    const segunda = configDaProximaCompetencia(primeira);
    expect(segunda?.sequenciaPersonalizado).toEqual({ competencias: ['Liderança', 'Comunicação'], posicao: 2 });
    expect({ ...segunda, sequenciaPersonalizado: undefined }).toEqual({ ...base, sequenciaPersonalizado: undefined });
  });

  it('da 2ª trilha não sai nada: o programa acabou', () => {
    expect(configDaProximaCompetencia(configDaProximaCompetencia(primeira)!)).toBeNull();
  });

  it('programa de 1 competência (sem sequência) não encadeia', () => {
    expect(configDaProximaCompetencia(base)).toBeNull();
  });

  it('a sequência faz roundtrip pelo JSONB do snapshot', () => {
    expect(parseConfigSnapshot(JSON.parse(JSON.stringify(primeira)))).toEqual(primeira);
  });

  it('sequência malformada é recusada (JSONB é dado, não código)', () => {
    expect(parseSequenciaPersonalizado({ competencias: ['A', 'B'], posicao: 3 })).toBeNull();
    expect(parseSequenciaPersonalizado({ competencias: ['A', 'a '], posicao: 1 })).toBeNull();
    expect(parseSequenciaPersonalizado({ competencias: ['A', 'B', 'C'], posicao: 1 })).toBeNull();
    expect(parseSequenciaPersonalizado({ competencias: ['A', ''], posicao: 1 })).toBeNull();
    expect(parseSequenciaPersonalizado({ competencias: [], posicao: 1 })).toBeNull();
    expect(parseSequenciaPersonalizado(null)).toBeNull();
  });
});

describe('deveEncerrarSemFechamento: só o Personalizado sem fechamento entra', () => {
  const semFech = derivarConfigCustom({ semanas: 2, numCompetencias: 1, fechamento: false });

  it('dispara na última semana de conteúdo do Personalizado sem fechamento', () => {
    expect(deveEncerrarSemFechamento(semFech, 2)).toBe(true);
    expect(deveEncerrarSemFechamento(semFech, 1)).toBe(false);
  });

  it('NUNCA dispara pros presets (todos têm semanasAvaliacao não-vazia)', () => {
    for (const preset of [PROGRAMA_REGULAR, PROGRAMA_REGULAR_DUO, PROGRAMA_ONBOARDING, PROGRAMA_PILOTO, PROGRAMA_JORNADA]) {
      for (let s = 1; s <= preset.semanas; s++) {
        expect(deveEncerrarSemFechamento(preset, s)).toBe(false);
      }
    }
  });

  it('nem pro Personalizado COM fechamento', () => {
    const comFech = derivarConfigCustom({ semanas: 2, numCompetencias: 1, fechamento: true });
    for (let s = 1; s <= comFech.semanas; s++) {
      expect(deveEncerrarSemFechamento(comFech, s)).toBe(false);
    }
  });
});

describe('montarReportSemFechamento: programa completo, sem medição de chegada', () => {
  const r = montarReportSemFechamento({
    competencia_foco: 'Fluência Digital',
    descritores_selecionados: [
      { descritor: 'D1', nota_atual: 1.5, competencia: 'Fluência Digital' },
      { descritor: 'D2', nota_atual: 2.0 },
    ],
  });

  it('🔴 NÃO é relatório de piloto: o certificado não o recusa', () => {
    expect(r.modo).toBe(REPORT_MODO_SEM_FECHAMENTO);
    expect(r.modo).not.toBe('piloto');
    expect(isTrilhaPiloto({ programa_modo: 'custom', evolution_report: r })).toBe(false);
  });

  it('o ponto de partida é o diagnóstico; nota de chegada não existe e não é inventada', () => {
    expect(r.sem_fechamento).toBe(true);
    expect(r.descritores).toEqual([
      { competencia: 'Fluência Digital', descritor: 'D1', baseline: 1.5 },
      { competencia: 'Fluência Digital', descritor: 'D2', baseline: 2.0 },
    ]);
    expect(r.descritores.every((d: any) => !('nota_pos' in d))).toBe(true);
    expect(r.nota_media_pos).toBeNull();
  });

  it('fica FORA de quem agrega evolução, pela mesma régua do piloto', () => {
    expect(relatorioMedeEvolucao(r)).toBe(false);
    expect(relatorioMedeEvolucao({ modo: 'piloto' })).toBe(false);
    expect(relatorioMedeEvolucao({ descritores: [{ nota_pre: 1, nota_pos: 2 }] })).toBe(true);
    expect(relatorioMedeEvolucao(null)).toBe(false);
  });

  it('trilha sem descritores → report vazio mas válido', () => {
    expect(montarReportSemFechamento({ competencia_foco: 'X', descritores_selecionados: null }).descritores).toEqual([]);
  });
});

describe('resolverModoColab: label custom', () => {
  it('resolve override e default da empresa', () => {
    expect(resolverModoColab({ programa_modo: 'custom' }, null)).toBe('custom');
    expect(resolverModoColab(null, { programa_modo: 'custom' })).toBe('custom');
    expect(resolverModoColab({ programa_modo: 'piloto' }, { programa_modo: 'custom' })).toBe('piloto');
  });
});

describe('getProgramaConfigDaTrilha (síncrona): o snapshot do Personalizado quando veio no select', () => {
  it('custom COM snapshot: a duração escolhida, não a de um preset', () => {
    const snap = derivarConfigCustom({ semanas: 2, numCompetencias: 1, fechamento: false });
    const cfg = getProgramaConfigDaTrilha({ programa_modo: 'custom', programa_config: JSON.parse(JSON.stringify(snap)) });
    expect(cfg.semanas).toBe(2);
    expect(cfg.semanasCheckpoint).toEqual([]);
  });

  it('snapshot de OUTRO modo não é lido aqui (Ibipeba regular_duo segue pelo carimbo)', () => {
    const snap = { ...PROGRAMA_REGULAR_DUO, semanas: 9 };
    expect(getProgramaConfigDaTrilha({ programa_modo: 'regular_duo', programa_config: snap })).toBe(PROGRAMA_REGULAR_DUO);
  });
});

describe('resolverConfigDaTrilha: precedência do snapshot (mig 182)', () => {
  const snapshot = derivarConfigCustom({ semanas: 1, numCompetencias: 1, fechamento: false });

  it('trilha COM snapshot no select: usa direto, zero queries', async () => {
    const sb = sbMock({});
    const cfg = await resolverConfigDaTrilha(sb, {
      programa_modo: 'custom', empresa_id: 'e1', programa_config: JSON.parse(JSON.stringify(snapshot)),
    });
    expect(cfg.semanas).toBe(1);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('custom SEM snapshot no select: busca pelo id da trilha', async () => {
    const sb = sbMock({ trilhas: { programa_config: JSON.parse(JSON.stringify(snapshot)) } });
    const cfg = await resolverConfigDaTrilha(sb, { id: 't1', programa_modo: 'custom', empresa_id: 'e1' });
    expect(cfg.semanasAvaliacao).toEqual([]);
    expect(sb.from).toHaveBeenCalledWith('trilhas');
  });

  it('custom sem snapshot em lugar nenhum: re-deriva do sys_config (nunca um preset calado)', async () => {
    const sb = sbMock({
      trilhas: { programa_config: null },
      empresas: { sys_config: { programa_custom: { semanas: 2, numCompetencias: 1, fechamento: true } } },
    });
    const cfg = await resolverConfigDaTrilha(sb, { id: 't1', programa_modo: 'custom', empresa_id: 'e1' });
    expect(cfg.semanas).toBe(3);
    expect(cfg.semanasAvaliacao).toEqual([3]);
  });

  it('custom órfão (sem snapshot, sem sys_config) → erro explícito', async () => {
    const sb = sbMock({ trilhas: null, empresas: { sys_config: {} } });
    await expect(resolverConfigDaTrilha(sb, { id: 't1', programa_modo: 'custom', empresa_id: 'e1' }))
      .rejects.toThrow(/sem snapshot/);
  });

  it('REGRESSÃO: presets seguem resolvendo pela constante, sem query extra', async () => {
    const sb = sbMock({});
    const cfg = await resolverConfigDaTrilha(sb, { programa_modo: 'piloto', empresa_id: 'e1' });
    expect(cfg).toBe(PROGRAMA_PILOTO);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('trilha SEM carimbo numa empresa sem modo: segue no DUO legado (o padrão novo não a alcança)', async () => {
    const sb = sbMock({ empresas: { sys_config: {} } });
    expect(await resolverConfigDaTrilha(sb, { programa_modo: null, empresa_id: 'e1' })).toBe(PROGRAMA_REGULAR_DUO);
  });
});

describe('totalSemanasDoPlano: fim REAL do plano pro cron', () => {
  it('regular de 14 entradas → 14 (byte-igual ao TOTAL_SEMANAS)', () => {
    const plano = Array.from({ length: 14 }, (_, i) => ({ semana: i + 1, tipo: i >= 12 ? 'avaliacao' : 'conteudo' }));
    expect(totalSemanasDoPlano(plano, 14)).toBe(14);
  });

  it('piloto: fechamento espelhado conta pela semana que o governa → 2', () => {
    const plano = [
      { semana: 1, tipo: 'conteudo' },
      { semana: 2, tipo: 'conteudo' },
      { semana: 3, tipo: 'avaliacao', calendario_semana: 2 },
    ];
    expect(totalSemanasDoPlano(plano, 14)).toBe(2);
  });

  it('Personalizado de 1 semana sem fechamento → 1', () => {
    expect(totalSemanasDoPlano([{ semana: 1, tipo: 'conteudo' }], 14)).toBe(1);
  });

  it('Personalizado com fechamento: o fechamento é uma semana do calendário → N+1', () => {
    const plano = [{ semana: 1, tipo: 'conteudo' }, { semana: 2, tipo: 'conteudo' }, { semana: 3, tipo: 'avaliacao' }];
    expect(totalSemanasDoPlano(plano, 14)).toBe(3);
  });

  it('plano ausente/vazio → fallback (colab legado)', () => {
    expect(totalSemanasDoPlano(null, 14)).toBe(14);
    expect(totalSemanasDoPlano([], 14)).toBe(14);
  });
});

describe('sanitizarNarrativaPiloto parametrizado (piloto e trilhas antigas de degustação)', () => {
  it('n=3: "3 semanas" é a duração certa e passa; "2 semanas" vira erro corrigível', () => {
    const { parsed, ok } = sanitizarNarrativaPiloto({
      resumo_avaliacao: { mensagem_geral: 'Ao longo de 3 semanas você avançou; ao final de 2 semanas nada disso valeria.' },
    }, 3);
    expect(ok).toBe(true);
    expect(parsed.resumo_avaliacao.mensagem_geral).toContain('Ao longo de 3 semanas');
    expect(parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 3 semanas');
  });

  it('n=1: régua do regular vazando é corrigida pro singular', () => {
    const { parsed, ok } = sanitizarNarrativaPiloto({
      resumo_avaliacao: { mensagem_geral: 'Rodrigo, ao final de 14 semanas, sua força está clara.' },
    }, 1);
    expect(ok).toBe(true);
    expect(parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 1 semana');
  });

  it('REGRESSÃO default n=2: comportamento do piloto intocado', () => {
    const { parsed, ok } = sanitizarNarrativaPiloto({
      resumo_avaliacao: { mensagem_geral: 'ao final de 14 semanas.' },
      avaliacao_por_descritor: [{ descritor: 'D1', justificativa: 'sustentado na degustação de 2 semanas.' }],
    });
    expect(ok).toBe(true);
    expect(parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 2 semanas');
    expect(parsed.avaliacao_por_descritor[0].justificativa).toBe('sustentado na degustação de 2 semanas.');
  });
});
