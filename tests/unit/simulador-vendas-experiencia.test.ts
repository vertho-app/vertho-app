import { describe, expect, it } from 'vitest';
import {
  comporPlano,
  MAXIMO_POR_RESPOSTA,
  MINIMO_RESPOSTAS_PLANO,
  PERGUNTAS_PLANO,
  respostasValidas,
} from '@/lib/simulador-vendas/plano-guiado';
import { evolucaoPorCompetencia, treinosComNiveis } from '@/lib/simulador-vendas/evolucao';
import { COLUNAS_HISTORICO_PARTICIPANTE, paginaDeHistorico } from '@/lib/simulador-vendas/historico';
import { comandoSchema } from '@/lib/simulador-vendas/schema';
import { pontuacaoMatriz } from '@/lib/simulador-vendas/escala';
import { validarMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import {
  competenciasDaMatriz,
  nomeDoDescritor,
} from '@/components/simulador-vendas/relatorio-matriz';
import { avaliacaoMatriz, estadoMatriz } from '../fixtures/simulador-vendas-matriz';

/**
 * Experiência do participante no vendas (18/09/2026): plano guiado em seis
 * perguntas, evolução por competência só com avanço, foco sugerido e a
 * devolutiva no formato comum aos três simuladores.
 */
describe('plano guiado', () => {
  const titulos = Array.from({ length: PERGUNTAS_PLANO }, (_, i) => `Pergunta ${i + 1}`);

  it('manda só as respostas preenchidas, cada uma com o título da pergunta', () => {
    const texto = comporPlano(['  Sei que o estoque falha. ', '', 'Vou perguntar o impacto.', 'ok', '', ''], titulos);
    expect(texto).toBe('Pergunta 1\nSei que o estoque falha.\n\nPergunta 3\nVou perguntar o impacto.');
    expect(respostasValidas(['a', '  ', 'três', 'quatro', 'cinco', 'seis'])).toBe(4);
  });

  it('o mínimo é o da regra de cobertura', () => {
    expect(MINIMO_RESPOSTAS_PLANO).toBe(4);
  });

  it('seis respostas no limite, com títulos longos, cabem no plano que o servidor aceita', () => {
    const longos = titulos.map((t) => t.padEnd(90, 'x'));
    const plano = comporPlano(
      Array.from({ length: PERGUNTAS_PLANO }, () => 'a'.repeat(MAXIMO_POR_RESPOSTA + 50)),
      longos,
    );
    expect(plano.length).toBeLessThanOrEqual(6000);
    const r = comandoSchema.safeParse({
      acao: 'planejar',
      planejamento: plano,
      requestId: crypto.randomUUID(),
      sessaoId: crypto.randomUUID(),
      revisao: 0,
    });
    expect(r.success).toBe(true);
  });
});

describe('evolução por competência: só avanço', () => {
  // Histórico chega do mais recente para o mais antigo.
  it('treino pior depois de um melhor não aparece como queda', () => {
    const e = evolucaoPorCompetencia([
      { competencias: { P: 2.2 } },
      { competencias: { P: 3.2 } },
    ]);
    expect(e.find((c) => c.codigo === 'P')).toMatchObject({
      nivelAlcancado: 3,
      primeiroNivel: 3,
      subiu: false,
      treinos: 2,
    });
  });

  it('subiu quando o maior nível passa do primeiro registrado', () => {
    const e = evolucaoPorCompetencia([
      { competencias: { A: 3.0, PL: null } },
      { competencias: { A: 2.4, PL: 2.8 } },
    ]);
    expect(e.find((c) => c.codigo === 'A')).toMatchObject({ nivelAlcancado: 3, primeiroNivel: 2, subiu: true });
    // Sem nível no treino recente não apaga o que já foi alcançado.
    expect(e.find((c) => c.codigo === 'PL')).toMatchObject({ nivelAlcancado: 2, subiu: false, treinos: 1 });
    expect(e.find((c) => c.codigo === 'E')).toMatchObject({ nivelAlcancado: null, treinos: 0 });
  });

  it('conta como treino com níveis só quem tem alguma nota', () => {
    expect(treinosComNiveis([{ competencias: { P: null } }, {}, { competencias: { E: 3 } }])).toBe(1);
  });
});

describe('histórico do participante', () => {
  const linha = (extra: Record<string, unknown>, versaoRegua = 'pace-7') => ({
    id: crypto.randomUUID(),
    created_at: '2026-09-18T12:00:00Z',
    colaborador_id: 'eu',
    resumo: {
      status: 'concluida' as const,
      nivel: 1 as const,
      nome: 'Beatriz',
      nomeVendedor: 'Ana',
      nota: 3,
      temRelatorio: true,
      versaoRegua,
    },
    pl: 3.2,
    p: 2.5,
    a: null,
    c: 3,
    e: 3.5,
    foco: '  Confirme o diagnóstico ',
    ...extra,
  });

  it('níveis por competência e foco só saem de devolutiva liberada', () => {
    const [liberada, fechada] = paginaDeHistorico(
      [linha({ liberado: 5 }), linha({ liberado: null })],
      30,
    ).historico;
    expect(liberada).toMatchObject({
      competencias: { PL: 3.2, P: 2.5, A: null, C: 3, E: 3.5 },
      foco: 'Confirme o diagnóstico',
    });
    expect(fechada.competencias).toBeUndefined();
    expect(fechada.foco).toBeUndefined();
  });

  it('versão na escala 0 a 10 fica fora da evolução', () => {
    const [antiga] = paginaDeHistorico([linha({ liberado: 5 }, 'pace-5')], 30).historico;
    expect(antiga.competencias).toBeUndefined();
  });

  it('a lista lê caminhos pequenos do relatório, nunca o relatório inteiro', () => {
    expect(COLUNAS_HISTORICO_PARTICIPANTE).not.toMatch(/estado->relatorio(,|$)/);
    expect(COLUNAS_HISTORICO_PARTICIPANTE).not.toContain('mensagens');
    expect(COLUNAS_HISTORICO_PARTICIPANTE).toContain('liberado:estado->feedback->realismo');
  });
});

describe('devolutiva do vendas no formato comum', () => {
  const rotulos = {
    nome: (c: string) => `Competência ${c}`,
    origem: (e: { origem: string; turno?: number | null }) =>
      e.origem === 'planejamento' ? 'Plano' : `Turno ${e.turno}`,
  };

  it('pace-7: E5 e E6 ficam fora, a regra é dita e a média é a do servidor', () => {
    const m = avaliacaoMatriz(3);
    const r = competenciasDaMatriz(m, 'pace-7', rotulos, { E: 'Leitura de Engajar' });
    const e = r.competencias.find((c) => c.codigo === 'E')!;
    expect(e.descritores.map((d) => d.codigo)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(e).toMatchObject({ resumo: 'Leitura de Engajar', observados: 4, total: 4, nivel: 3 });
    expect(r.regra).toEqual({ minDescritores: 4, minCompetencias: 3 });
    expect(r.media.nota).toBe(pontuacaoMatriz(m, 'pace-7').Media);
    expect(r.competencias.find((c) => c.codigo === 'PL')!.descritores[0].evidencias?.[0].origem).toBe('Plano');
  });

  it('pace-6 é lida como foi gerada: E com 6 comportamentos e sem regra', () => {
    const r = competenciasDaMatriz(avaliacaoMatriz(3), 'pace-6', rotulos);
    expect(r.competencias.find((c) => c.codigo === 'E')!.descritores).toHaveLength(6);
    expect(r.regra).toBeNull();
  });

  it('descritor descartado na validação chega marcado, sem nível', () => {
    const m = avaliacaoMatriz(3);
    m.descritores.find((d) => d.codigo === 'A1')!.evidencias[0].citacao = 'Frase que o vendedor nunca disse.';
    const gravada = validarMatriz(m, estadoMatriz());
    const a1 = competenciasDaMatriz(gravada, 'pace-7', rotulos)
      .competencias.find((c) => c.codigo === 'A')!
      .descritores.find((d) => d.codigo === 'A1')!;
    expect(a1).toMatchObject({ descartado: true, nivel: null, evidencias: [] });
  });

  it('recomendação mostra o nome do comportamento, não o código', () => {
    expect(nomeDoDescritor('PL6')).toBe('Antecipação de restrições e objeções');
    expect(nomeDoDescritor('XX9')).toBe('XX9');
  });
});
