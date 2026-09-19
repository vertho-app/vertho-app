import { describe, it, expect } from 'vitest';
import { COMPETENCIAS_ATENDIMENTO } from '@/lib/recepcao/matriz';
import {
  aplicarMatrizAtendimento,
  notaAtendimento,
  relatorioAtendimentoPublico,
} from '@/lib/recepcao/matriz-avaliacao';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import {
  abrirSessao,
  consolidar,
  promptAvaliador,
  sugerirNivel,
} from '@/lib/recepcao/core';
import { cenarioSchema, avaliacaoSchema } from '@/lib/recepcao/schema';
import type { Insumos } from '@/lib/recepcao/model';
import {
  pontuacaoMatriz,
  notaPacePublica,
} from '@/lib/simulador-vendas/escala';
import { COMPETENCIAS_PACE } from '@/lib/simulador-vendas/matriz';
import { nivelDaNota } from '@/lib/nivel-regua';

function caso() {
  const c = cenarioSchema.parse(aplicarMatrizAtendimento(catalogoInicial[0]));
  const s = abrirSessao(c, 0);
  s.respostas = 1;
  s.historico.push({
    id: 'm1',
    role: 'user',
    content:
      'Entendo que a alteração prejudicou sua organização. Qual horário você consegue?',
  });
  const raw: Insumos = {
    dimensoes: c.matriz!.competencias.flatMap((comp) =>
      comp.descritores.map((d) => ({
        id: d.codigo,
        classificacao: 'n3' as const,
        justificativa: 'Conduta observada.',
        evidencias: [
          { mensagemId: 'm1', trecho: 'Qual horário você consegue?' },
        ],
        oportunidades: [{ mensagemId: 'm0', trecho: s.historico[0].content }],
      })),
    ),
    ocorrencias: [],
    desfecho: {
      tipo: 'inconclusivo',
      justificativa: 'A conversa continua.',
      evidencias: [],
    },
    feedback: {
      acerto: 'Reconheceu o impacto.',
      melhoria: 'Confirme o combinado.',
      novaTentativa: 'Retome a escolha.',
    },
  };
  return { s, raw };
}
describe('matrizes com nota 1–4', () => {
  it('atendimento tem 5 competências, 30 descritores distintos e 120 textos completos', () => {
    expect(COMPETENCIAS_ATENDIMENTO).toHaveLength(5);
    const ds = COMPETENCIAS_ATENDIMENTO.flatMap((c) => c.descritores);
    expect(ds).toHaveLength(30);
    expect(new Set(ds.map((d) => d.codigo)).size).toBe(30);
    for (const c of COMPETENCIAS_ATENDIMENTO)
      expect(c.descritores).toHaveLength(6);
    for (const d of ds)
      for (const n of ['n1', 'n2', 'n3', 'n4'] as const)
        expect(d.niveis[n].length).toBeGreaterThan(35);
  });
  it('avalia os 30 descritores e consolida cinco competências N3 sem conversão percentual', () => {
    const { s, raw } = caso();
    expect(avaliacaoSchema.safeParse(raw).success).toBe(true);
    expect(promptAvaliador(s.cenario)).toContain('Avalie os 30 descritores');
    const r = consolidar(s, raw)!;
    expect(r.nota).toBe(3);
    expect(r.escalaNota).toBe('1-4');
    expect(r.coberturaPercentual).toBe(100);
    expect(r.competencias).toHaveLength(5);
    expect(
      r.competencias!.every(
        (c) => c.nota === 3 && c.nivel === 3 && c.observados === 6,
      ),
    ).toBe(true);
  });
  it('ausência de oportunidade não vira N1; competência com menos de 4 observados fica sem nível e fora da média', () => {
    const { s, raw } = caso();
    raw.dimensoes.forEach((d, i) => {
      if (i < 6) {
        d.classificacao = i === 0 ? 'n4' : 'nao_observavel';
        if (i > 0) {
          d.evidencias = [];
          d.oportunidades = [];
        }
      } else d.classificacao = 'n2';
    });
    const r = consolidar(s, raw)!;
    // Regra de cobertura (18/09): 1 observado não dá nível; a média é das 4 com nível.
    expect(r.nota).toBe(2);
    expect(r.regraCobertura).toBe('cobertura-4de6-3comp');
    expect(r.competencias![0]).toMatchObject({
      nota: null,
      nivel: null,
      observados: 1,
      suficiente: false,
    });
    expect(r.coberturaPercentual).toBe(83.33);
    raw.dimensoes.forEach((d) => {
      d.classificacao = 'nao_observavel';
      d.evidencias = [];
      d.oportunidades = [];
    });
    expect(consolidar(s, raw)!.nota).toBeNull();
  });
  it('recusa descritor faltante, repetido e evidência do paciente usada como conduta', () => {
    const { s, raw } = caso();
    const missing = structuredClone(raw);
    missing.dimensoes.pop();
    expect(() => consolidar(s, missing)).toThrow('incompletas');
    const dup = structuredClone(raw);
    dup.dimensoes[1] = dup.dimensoes[0];
    expect(() => consolidar(s, dup)).toThrow('duplicada');
    // Citação que não confere em POUCOS descritores rebaixa só eles (18/09)...
    const um = structuredClone(raw);
    um.dimensoes[0].evidencias = [
      { mensagemId: 'm0', trecho: s.historico[0].content },
    ];
    const r = consolidar(s, um)!;
    expect(r.descartados).toEqual(['aco1']);
    expect(r.dimensoes.find((d) => d.id === 'aco1')).toMatchObject({
      classificacao: 'nao_observavel',
      evidencias: [],
    });
    // ...acima de 20% dos avaliados a avaliação inteira é recusada, como antes.
    const muitos = structuredClone(raw);
    for (const d of muitos.dimensoes.slice(0, 7))
      d.evidencias = [{ mensagemId: 'm0', trecho: s.historico[0].content }];
    expect(() => consolidar(s, muitos)).toThrow('participante incorreto');
  });
  it('preserva a matriz antiga e identifica a conversão de seu resultado no histórico', () => {
    const before = JSON.stringify(catalogoInicial[0]);
    aplicarMatrizAtendimento(catalogoInicial[0]);
    expect(JSON.stringify(catalogoInicial[0])).toBe(before);
    expect(notaAtendimento({ nota: 0 })).toBe(1);
    expect(notaAtendimento({ nota: 100 })).toBe(4);
    expect(notaAtendimento({ nota: null })).toBeNull();
    const { s, raw } = caso();
    const r = consolidar(s, raw)!;
    expect(relatorioAtendimentoPublico(r)).toBe(r);
    expect(r.nota).toBe(3);
    expect(
      sugerirNivel([{ nivel: 'introducao', nota: 3, escalaNota: '1-4' }]),
    ).toBe('pressao');
  });
  it('vendas inclui planejamento na média e exclui competências não observadas', () => {
    const matriz = {
      versao: 'pace-competencias-1' as const,
      descritores: COMPETENCIAS_PACE.flatMap((c, i) =>
        c.descritores.map((d) => ({
          codigo: d.codigo,
          nivel: (i === 0 ? 1 : i === 4 ? null : 3) as 1 | 3 | null,
          justificativa: 'Observado.',
          evidencias: [],
        })),
      ),
    };
    expect(pontuacaoMatriz(matriz)).toMatchObject({
      PL: 1,
      P: 3,
      A: 3,
      C: 3,
      E: null,
      Media: 2.5,
      escalaNota: '1-4',
    });
    matriz.descritores.forEach((d) => {
      d.nivel = null;
    });
    expect(pontuacaoMatriz(matriz).Media).toBeNull();
  });
  it('limites de nota e nível seguem a régua Vertho sem promover por arredondamento', () => {
    expect(nivelDaNota(1.99)).toBe(1);
    expect(nivelDaNota(2.99)).toBe(2);
    expect(nivelDaNota(3.5)).toBe(3);
    expect(nivelDaNota(3.51)).toBe(4);
    expect(notaPacePublica(10, 'pace-2')).toBe(4);
    expect(notaPacePublica(3, 'pace-6')).toBe(3);
    expect(notaPacePublica(0, 'pace-2')).toBeNull();
  });
});
