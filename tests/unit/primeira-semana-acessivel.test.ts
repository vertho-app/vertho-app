import { describe, it, expect } from 'vitest';
import { primeiraSemanaAcessivel, avaliarAcessoSemana, ultimaSemanaAbertaPorData } from '@/lib/season-engine/week-gating';
import { PROGRESSO } from '@/lib/status';

/**
 * `primeiraSemanaAcessivel` é o que a CADÊNCIA usa para decidir qual semana
 * anunciar (23/08/2026). O gate cru desce um degrau por vez — suficiente para a
 * tela, onde a pessoa clica de novo; insuficiente para uma mensagem, que só tem
 * um link.
 *
 * Medido antes de existir: as 32 pessoas bloqueadas de Ibipeba apontavam TODAS
 * para a semana 5, com 18 delas presas na 1. O link levaria a outra porta
 * fechada.
 */

// data_inicio bem no passado: isola o gate de PROGRESSÃO do gate temporal.
const INICIO = '2026-01-05';
const AGORA = new Date('2026-08-24T11:00:00Z');

const plano = Array.from({ length: 14 }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));

/** Progresso com as semanas 1..n concluídas. */
function concluidasAte(n: number) {
  return Array.from({ length: n }, (_, i) => ({ semana: i + 1, status: PROGRESSO.CONCLUIDO }));
}

describe('primeiraSemanaAcessivel', () => {
  it('sem nenhuma semana concluída, devolve 1 mesmo com o calendário na 6', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso: [], semana: 6, now: AGORA,
    })).toBe(1);
  });

  it('desce até o ponto fixo, não um degrau só', () => {
    // Só a semana 1 concluída: a pessoa pode abrir a 2, não a 5.
    const progresso = concluidasAte(1);
    const umDegrau = avaliarAcessoSemana({ dataInicio: INICIO, plano, progresso, semana: 6, now: AGORA });
    expect(umDegrau.semanaPendente).toBe(5);            // o gate cru pára aqui...
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso, semana: 6, now: AGORA,
    })).toBe(2);                                        // ...e o ponto fixo vai até o fim
  });

  it('quem está em dia recebe a própria semana do calendário', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso: concluidasAte(5), semana: 6, now: AGORA,
    })).toBe(6);
  });

  it('semana 1 é sempre acessível', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso: [], semana: 1, now: AGORA,
    })).toBe(1);
  });

  it('bloqueio por DATA não desce — não há semana anterior a oferecer', () => {
    // Início no futuro: nem a semana 1 liberou. Descer seria inventar destino.
    const acesso = avaliarAcessoSemana({
      dataInicio: '2026-12-07', plano, progresso: [], semana: 3, now: AGORA,
    });
    expect(acesso.motivo).toBe('data');
    expect(primeiraSemanaAcessivel({
      dataInicio: '2026-12-07', plano, progresso: [], semana: 3, now: AGORA,
    })).toBe(3);
  });

  it('progresso em_andamento NÃO conta como concluído', () => {
    // A distinção é o miolo do problema real: 45 das 74 pessoas tinham registro
    // aberto e zero turnos de conversa. Tratar 'em_andamento' como conclusão
    // devolveria 6 e mandaria todas para a porta fechada de novo.
    const progresso = [{ semana: 5, status: PROGRESSO.EM_ANDAMENTO }];
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso, semana: 6, now: AGORA,
    })).toBe(1);
  });

  it('não entra em laço com progresso inconsistente', () => {
    // Semana 3 concluída mas 1 e 2 não: o gate desce e não acha base limpa.
    // O teto de iterações tem que devolver algo, não travar o cron.
    const progresso = [{ semana: 3, status: PROGRESSO.CONCLUIDO }];
    const r = primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso, semana: 14, now: AGORA,
    });
    expect(Number.isInteger(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(1);
  });

  it('semana inválida cai em 1 em vez de propagar NaN', () => {
    // NaN viraria `<slug>/NaN` no botão do template — erro que a API aceita.
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO, plano, progresso: [], semana: 'abc', now: AGORA,
    })).toBe(1);
  });
});

/**
 * 🔴 O relógio da cadência anda na frente da data de quinta a domingo (medido
 * 17/09/2026, Macaé). O cron avança `semana_atual` na quinta; a semana nova só
 * abre na segunda às 03:00. A régua devolvia a semana do relógio na hora, por
 * estar "fechada por data", e o painel punha os 38 diretores na semana 6 com 19
 * deles presos na 1.
 *
 * Datas reais dos diretores de Macaé: trilha em 17/08, relógio na 6 na quinta
 * 17/09. A semana 5 abriu em 14/09; a 6 abre em 21/09.
 */
describe('relógio da cadência à frente da data', () => {
  const INICIO_MACAE = '2026-08-17';
  const QUINTA = new Date('2026-09-17T12:00:00Z');
  const planoJornada = Array.from({ length: 7 }, (_, i) => ({ semana: i + 1, tipo: 'conteudo' }));

  it('a última semana aberta por data é a 5, não a do relógio', () => {
    expect(ultimaSemanaAbertaPorData({ dataInicio: INICIO_MACAE, plano: planoJornada, semana: 6, now: QUINTA })).toBe(5);
  });

  it('🔴 quem está preso na semana 1 aparece na 1, mesmo com o relógio numa semana fechada por data', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO_MACAE, plano: planoJornada, progresso: [], semana: 6, now: QUINTA,
    })).toBe(1);
  });

  it('desce a partir da semana aberta até o ponto fixo', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO_MACAE, plano: planoJornada, progresso: concluidasAte(2), semana: 6, now: QUINTA,
    })).toBe(3);
  });

  it('quem está em dia fica na semana aberta, e não numa semana que só abre na segunda', () => {
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO_MACAE, plano: planoJornada, progresso: concluidasAte(5), semana: 6, now: QUINTA,
    })).toBe(5);
  });

  it('na segunda às 03:00 (06:00 UTC) a semana do relógio abre e volta a valer', () => {
    const antes = new Date('2026-09-21T05:59:00Z');
    const depois = new Date('2026-09-21T06:00:00Z');
    expect(ultimaSemanaAbertaPorData({ dataInicio: INICIO_MACAE, plano: planoJornada, semana: 6, now: antes })).toBe(5);
    expect(ultimaSemanaAbertaPorData({ dataInicio: INICIO_MACAE, plano: planoJornada, semana: 6, now: depois })).toBe(6);
    expect(primeiraSemanaAcessivel({
      dataInicio: INICIO_MACAE, plano: planoJornada, progresso: concluidasAte(5), semana: 6, now: depois,
    })).toBe(6);
  });

  it('respeita o remapeamento de calendário do plano (`calendario_semana`)', () => {
    // Semana 6 do plano cai na semana 5 do calendário: já abriu.
    const remapeado = planoJornada.map((s) => (s.semana === 6 ? { ...s, calendario_semana: 5 } : s));
    expect(ultimaSemanaAbertaPorData({ dataInicio: INICIO_MACAE, plano: remapeado, semana: 6, now: QUINTA })).toBe(6);
  });

  it('trilha que ainda não começou não tem semana aberta', () => {
    expect(ultimaSemanaAbertaPorData({ dataInicio: '2026-12-07', plano: planoJornada, semana: 3, now: QUINTA })).toBeNull();
  });
});
