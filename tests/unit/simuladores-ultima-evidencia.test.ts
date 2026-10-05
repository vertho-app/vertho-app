/**
 * Revisão de 04/10/2026: o "maior nível" da evolução não dizia QUANDO houve
 * evidência. Agora cada competência traz `treinos` (com nível) e
 * `ultimaEvidencia` (data do treino mais recente em que ela teve nível).
 *
 * Diz quando, não qual nível: um treino mais fraco depois do melhor continua
 * sem aparecer como queda (regra de só avanço, 16/09/2026). E os dois
 * produtores de equipe passam a data que já tinham (`criadoEm` no vendas,
 * `created_at` no atendimento): sem isso a tela recebe sempre `null`.
 */
import { describe, expect, it } from 'vitest';
import { evolucaoPorCompetencia } from '@/lib/simuladores/evolucao';
import { agregarPainel } from '@/lib/simulador-vendas/painel';
import { visaoPorCompetencia } from '@/lib/recepcao/painel';

describe('evolução: data da última evidência', () => {
  // Mais recente primeiro, como os históricos.
  const treinos = [
    { em: '2026-10-02T15:00:00Z', competencias: { a: null, b: 2.1 } },
    { em: '2026-09-25T15:00:00Z', competencias: { a: 3.6, b: 3.2 } },
    { em: '2026-09-10T15:00:00Z', competencias: { a: 2.0, b: null } },
  ];

  it('é o treino mais recente COM nível na competência, não o treino mais recente', () => {
    const [a, b] = evolucaoPorCompetencia(treinos, ['a', 'b']);
    // `a` não teve nível no treino de 02/10: a última evidência é de 25/09.
    expect(a).toMatchObject({ nivelAlcancado: 4, treinos: 2, ultimaEvidencia: '2026-09-25T15:00:00Z' });
    // `b` caiu de Nível 3 para Nível 2 no último: a data é dele, e o nível segue o maior.
    expect(b).toMatchObject({ nivelAlcancado: 3, treinos: 2, ultimaEvidencia: '2026-10-02T15:00:00Z' });
  });

  it('não depende da ordem de entrada', () => {
    const embaralhado = [treinos[2], treinos[0], treinos[1]];
    expect(evolucaoPorCompetencia(embaralhado, ['a', 'b']).map((c) => c.ultimaEvidencia)).toEqual([
      '2026-09-25T15:00:00Z',
      '2026-10-02T15:00:00Z',
    ]);
  });

  it('sem data na entrada, ou sem nível, não inventa data', () => {
    const semData = treinos.map(({ competencias }) => ({ competencias }));
    expect(evolucaoPorCompetencia(semData, ['a']).map((c) => c.ultimaEvidencia)).toEqual([null]);
    expect(evolucaoPorCompetencia<string>(treinos, ['c'])).toEqual([
      { codigo: 'c', nivelAlcancado: null, primeiroNivel: null, subiu: false, treinos: 0, ultimaEvidencia: null },
    ]);
  });
});

describe('os produtores da equipe passam a data', () => {
  it('vendas: a data do treino (`criadoEm`) chega à competência', () => {
    const p = agregarPainel(
      [{ id: 'ana', nome: 'Ana', cargo: null }],
      [
        { colaboradorId: 'ana', criadoEm: '2026-09-20T12:00:00Z', status: 'concluida', conversou: true, competencias: { P: 3.1 }, feedback: null },
        { colaboradorId: 'ana', criadoEm: '2026-09-28T12:00:00Z', status: 'concluida', conversou: true, competencias: { P: 2.4 }, feedback: null },
      ],
    );
    expect(p.pessoas[0].competencias.find((c) => c.codigo === 'P')).toMatchObject({
      treinos: 2,
      ultimaEvidencia: '2026-09-28T12:00:00Z',
    });
  });

  it('atendimento: a data da sessão (`created_at`) chega à competência', () => {
    const linha = (created_at: string, nota: number) => ({
      colaborador_id: 'ana',
      created_at,
      estado: { status: 'concluida', relatorio: { escalaNota: '1-4', competencias: [{ codigo: 'clareza', nota }] } },
    });
    const v = visaoPorCompetencia(
      [linha('2026-09-21T12:00:00Z', 3), linha('2026-09-30T12:00:00Z', 2)],
      [{ id: 'ana', nome: 'Ana', cargo: null }],
      ['clareza'],
    );
    expect(v.pessoas[0].competencias[0]).toMatchObject({ treinos: 2, ultimaEvidencia: '2026-09-30T12:00:00Z' });
  });
});
