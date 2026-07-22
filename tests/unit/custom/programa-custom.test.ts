import { describe, it, expect, vi } from 'vitest';
import {
  parseProgramaCustom,
  derivarConfigCustom,
  deveEncerrarSemFechamento,
  ehConfigSemFechamento,
  montarReportDegustacao,
  parseConfigSnapshot,
  DEGUSTACAO_SPEC_VERSION,
} from '@/lib/season-engine/programa-custom';
import {
  resolverModoColab,
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
  PROGRAMA_ONBOARDING,
  PROGRAMA_PILOTO,
} from '@/lib/season-engine/programa-config';
import { resolverConfigDaTrilha, totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { sanitizarNarrativaPiloto } from '@/lib/season-engine/piloto-trava';

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

describe('parseProgramaCustom (sys_config.programa_custom é DADO, não código)', () => {
  it('aceita o shape válido e normaliza fechamento pra boolean', () => {
    expect(parseProgramaCustom({ semanas: 1, numCompetencias: 1, fechamento: 0 }))
      .toEqual({ semanas: 1, numCompetencias: 1, fechamento: false });
    expect(parseProgramaCustom({ semanas: 4, numCompetencias: 2, fechamento: true }))
      .toEqual({ semanas: 4, numCompetencias: 2, fechamento: true });
  });

  it('rejeita fora dos limites e lixo', () => {
    expect(parseProgramaCustom({ semanas: 0, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 5, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 2, numCompetencias: 3, fechamento: false })).toBeNull();
    expect(parseProgramaCustom({ semanas: 2.5, numCompetencias: 1, fechamento: false })).toBeNull();
    expect(parseProgramaCustom(null)).toBeNull();
    expect(parseProgramaCustom('piloto')).toBeNull();
    expect(parseProgramaCustom({})).toBeNull();
  });
});

describe('derivarConfigCustom — família degustação', () => {
  it('COM fechamento: slot extra espelhado + acumulada na última semana de conteúdo', () => {
    const c = derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: true });
    expect(c.modo).toBe('piloto');
    expect(c.semanas).toBe(4);
    expect(c.slotsConteudo).toEqual([1, 2, 3]);
    expect(c.semanasAvaliacao).toEqual([4]);
    expect(c.semanaCenarioB).toBe(4);
    expect(c.semanaAcumulada).toBe(3);
    expect(c.semanaEspelhoCalendario).toEqual({ 4: 3 });
    expect(c.conteudosPorSemana).toBe(2);
    expect(c.arguicao?.ativa).toBe(true);
    expect(ehConfigSemFechamento(c)).toBe(false);
  });

  it('SEM fechamento: sem slot de avaliação, acumulada inalcançável, arguição off', () => {
    const c = derivarConfigCustom({ semanas: 1, numCompetencias: 1, fechamento: false });
    expect(c.semanas).toBe(1);
    expect(c.slotsConteudo).toEqual([1]);
    expect(c.semanasAvaliacao).toEqual([]);
    expect(c.semanaAcumulada).toBe(0);
    expect(c.semanaCenarioB).toBe(0);
    expect(c.semanaEspelhoCalendario).toBeUndefined();
    expect(c.arguicao?.ativa).toBe(false);
    expect(ehConfigSemFechamento(c)).toBe(true);
  });

  it('input inválido explode explícito (nunca degrada calado)', () => {
    expect(() => derivarConfigCustom({ semanas: 9, numCompetencias: 1, fechamento: false })).toThrow(/programa_custom inválido/);
  });
});

describe('deveEncerrarSemFechamento — só o custom sem fechamento entra', () => {
  const semFech = derivarConfigCustom({ semanas: 2, numCompetencias: 1, fechamento: false });

  it('dispara na última semana de conteúdo do custom sem fechamento', () => {
    expect(deveEncerrarSemFechamento(semFech, 2)).toBe(true);
    expect(deveEncerrarSemFechamento(semFech, 1)).toBe(false);
  });

  it('NUNCA dispara pros presets (todos têm semanasAvaliacao não-vazia)', () => {
    for (const preset of [PROGRAMA_REGULAR, PROGRAMA_REGULAR_DUO, PROGRAMA_ONBOARDING, PROGRAMA_PILOTO]) {
      for (let s = 1; s <= preset.semanas; s++) {
        expect(deveEncerrarSemFechamento(preset, s)).toBe(false);
      }
    }
  });

  it('nem pro custom COM fechamento', () => {
    const comFech = derivarConfigCustom({ semanas: 2, numCompetencias: 1, fechamento: true });
    for (let s = 1; s <= comFech.semanas; s++) {
      expect(deveEncerrarSemFechamento(comFech, s)).toBe(false);
    }
  });
});

describe('montarReportDegustacao — shape da variante piloto sem notas', () => {
  it('baseline do diagnóstico, sem_fechamento=true, excluída da agregação do gestor (modo piloto)', () => {
    const r = montarReportDegustacao({
      competencia_foco: 'Fluência Digital',
      descritores_selecionados: [
        { descritor: 'D1', nota_atual: 1.5, competencia: 'Fluência Digital' },
        { descritor: 'D2', nota_atual: 2.0 },
      ],
    });
    expect(r.modo).toBe('piloto');
    expect(r.sem_fechamento).toBe(true);
    expect(r.spec_version).toBe(DEGUSTACAO_SPEC_VERSION);
    expect(r.descritores).toEqual([
      expect.objectContaining({ descritor: 'D1', baseline: 1.5, nota_avaliacao: null }),
      expect.objectContaining({ descritor: 'D2', baseline: 2.0, competencia: 'Fluência Digital' }),
    ]);
    expect(r.nota_media_pos).toBeNull();
  });

  it('trilha sem descritores → report vazio mas válido', () => {
    const r = montarReportDegustacao({ competencia_foco: 'X', descritores_selecionados: null });
    expect(r.descritores).toEqual([]);
  });
});

describe('parseConfigSnapshot — JSONB é dado, não código', () => {
  it('config derivada faz roundtrip', () => {
    const c = derivarConfigCustom({ semanas: 2, numCompetencias: 2, fechamento: true });
    expect(parseConfigSnapshot(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('lixo → null', () => {
    expect(parseConfigSnapshot(null)).toBeNull();
    expect(parseConfigSnapshot({})).toBeNull();
    expect(parseConfigSnapshot({ modo: 'piloto' })).toBeNull();
    expect(parseConfigSnapshot({ modo: 'piloto', semanas: 2, slotsConteudo: [1] })).toBeNull();
  });
});

describe('resolverModoColab — label custom', () => {
  it('resolve override e default da empresa', () => {
    expect(resolverModoColab({ programa_modo: 'custom' }, null)).toBe('custom');
    expect(resolverModoColab(null, { programa_modo: 'custom' })).toBe('custom');
    expect(resolverModoColab({ programa_modo: 'piloto' }, { programa_modo: 'custom' })).toBe('piloto');
  });
});

describe('resolverConfigDaTrilha — precedência do snapshot (mig 182)', () => {
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

  it('custom sem snapshot em lugar nenhum: re-deriva do sys_config (nunca DUO calado)', async () => {
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
});

describe('totalSemanasDoPlano — fim REAL do plano pro cron', () => {
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

  it('degustação sem fechamento de 1 semana → 1', () => {
    expect(totalSemanasDoPlano([{ semana: 1, tipo: 'conteudo' }], 14)).toBe(1);
  });

  it('plano ausente/vazio → fallback (colab legado)', () => {
    expect(totalSemanasDoPlano(null, 14)).toBe(14);
    expect(totalSemanasDoPlano([], 14)).toBe(14);
  });
});

describe('sanitizarNarrativaPiloto parametrizado (custom 1–4 semanas)', () => {
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
