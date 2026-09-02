import { describe, expect, it } from 'vitest';
import { derivarPosicaoJornada } from '@/lib/engajamento/posicao-jornada';
import { PROGRESSO } from '@/lib/status';

const INICIO = '2026-01-05';
const AGORA = new Date('2026-09-02T12:00:00Z');
const plano = Array.from({ length: 14 }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));

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

    expect(emCurso).toEqual({ semanaAcessivel: 3, atrasada: false, semanaConcluida: false });
    expect(concluida).toEqual({ semanaAcessivel: 3, atrasada: false, semanaConcluida: true });
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
    });
  });
});
