import { describe, it, expect } from 'vitest';
import {
  janelasDoDia, temTrabalhoHoje, decidirPosFim, diasBaseDaCadencia,
  JANELA_RECUPERACAO_DIAS, SEMANAS_DE_PENDENCIA_POS_FIM,
} from '@/lib/fase4/janelas';
import { carimboDesde, canalPendente, pilulaPendente } from '@/lib/notifications/carimbo-canal';

/**
 * R-94 (04/10/2026): as janelas da cadência. A cadência só agia no dia exato de cada
 * papel; envio que falhava no dia nunca era refeito, e quem ficava atrasado recebia
 * "concluído" na quinta em que o relógio passava do fim do plano.
 *
 * Datas de novembro de 2026 (sem feriado nacional na semana de 9/11) e de setembro
 * (a semana do feriado de 7/9, segunda).
 */

const SEM_CONFIG = {};
// 9/11/2026 é segunda. Cadência padrão: P1 segunda, P2 terça, evidência quinta.
const DIA = { seg: ['2026-11-09', 1], ter: ['2026-11-10', 2], qua: ['2026-11-11', 3], qui: ['2026-11-12', 4], sex: ['2026-11-13', 5], sab: ['2026-11-14', 6], dom: ['2026-11-15', 0] } as const;
const j = (d: readonly [string, number], cfg: any = SEM_CONFIG) => janelasDoDia(cfg, d[0], d[1]);

describe('janelasDoDia: o dia agendado e a recuperação', () => {
  it('nos dias agendados só roda o papel do dia, e NUNCA recupera (a pessoa não recebe dois contatos)', () => {
    expect(j(DIA.seg)).toEqual({ agendados: ['p1'], recuperando: [] });
    expect(j(DIA.ter)).toEqual({ agendados: ['p2'], recuperando: [] });
    expect(j(DIA.qui)).toEqual({ agendados: ['ev'], recuperando: [] });
  });

  it('🔴 quarta (dia livre): refaz a P2 de ontem (atraso 1) e a P1 de segunda (atraso 2), com a data de cada um', () => {
    const r = j(DIA.qua);
    expect(r.agendados).toEqual([]);
    expect(r.recuperando).toEqual([
      { slot: 'p2', atrasoDias: 1, desdeUTC: '2026-11-10' },
      { slot: 'p1', atrasoDias: 2, desdeUTC: '2026-11-09' },
    ]);
  });

  it('🔴 sexta e sábado refazem a evidência de quinta; domingo e o resto da semana não têm nada', () => {
    expect(j(DIA.sex).recuperando).toEqual([{ slot: 'ev', atrasoDias: 1, desdeUTC: '2026-11-12' }]);
    expect(j(DIA.sab).recuperando).toEqual([{ slot: 'ev', atrasoDias: 2, desdeUTC: '2026-11-12' }]);
    expect(j(DIA.dom)).toEqual({ agendados: [], recuperando: [] });
  });

  it('a janela é de 2 dias: no terceiro dia o papel não volta', () => {
    expect(JANELA_RECUPERACAO_DIAS).toBe(2);
    // Domingo 15/11 é +3 da quinta.
    expect(temTrabalhoHoje(SEM_CONFIG, '2026-11-15', 0)).toBe(false);
  });

  it('o filtro do dispatcher enxerga os dias de recuperação (era só o dia agendado)', () => {
    expect(temTrabalhoHoje(SEM_CONFIG, ...(DIA.qua as unknown as [string, number]))).toBe(true);
    expect(temTrabalhoHoje(SEM_CONFIG, ...(DIA.sex as unknown as [string, number]))).toBe(true);
    expect(temTrabalhoHoje(SEM_CONFIG, ...(DIA.dom as unknown as [string, number]))).toBe(false);
  });

  it('a cadência da empresa vale: P1 na terça, P2 na quarta, evidência na sexta', () => {
    const cfg = { fase4_dia_pilula: 2, fase4_dia_pilula2: 3, fase4_dia_evidencia: 5 };
    expect(diasBaseDaCadencia(cfg)).toEqual({ diaP1: 2, diaP2: 3, diaEv: 5 });
    expect(j(DIA.qua, cfg).agendados).toEqual(['p2']);
    expect(j(DIA.qui, cfg).recuperando).toEqual([
      { slot: 'p2', atrasoDias: 1, desdeUTC: '2026-11-11' },
      { slot: 'p1', atrasoDias: 2, desdeUTC: '2026-11-10' },
    ]);
  });

  it('🔴 feriado nacional: o papel deslocado é recuperado a partir do dia DESLOCADO, não do dia da config', () => {
    // 7/9/2026 (segunda) é feriado: P1 vai para terça (8/9), P2 para quarta (9/9), evidência intacta (quinta).
    const ter = janelasDoDia(SEM_CONFIG, '2026-09-08', 2);
    expect(ter.agendados).toEqual(['p1']);
    const qua = janelasDoDia(SEM_CONFIG, '2026-09-09', 3);
    expect(qua.agendados).toEqual(['p2']);
    // Sexta 11/9: a evidência de quinta (atraso 1) e a P2 deslocada de quarta (atraso 2).
    const sex = janelasDoDia(SEM_CONFIG, '2026-09-11', 5);
    expect(sex.recuperando).toEqual([
      { slot: 'ev', atrasoDias: 1, desdeUTC: '2026-09-10' },
      { slot: 'p2', atrasoDias: 2, desdeUTC: '2026-09-09' },
    ]);
    // O dia do feriado em si não tem papel agendado (a P1 andou), e não recupera nada da semana anterior.
    const seg = janelasDoDia(SEM_CONFIG, '2026-09-07', 1);
    expect(seg.agendados).toEqual([]);
  });
});

describe('carimboDesde / canalPendente / pilulaPendente: "já saiu" é desde a data do papel', () => {
  it('carimbo de segunda conta como entregue na quarta, para o papel de segunda', () => {
    expect(carimboDesde('2026-11-09T11:05:00Z', '2026-11-09')).toBe(true);
    expect(carimboDesde('2026-11-10T11:05:00Z', '2026-11-09')).toBe(true);
    expect(carimboDesde('2026-11-08T11:05:00Z', '2026-11-09')).toBe(false);
    expect(carimboDesde(null, '2026-11-09')).toBe(false);
  });

  it('🔴 sem janela o teste é o de sempre (só hoje); com janela, o canal da semana passada pende', () => {
    expect(canalPendente(true, '2026-11-09T11:00:00Z', '2026-11-11')).toBe(true);
    expect(canalPendente(true, '2026-11-09T11:00:00Z', '2026-11-11', '2026-11-09')).toBe(false);
    expect(canalPendente(true, '2026-11-02T11:00:00Z', '2026-11-11', '2026-11-09')).toBe(true);
    expect(canalPendente(false, null, '2026-11-11', '2026-11-09')).toBe(false);
  });

  it('a pílula só pende se ALGUM canal aplicável não saiu desde a data do papel', () => {
    const base = { temTelefone: true, temEmail: true, hojeUTC: '2026-11-11', desdeUTC: '2026-11-09' };
    // e-mail saiu na segunda, WhatsApp não: pende (é o caso que a recuperação existe para refazer)
    expect(pilulaPendente({ ...base, carimboEmail: '2026-11-09T11:00:00Z', carimboWhatsapp: null })).toBe(true);
    // os dois saíram: não pende
    expect(pilulaPendente({ ...base, carimboEmail: '2026-11-09T11:00:00Z', carimboWhatsapp: '2026-11-09T11:01:00Z' })).toBe(false);
  });
});

describe('decidirPosFim: o atrasado depois do fim do calendário', () => {
  const AGORA = Date.parse('2026-11-26T11:00:00Z');
  const dias = (n: number) => AGORA - n * 86_400_000;
  const base = {
    progressoConfiavel: true, trilhaAtiva: true, semanasConcluidas: 3, totalSemanas: 7,
    semanaPelaData: 9, ultimoAvisoEm: dias(14), agora: AGORA,
  };

  it('🔴 atrasado com trilha ativa e último aviso há 14 dias: pendência (antes era "concluído" e silêncio)', () => {
    expect(decidirPosFim(base)).toBe('pendencia');
  });

  it('entre as quinzenas espera, sem concluir', () => {
    expect(decidirPosFim({ ...base, ultimoAvisoEm: dias(7) })).toBe('aguardar');
    expect(decidirPosFim({ ...base, ultimoAvisoEm: dias(12) })).toBe('aguardar');
  });

  it('nunca avisado (sem carimbo): pendência na primeira quinta', () => {
    expect(decidirPosFim({ ...base, ultimoAvisoEm: null })).toBe('pendencia');
  });

  it('quem concluiu tudo é concluído, como sempre', () => {
    expect(decidirPosFim({ ...base, semanasConcluidas: 7 })).toBe('concluir');
  });

  it('trilha que não está ativa (pausada, concluída, arquivada) é concluída: não se cobra quem pausou', () => {
    expect(decidirPosFim({ ...base, trilhaAtiva: false })).toBe('concluir');
  });

  it('🔴 sem leitura confiável do progresso a decisão é a de antes: concluir (pendência por dado não lido é cobrar quem pode ter terminado)', () => {
    expect(decidirPosFim({ ...base, progressoConfiavel: false })).toBe('concluir');
    expect(decidirPosFim({ ...base, semanaPelaData: null })).toBe('concluir');
  });

  it('depois de 8 semanas além do plano o envio é concluído (a pendência não é eterna)', () => {
    expect(SEMANAS_DE_PENDENCIA_POS_FIM).toBe(8);
    expect(decidirPosFim({ ...base, semanaPelaData: 15 })).toBe('pendencia');
    expect(decidirPosFim({ ...base, semanaPelaData: 16 })).toBe('concluir');
  });
});
