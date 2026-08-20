import { describe, it, expect } from 'vitest';
import { avaliarAcessoSemana, turnosIaNecessarios, slotDaConversa } from '@/lib/season-engine/week-gating';

/**
 * A régua de acesso à semana — ÚNICA, usada pelo servidor (`checarGatesSemana`)
 * e pela tela da semana, que a usa para EXPLICAR o bloqueio.
 *
 * 🔴 O que ela protege (medido 20/08/2026, Ibipeba): a página da semana não
 * tinha gate nenhum e a cadência manda o link da semana do CALENDÁRIO. Quem
 * atrasou abria a semana 6, via o conteúdo e tomava 403 mudo ao tentar
 * conversar — 19 de 36 pessoas sem nenhuma semana concluída, e a reclamação
 * chegando por WhatsApp. A trava é intencional; o que faltava era ser dita.
 *
 * ⚠️ Todo caso passa `now` explícito: a semana libera às 06:00 UTC, então teste
 * ancorado no relógio real inverte sozinho de madrugada.
 */

const INICIO = '2026-07-13'; // segunda da semana 1
const AGORA = new Date('2026-08-20T12:00:00Z'); // semana 6 já liberada por data

const PLANO = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 2, tipo: 'conteudo' },
  { semana: 3, tipo: 'conteudo' },
  { semana: 4, tipo: 'aplicacao' },
  { semana: 5, tipo: 'conteudo' },
  { semana: 6, tipo: 'conteudo' },
  { semana: 13, tipo: 'avaliacao' },
];

const transcript = (turnosIa: number) => ({
  transcript_completo: Array.from({ length: turnosIa * 2 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'x',
  })),
});

const base = (progresso: any[]) => ({ dataInicio: INICIO, plano: PLANO, progresso, semana: 2, now: AGORA });

describe('avaliarAcessoSemana', () => {
  it('semana 1 abre sem depender de progresso nenhum', () => {
    expect(avaliarAcessoSemana({ ...base([]), semana: 1 })).toEqual({ liberada: true });
  });

  it('semana futura no calendário é bloqueada por DATA, com o dia da liberação', () => {
    const r = avaliarAcessoSemana({ ...base([]), semana: 10 });
    expect(r.liberada).toBe(false);
    expect(r.motivo).toBe('data');
    expect(r.liberaEm).toBe('seg 14/09');
  });

  it('🔑 anterior NÃO concluída bloqueia e diz quantos turnos faltam', () => {
    const r = avaliarAcessoSemana(base([
      { semana: 1, status: 'em_andamento', reflexao: transcript(3) },
    ]));
    expect(r.liberada).toBe(false);
    expect(r.motivo).toBe('anterior');
    expect(r.semanaPendente).toBe(1);
    expect(r.turnosFeitos).toBe(3);
    expect(r.turnosNecessarios).toBe(6); // MAX_TURNS_SOCRATIC / 2
  });

  it('anterior concluída libera', () => {
    const r = avaliarAcessoSemana(base([{ semana: 1, status: 'concluido', reflexao: transcript(6) }]));
    expect(r.liberada).toBe(true);
  });

  it('🔴 estar EM ANDAMENTO na semana pedida não libera — é o que a lista fazia e a rota negava', () => {
    const r = avaliarAcessoSemana(base([
      { semana: 1, status: 'em_andamento', reflexao: transcript(1) },
      { semana: 2, status: 'em_andamento', reflexao: transcript(0) },
    ]));
    expect(r.liberada).toBe(false);
    expect(r.semanaPendente).toBe(1);
  });

  it('semana de aplicação pendente exige 10 turnos, não 6', () => {
    const r = avaliarAcessoSemana({
      ...base([{ semana: 4, status: 'em_andamento', feedback: { ...transcript(2), modo: 'pratica' } }]),
      semana: 5,
    });
    expect(r.turnosNecessarios).toBe(10);
    expect(r.turnosFeitos).toBe(2);
  });

  it('sem transcript no registro, turnosFeitos é null — e a decisão não muda', () => {
    const r = avaliarAcessoSemana(base([{ semana: 1, status: 'em_andamento' }]));
    expect(r.liberada).toBe(false);
    expect(r.turnosFeitos).toBeNull();
  });

  it('progresso ausente da semana anterior conta como não concluída', () => {
    const r = avaliarAcessoSemana(base([]));
    expect(r.liberada).toBe(false);
    expect(r.semanaPendente).toBe(1);
  });

  it('espelho do piloto: `calendario_semana` governa a liberação por data', () => {
    const planoPiloto = [
      { semana: 1, tipo: 'conteudo' },
      { semana: 2, tipo: 'conteudo' },
      // fechamento herda o calendário da semana 2
      { semana: 3, tipo: 'avaliacao', calendario_semana: 2 },
    ];
    const r = avaliarAcessoSemana({
      dataInicio: '2026-08-17', // semana 2 libera 24/08 — ainda não chegou
      plano: planoPiloto,
      progresso: [{ semana: 2, status: 'concluido' }],
      semana: 3,
      now: AGORA,
    });
    expect(r.liberada).toBe(false);
    expect(r.motivo).toBe('data');
  });

  it('aceita progresso como MAPA por semana, não só array', () => {
    const r = avaliarAcessoSemana({
      ...base([]),
      progresso: { 1: { semana: 1, status: 'concluido' } },
    });
    expect(r.liberada).toBe(true);
  });
});

describe('turnosIaNecessarios / slotDaConversa', () => {
  it('semana 13 (qualitativa) conta 12 turnos de IA, sem dividir por 2', () => {
    expect(turnosIaNecessarios(13, 'avaliacao')).toBe(12);
  });

  it('conteúdo = 6; aplicação prática = 10; aplicação por cenário = 10', () => {
    expect(turnosIaNecessarios(2, 'conteudo')).toBe(6);
    expect(turnosIaNecessarios(4, 'aplicacao', 'pratica')).toBe(10);
    expect(turnosIaNecessarios(4, 'aplicacao', 'cenario')).toBe(10);
  });

  it('a conversa mora em `feedback` na aplicação e na 14; em `reflexao` no resto', () => {
    expect(slotDaConversa(4, 'aplicacao')).toBe('feedback');
    expect(slotDaConversa(14, 'avaliacao')).toBe('feedback');
    expect(slotDaConversa(13, 'avaliacao')).toBe('reflexao');
    expect(slotDaConversa(2, 'conteudo')).toBe('reflexao');
  });
});
