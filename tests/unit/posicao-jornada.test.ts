import { describe, expect, it } from 'vitest';
import { derivarPosicaoJornada } from '@/lib/engajamento/posicao-jornada';
import { PROGRESSO } from '@/lib/status';

const INICIO = '2026-01-05';
const AGORA = new Date('2026-09-02T12:00:00Z');
const plano = Array.from({ length: 14 }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));
const planoDe = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));

function concluidasAte(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    semana: i + 1,
    status: PROGRESSO.CONCLUIDO,
  }));
}

describe('derivarPosicaoJornada', () => {
  it('não confunde semana do calendário com conclusão individual', () => {
    const posicao = derivarPosicaoJornada({
      semanaCalendario: 3,
      dataInicio: INICIO,
      plano,
      progresso: [],
      confiavel: true,
      now: AGORA,
    });

    expect(posicao).toEqual({
      semanaAcessivel: 1,
      atrasada: true,
      semanaConcluida: false,
      totalSemanas: 14,
      jornadaConcluida: false,
    });
  });

  it('aponta a primeira semana pendente', () => {
    expect(derivarPosicaoJornada({
      semanaCalendario: 3,
      dataInicio: INICIO,
      plano,
      progresso: concluidasAte(1),
      confiavel: true,
      now: AGORA,
    })).toEqual({
      semanaAcessivel: 2,
      atrasada: true,
      semanaConcluida: false,
      totalSemanas: 14,
      jornadaConcluida: false,
    });
  });

  it('distingue quem está na etapa corrente de quem já a concluiu', () => {
    const emCurso = derivarPosicaoJornada({
      semanaCalendario: 3,
      dataInicio: INICIO,
      plano,
      progresso: concluidasAte(2),
      confiavel: true,
      now: AGORA,
    });
    const concluida = derivarPosicaoJornada({
      semanaCalendario: 3,
      dataInicio: INICIO,
      plano,
      progresso: concluidasAte(3),
      confiavel: true,
      now: AGORA,
    });

    expect(emCurso).toEqual({
      semanaAcessivel: 3, atrasada: false, semanaConcluida: false, totalSemanas: 14, jornadaConcluida: false,
    });
    expect(concluida).toEqual({
      semanaAcessivel: 3, atrasada: false, semanaConcluida: true, totalSemanas: 14, jornadaConcluida: false,
    });
  });

  it('não inventa posição quando a leitura não é confiável', () => {
    expect(derivarPosicaoJornada({
      semanaCalendario: 3,
      dataInicio: INICIO,
      plano,
      progresso: concluidasAte(2),
      confiavel: false,
      now: AGORA,
    })).toEqual({
      semanaAcessivel: null,
      atrasada: false,
      semanaConcluida: false,
      totalSemanas: null,
      jornadaConcluida: false,
    });
  });

  /**
   * Fim de jornada. `Medido em Ibipeba, 14/09/2026`: 7 pessoas posicionadas na
   * semana 9 (o fim do plano encurtado) e só 1 com a semana 9 concluída — a tela
   * chamava as duas coisas de "em curso", e a pergunta "quantas finalizaram?"
   * não tinha resposta.
   */
  describe('fim da jornada', () => {
    it('só é fim quando a ÚLTIMA semana do plano está concluída', () => {
      const planoIbipeba = planoDe(9);
      const naUltima = derivarPosicaoJornada({
        semanaCalendario: 9,
        dataInicio: INICIO,
        plano: planoIbipeba,
        progresso: concluidasAte(8),
        confiavel: true,
        now: AGORA,
      });
      const fechou = derivarPosicaoJornada({
        semanaCalendario: 9,
        dataInicio: INICIO,
        plano: planoIbipeba,
        progresso: concluidasAte(9),
        confiavel: true,
        now: AGORA,
      });

      expect(naUltima).toMatchObject({ semanaAcessivel: 9, totalSemanas: 9, jornadaConcluida: false });
      expect(fechou).toMatchObject({ semanaAcessivel: 9, totalSemanas: 9, jornadaConcluida: true });
    });

    /**
     * 🔴 A armadilha que uma régua por `semanaAcessivel` cairia:
     * `primeiraSemanaAcessivel` parte do CALENDÁRIO e nunca sobe acima dele, então
     * quem está em dia tem a semana acessível igual ao relógio — e `9 >= 9` diria
     * "terminou" para quem só chegou à porta da última etapa.
     */
    it('estar na última semana acessível não é ter terminado', () => {
      const posicao = derivarPosicaoJornada({
        semanaCalendario: 3,
        dataInicio: INICIO,
        plano: planoDe(4),
        progresso: concluidasAte(3),
        confiavel: true,
        now: AGORA,
      });

      expect(posicao.semanaAcessivel).toBe(3);
      expect(posicao.semanaConcluida).toBe(true);
      expect(posicao.totalSemanas).toBe(4);
      expect(posicao.jornadaConcluida).toBe(false);
    });

    it('com o relógio adiante do plano, a posição passa do fim e só o fim de jornada explica a pessoa', () => {
      const posicao = derivarPosicaoJornada({
        semanaCalendario: 10,
        dataInicio: INICIO,
        plano: planoDe(9),
        progresso: concluidasAte(9),
        confiavel: true,
        now: AGORA,
      });

      // 🔴 `semanaAcessivel` NÃO é limitada pelo plano: com a 9 concluída, a
      // semana 10 "abre" e a posição vira 10 num plano de 9. Sem o estado
      // terminal, a tela anunciaria "Semana 10 · em curso" para quem terminou —
      // é por isso que `jornadaConcluida` é lido ANTES de posição e atraso.
      expect(posicao.semanaAcessivel).toBe(10);
      expect(posicao.atrasada).toBe(false);
      expect(posicao.totalSemanas).toBe(9);
      expect(posicao.jornadaConcluida).toBe(true);
    });

    it('plano ilegível não afirma fim de jornada', () => {
      const semPlano = derivarPosicaoJornada({
        semanaCalendario: 9,
        dataInicio: INICIO,
        plano: [],
        progresso: concluidasAte(9),
        confiavel: true,
        now: AGORA,
      });
      const planoSemSemana = derivarPosicaoJornada({
        semanaCalendario: 9,
        dataInicio: INICIO,
        plano: [{ tipo: 'conteudo' }, { tipo: 'conteudo' }],
        progresso: concluidasAte(9),
        confiavel: true,
        now: AGORA,
      });

      expect(semPlano).toMatchObject({ totalSemanas: null, jornadaConcluida: false });
      expect(planoSemSemana).toMatchObject({ totalSemanas: null, jornadaConcluida: false });
    });

    it('a última semana é a MAIOR do plano, não a quantidade de itens', () => {
      // Plano podado: as semanas 10-14 saíram, mas a numeração das que ficaram
      // não foi reescrita. Contar itens diria 8; a última é a 9.
      const posicao = derivarPosicaoJornada({
        semanaCalendario: 9,
        dataInicio: INICIO,
        plano: [1, 2, 3, 4, 5, 6, 7, 9].map((semana) => ({ semana, tipo: 'conteudo' })),
        progresso: [...concluidasAte(7), { semana: 9, status: PROGRESSO.CONCLUIDO }],
        confiavel: true,
        now: AGORA,
      });

      expect(posicao.totalSemanas).toBe(9);
      expect(posicao.jornadaConcluida).toBe(true);
    });
  });
});
