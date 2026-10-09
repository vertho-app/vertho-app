import { describe, expect, it } from 'vitest';
import { artefatoDaJornadaAtual, escolherJornadaAtual } from '@/lib/turmas/jornada-atual';
import { JANELA_ABERTA } from '@/lib/turmas/janela';

/**
 * A jornada ATUAL é a da participação ativa (09/10/2026). O caso que originou a
 * regra: Ibipeba abriu a Temporada 2 numa turma nova (participação com marco), e a
 * home e a tela da temporada seguiam lendo "a trilha mais recente da pessoa", que
 * era a da Temporada 1. Quem tinha concluído via 100%; quem não tinha voltava
 * para as semanas 8 e 9; o mapeamento novo só se achava pelo link do WhatsApp.
 */

const MARCO = '2026-10-07T12:22:33Z';
const turma1 = { id: 'p1', turma_id: 't1', colaborador_id: 'helmar', status: 'concluido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null };
const turma2 = { id: 'p2', turma_id: 't2', colaborador_id: 'helmar', status: 'ativo', created_at: MARCO, marco_jornada: MARCO };
const trilhaT1 = { id: 'tr1', criado_em: '2026-07-13T14:00:47Z', turma_membro_id: 'p1', status: 'concluida' };

describe('escolherJornadaAtual', () => {
  it('sem participação ativa, é a trilha mais recente da pessoa (a conta de sempre)', () => {
    const antiga = { id: 'a', criado_em: '2026-06-01T00:00:00Z', turma_membro_id: null };
    const nova = { id: 'b', criado_em: '2026-09-01T00:00:00Z', turma_membro_id: null };
    const r = escolherJornadaAtual([], [antiga, nova]);
    expect(r.trilha?.id).toBe('b');
    expect(r.participacaoId).toBeNull();
    expect(r.janela).toEqual(JANELA_ABERTA);
    expect(r.temJornadaAnterior).toBe(false);
  });

  it('turma SEM marco (Macaé) não muda nada: a mais recente, mesmo carimbada com outra participação', () => {
    const p = { ...turma2, marco_jornada: null };
    const r = escolherJornadaAtual([turma1, p], [trilhaT1]);
    expect(r.trilha?.id).toBe('tr1');
    expect(r.temJornadaAnterior).toBe(false);
  });

  it('marco na participação ativa e só a trilha da jornada anterior: NÃO há trilha atual', () => {
    const r = escolherJornadaAtual([turma1, turma2], [trilhaT1]);
    expect(r.trilha).toBeNull();
    expect(r.participacaoId).toBe('p2');
    expect(r.temJornadaAnterior).toBe(true);
    expect(r.janela.de).toBe(Date.parse(MARCO));
  });

  it('marco e trilha nova carimbada com a participação ativa: a nova, não a mais recente de todas', () => {
    const t2 = { id: 'tr2', criado_em: '2026-10-20T10:00:00Z', turma_membro_id: 'p2', status: 'ativa' };
    // trilha da jornada 1 "mais recente" por criado_em (regerada depois): continua de fora
    const t1Regerada = { ...trilhaT1, id: 'tr1b', criado_em: '2026-10-25T00:00:00Z' };
    const r = escolherJornadaAtual([turma1, turma2], [trilhaT1, t1Regerada, t2]);
    expect(r.trilha?.id).toBe('tr2');
    expect(r.temJornadaAnterior).toBe(true);
  });

  it('trilha legada sem carimbo conta só se nasceu dentro da janela', () => {
    const legadaAntes = { id: 'l1', criado_em: '2026-09-01T00:00:00Z', turma_membro_id: null };
    const legadaDepois = { id: 'l2', criado_em: '2026-10-08T00:00:00Z', turma_membro_id: null };
    expect(escolherJornadaAtual([turma1, turma2], [legadaAntes]).trilha).toBeNull();
    expect(escolherJornadaAtual([turma1, turma2], [legadaAntes, legadaDepois]).trilha?.id).toBe('l2');
  });

  it('participação REMOVIDA não abre jornada (quem saiu por engano não corta o histórico)', () => {
    const removida = { ...turma2, status: 'removido' };
    const r = escolherJornadaAtual([{ ...turma1, status: 'ativo' }, removida], [trilhaT1]);
    expect(r.trilha?.id).toBe('tr1');
  });
});

describe('artefatoDaJornadaAtual (PDI, blueprint)', () => {
  const janela = { de: Date.parse(MARCO), ate: null };
  it('PDI de antes do marco não vale para a jornada atual', () => {
    expect(artefatoDaJornadaAtual('2026-07-07T00:00:00Z', janela)).toBe(false);
  });
  it('PDI gerado depois do marco vale', () => {
    expect(artefatoDaJornadaAtual('2026-10-20T00:00:00Z', janela)).toBe(true);
  });
  it('sem corte (sem turma ou sem marco), vale sempre', () => {
    expect(artefatoDaJornadaAtual('2026-01-01T00:00:00Z', JANELA_ABERTA)).toBe(true);
  });
});
