import { describe, expect, it } from 'vitest';
import {
  quadranteDe, fraseGap, fraseAncorada, montarLinha, contarPorQuadrante, ordenarLinhas,
  ORDEM_QUADRANTES, RECOMENDACAO_POR_QUADRANTE, QUADRANTE_LABEL,
} from '@/lib/prontidao-lideranca/matriz';
import { lerEstilo, type EstiloPessoa } from '@/lib/prontidao-lideranca/estilo';
import type { PosicaoPessoa } from '@/lib/prontidao-lideranca/posicao';
import type { PessoaAdequacao } from '@/lib/adequacao-cargo/aggregate';

describe('quadranteDe — as camadas se cruzam, não se somam', () => {
  it('cobre os quatro quadrantes e a zona de revisão', () => {
    expect(quadranteDe('demonstra', 'aderente')).toBe('pronta');
    expect(quadranteDe('demonstra', 'distante')).toBe('pronta_com_custo');
    expect(quadranteDe('nao_demonstra', 'aderente')).toBe('potencial');
    expect(quadranteDe('nao_demonstra', 'distante')).toBe('nao_agora');
    expect(quadranteDe('zona_de_revisao', 'aderente')).toBe('revisar');
    expect(quadranteDe('zona_de_revisao', 'distante')).toBe('revisar');
  });

  it('estilo nunca rebaixa quem demonstra para fora de "pronta*"', () => {
    for (const estilo of ['aderente', 'distante'] as const) {
      expect(quadranteDe('demonstra', estilo).startsWith('pronta')).toBe(true);
    }
  });

  it('todo quadrante tem rótulo e recomendação, e a ordem de leitura cobre todos', () => {
    for (const q of ORDEM_QUADRANTES) {
      expect(QUADRANTE_LABEL[q]).toBeTruthy();
      expect(RECOMENDACAO_POR_QUADRANTE[q].length).toBeGreaterThan(40);
    }
    expect(new Set(ORDEM_QUADRANTES).size).toBe(5);
  });
});

describe('frase de gap ancorada', () => {
  it('cita competência, média e corte na mesma sentença, em vírgula decimal', () => {
    const f = fraseGap('Desenvolvimento de pessoas', 2.4, 3);
    expect(f).toBe('Desenvolvimento de pessoas — média 2,40 (corte 3,00)');
    expect(fraseAncorada(f, 'Desenvolvimento de pessoas', 2.4, 3)).toBe(true);
  });
  it('rótulo sem número NÃO passa como ancorado', () => {
    expect(fraseAncorada('Desenvolvimento de pessoas está fraco', 'Desenvolvimento de pessoas', 2.4, 3)).toBe(false);
  });
});

function pessoaAdequacao(partial: Partial<PessoaAdequacao>): PessoaAdequacao {
  return {
    nome: 'Ana', disc: [], mapeamento: {} as any, competencia: {} as any, lideranca: {} as any, discScore: {} as any,
    beta: { atendidos: 0, total: 0, pct: 80, classe: 'alta', aplicavel: true },
    recomendacao: 'recomendado', recomendacaoLabel: 'Recomendado', status: 'recomendado', statusLabel: 'Recomendado',
    borderline: false, betaSemDelta: 0, knockoutFailed: false, knockoutMotivos: [], knockoutEvidencias: [],
    origemBloqueio: null, origemBloqueioLabel: null, gaps: [], tracos: [], id: 'c1',
    ...partial,
  };
}

describe('lerEstilo — aderência ao gabarito do cargo-alvo', () => {
  const faixas = { recomendadoMin: 86.5, ressalvasMin: 75.4 };
  it('aderente a partir do piso "com ressalvas" da régua do alvo (inclusivo)', () => {
    expect(lerEstilo(pessoaAdequacao({ beta: { atendidos: 0, total: 0, pct: 75.4, classe: 'razoavel', aplicavel: true } }), faixas).estilo).toBe('aderente');
    expect(lerEstilo(pessoaAdequacao({ beta: { atendidos: 0, total: 0, pct: 75.3, classe: 'baixa', aplicavel: true } }), faixas).estilo).toBe('distante');
  });
  it('bloqueio por gate vira distante + aviso com motivos, nunca some da matriz', () => {
    const e = lerEstilo(pessoaAdequacao({ knockoutFailed: true, knockoutMotivos: ['Persistência 18 (piso do cargo: 41)'], status: 'bloqueado' }), faixas);
    expect(e.estilo).toBe('distante');
    expect(e.bloqueadoNoAlvo).toBe(true);
    expect(e.motivosBloqueio).toEqual(['Persistência 18 (piso do cargo: 41)']);
  });
  it('sem faixas, cai no status do motor; lacunas são os 3 menores fits', () => {
    const gaps = [
      { traco: 'A', bloco: 'DISC', fitPct: 70 }, { traco: 'B', bloco: 'DISC', fitPct: 30 },
      { traco: 'C', bloco: 'Competencia', fitPct: 50 }, { traco: 'D', bloco: 'DISC', fitPct: 60 },
    ];
    const e = lerEstilo(pessoaAdequacao({ status: 'abaixo_do_corte', gaps }), null);
    expect(e.estilo).toBe('distante');
    expect(e.lacunas.map((l) => l.traco)).toEqual(['B', 'C', 'D']);
  });
});

function posicao(mediaGeral: number, pos: PosicaoPessoa['posicao'], gaps: { competencia: string; media: number }[] = []): PosicaoPessoa {
  return {
    colaboradorId: 'c1', total: 5, cobertas: 5, completo: true, faltantes: [], mediaGeral, nivelGeral: 3, posicao: pos,
    gaps: gaps.map((g) => g.competencia),
    competencias: gaps.map((g) => ({ competencia: g.competencia, media: g.media, nivel: 2, descritores: 6, posicao: 'nao_demonstra' as const, gap: true })),
  };
}
const estiloOk: EstiloPessoa = { colaboradorId: 'c1', nome: 'Ana', aderenciaPct: 88, estilo: 'aderente', status: 'recomendado', statusLabel: 'Recomendado', bloqueadoNoAlvo: false, motivosBloqueio: [], lacunas: [], borderline: false };

describe('montarLinha / contar / ordenar', () => {
  it('linha carrega quadrante e frases de gap ancoradas; incompleta não vira linha', () => {
    const l = montarLinha({ colaboradorId: 'c1', nome: 'Ana', cargo: 'Vendedor', posicao: posicao(2.5, 'nao_demonstra', [{ competencia: 'Delegação', media: 2.1 }]), estilo: estiloOk, corte: 3 })!;
    expect(l.quadrante).toBe('potencial');
    expect(l.frasesGap).toEqual(['Delegação — média 2,10 (corte 3,00)']);
    const incompleta = { ...posicao(0, null), completo: false, mediaGeral: null };
    expect(montarLinha({ colaboradorId: 'c2', nome: 'Bia', cargo: null, posicao: incompleta, estilo: estiloOk, corte: 3 })).toBeNull();
  });

  it('ordena por quadrante, depois média geral, depois aderência, depois nome', () => {
    const mk = (nome: string, q: PosicaoPessoa['posicao'], media: number, estilo: EstiloPessoa['estilo'], pct = 80) =>
      montarLinha({ colaboradorId: nome, nome, cargo: null, posicao: posicao(media, q), estilo: { ...estiloOk, estilo, aderenciaPct: pct }, corte: 3 })!;
    const linhas = [
      mk('Zé', 'nao_demonstra', 2.0, 'distante'),
      mk('Ana', 'demonstra', 3.4, 'aderente'),
      mk('Bia', 'demonstra', 3.6, 'aderente'),
      mk('Caio', 'zona_de_revisao', 3.0, 'aderente'),
      mk('Duda', 'demonstra', 3.6, 'distante'),
      mk('Eva', 'demonstra', 3.6, 'aderente', 90),
    ];
    expect(ordenarLinhas(linhas).map((l) => l.nome)).toEqual(['Eva', 'Bia', 'Ana', 'Duda', 'Zé', 'Caio']);
    expect(contarPorQuadrante(linhas)).toEqual({ pronta: 3, pronta_com_custo: 1, potencial: 0, nao_agora: 1, revisar: 1 });
  });
});
