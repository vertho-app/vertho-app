import { describe, expect, it } from 'vitest';
import {
  JANELA_ABERTA, dentroDaJanela, janelasDasParticipacoes, janelaTemCorte, participacaoConta,
  respondeuNaJanela, trilhaDaParticipacao, type ParticipacaoLinha,
} from '@/lib/turmas/janela';

/**
 * O defeito de 07/10/2026 (Ibipeba): passar as 53 pessoas para a turma "Temporada 2"
 * fez a turma nova nascer com 41/53 respondidos, 40/53 avaliados e 39/53 jornadas
 * (a vida inteira de cada pessoa), e a turma antiga ficou com 0. Aqui trava a
 * régua que separa as jornadas: participação com marco ABRE uma jornada; sem marco
 * CONTINUA a que estava em curso (o desmembramento de Macaé não pode mudar de número).
 */

const MARCO = '2026-10-07T12:22:33.000Z';
const ANTES = '2026-09-04T16:18:00.000Z';
const DEPOIS = '2026-10-08T10:00:00.000Z';

const antiga = (extra: Partial<ParticipacaoLinha> = {}): ParticipacaoLinha => ({
  id: 'p-antiga', turma_id: 'T1', colaborador_id: 'ana', status: 'concluido',
  created_at: '2026-08-13T03:24:44.000Z', marco_jornada: null, ...extra,
});
const nova = (extra: Partial<ParticipacaoLinha> = {}): ParticipacaoLinha => ({
  id: 'p-nova', turma_id: 'T2', colaborador_id: 'ana', status: 'ativo',
  created_at: MARCO, marco_jornada: MARCO, ...extra,
});

describe('janela da participação: onde uma jornada acaba e a outra começa', () => {
  it('Ibipeba: a antiga vai até o marco da nova, a nova começa nele', () => {
    const j = janelasDasParticipacoes([antiga(), nova()]);
    expect(j.get('p-antiga')).toEqual({ de: null, ate: Date.parse(MARCO) });
    expect(j.get('p-nova')).toEqual({ de: Date.parse(MARCO), ate: null });
  });

  it('CONTROLE (Macaé): participação sem marco não corta nada; conta por pessoa como antes', () => {
    // 1ª turma (removido, ignorada na sequência) e 2ª turma por desmembramento, sem marco.
    const j = janelasDasParticipacoes([
      antiga({ status: 'removido' }),
      nova({ marco_jornada: null }),
    ]);
    expect(j.get('p-nova')).toEqual({ de: null, ate: null });
    expect(janelaTemCorte(j.get('p-nova')!)).toBe(false);
    expect(j.has('p-antiga')).toBe(false); // removido não entra na sequência
  });

  it('participação sem marco DEPOIS de uma com marco herda o início daquela jornada', () => {
    // A pessoa abriu jornada nova em T2 e, depois, T2 foi desmembrada (sem marco em T3).
    const j = janelasDasParticipacoes([
      antiga(),
      nova({ status: 'concluido' }),
      { id: 'p-t3', turma_id: 'T3', colaborador_id: 'ana', status: 'ativo', created_at: DEPOIS, marco_jornada: null },
    ]);
    expect(j.get('p-t3')).toEqual({ de: Date.parse(MARCO), ate: null });
    // E a primeira continua parando no marco, não depois da terceira.
    expect(j.get('p-antiga')!.ate).toBe(Date.parse(MARCO));
    expect(j.get('p-nova')!.ate).toBeNull();
  });

  it('uma participação removida COM marco não corta o histórico de ninguém', () => {
    const j = janelasDasParticipacoes([antiga(), nova({ status: 'removido' })]);
    expect(j.get('p-antiga')).toEqual({ de: null, ate: null });
  });

  it('cada pessoa tem a sua sequência: o marco de uma não vaza para a outra', () => {
    const j = janelasDasParticipacoes([
      antiga(), nova(),
      antiga({ id: 'b-antiga', colaborador_id: 'bia' }),
    ]);
    expect(j.get('b-antiga')).toEqual({ de: null, ate: null });
  });

  it('só ativo e concluído contam como participação', () => {
    expect(participacaoConta('ativo')).toBe(true);
    expect(participacaoConta('concluido')).toBe(true);
    expect(participacaoConta('removido')).toBe(false);
  });
});

describe('dentroDaJanela', () => {
  const j = { de: Date.parse(MARCO), ate: null };

  it('sem corte vale qualquer instante, até o ausente (conta antiga por pessoa)', () => {
    expect(dentroDaJanela(null, JANELA_ABERTA)).toBe(true);
    expect(dentroDaJanela(ANTES, JANELA_ABERTA)).toBe(true);
  });

  it('com corte, instante ausente ou ilegível NÃO entra', () => {
    expect(dentroDaJanela(null, j)).toBe(false);
    expect(dentroDaJanela('não é data', j)).toBe(false);
  });

  it('o início é inclusivo e o fim é exclusivo: nenhum instante cai nas duas jornadas', () => {
    const velha = { de: null, ate: Date.parse(MARCO) };
    expect(dentroDaJanela(MARCO, j)).toBe(true);
    expect(dentroDaJanela(MARCO, velha)).toBe(false);
    expect(dentroDaJanela(ANTES, velha)).toBe(true);
    expect(dentroDaJanela(ANTES, j)).toBe(false);
  });
});

describe('o que a turma nova enxerga da pessoa', () => {
  const velha = { de: null, ate: Date.parse(MARCO) };
  const atual = { de: Date.parse(MARCO), ate: null };
  const respostas = [
    { colaborador_id: 'ana', nivel_ia4: 3, timestamp_resposta: ANTES },
    { colaborador_id: 'ana', nivel_ia4: null, timestamp_resposta: DEPOIS },
  ];

  it('a resposta e a nota antigas ficam na turma antiga; a nova nasce zerada', () => {
    expect(respondeuNaJanela([respostas[0]], velha)).toEqual({ respondeu: true, avaliado: true });
    expect(respondeuNaJanela([respostas[0]], atual)).toEqual({ respondeu: false, avaliado: false });
  });

  it('a nota de uma resposta ANTIGA não faz a jornada nova parecer avaliada', () => {
    // Respondeu de novo depois do marco, ainda sem IA4; a nota de antes não conta.
    expect(respondeuNaJanela(respostas, atual)).toEqual({ respondeu: true, avaliado: false });
  });

  it('sem corte, tudo conta (a conta de sempre)', () => {
    expect(respondeuNaJanela(respostas, JANELA_ABERTA)).toEqual({ respondeu: true, avaliado: true });
  });

  it('o instante da resposta cai para created_at quando falta o carimbo de resposta', () => {
    expect(respondeuNaJanela([{ nivel_ia4: 2, created_at: DEPOIS }], atual)).toEqual({ respondeu: true, avaliado: true });
  });
});

describe('trilhaDaParticipacao', () => {
  const trilhaAntiga = { id: 't1', turma_membro_id: 'p-antiga', criado_em: '2026-07-13T00:00:00.000Z', data_inicio: '2026-07-13' };
  const trilhaNova = { id: 't2', turma_membro_id: 'p-nova', criado_em: DEPOIS, data_inicio: '2026-10-26' };
  const legada = { id: 't0', turma_membro_id: null, criado_em: '2026-06-01T00:00:00.000Z' };
  const velha = { de: null, ate: Date.parse(MARCO) };
  const atual = { de: Date.parse(MARCO), ate: null };

  it('com corte, cada participação enxerga só a trilha carimbada com ela', () => {
    expect(trilhaDaParticipacao('p-antiga', velha, [trilhaAntiga])?.id).toBe('t1');
    expect(trilhaDaParticipacao('p-nova', atual, [trilhaAntiga])).toBeNull();
    expect(trilhaDaParticipacao('p-nova', atual, [trilhaAntiga, trilhaNova])?.id).toBe('t2');
  });

  it('trilha legada (sem carimbo) só entra se nasceu dentro da janela', () => {
    expect(trilhaDaParticipacao('p-antiga', velha, [legada])?.id).toBe('t0');
    expect(trilhaDaParticipacao('p-nova', atual, [legada])).toBeNull();
  });

  it('CONTROLE: sem corte, qualquer trilha da pessoa conta, como antes', () => {
    expect(trilhaDaParticipacao('p-qualquer', JANELA_ABERTA, [trilhaAntiga])?.id).toBe('t1');
  });

  it('havendo mais de uma na janela, vale a mais recente', () => {
    const outra = { ...trilhaAntiga, id: 't1b', criado_em: '2026-08-01T00:00:00.000Z' };
    expect(trilhaDaParticipacao('p-antiga', velha, [trilhaAntiga, outra])?.id).toBe('t1b');
  });
});
