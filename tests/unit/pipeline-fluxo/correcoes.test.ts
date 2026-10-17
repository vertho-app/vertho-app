import { describe, it, expect } from 'vitest';
import {
  MAX_CORRECOES, dentroDoEscopo, selecionarCorrecaoIA4, selecionarAuditoria, selecionarCorrecaoPdi,
  selecionarPdiDesatualizado, selecionarTrilhaDesatualizada, melhorVersaoPdi,
} from '@/lib/pipeline-fluxo/correcoes';

/**
 * As filas das CORREÇÕES do fluxo (17/10/2026). O que elas precisam garantir, e o que quebraria em silêncio:
 *  - sem a empresa pausada, só o que ESTA rodada gerou (o fluxo não revisita o que já pode ter sido entregue);
 *  - pausada, também o reprovado de rodadas anteriores (decisão do dono);
 *  - o teto de tentativas, contado no artefato, tira o item da fila (nenhuma execução paga a mesma correção sem fim);
 *  - conta interna e quem está fora do escopo nunca entram.
 */
const dentro = dentroDoEscopo(null, new Set(['interna']));

describe('dentroDoEscopo', () => {
  it('fora: conta interna, id vazio e quem não está nos permitidos', () => {
    const d = dentroDoEscopo(new Set(['a', 'interna']), new Set(['interna']));
    expect(d('a')).toBe(true);
    expect(d('interna')).toBe(false);
    expect(d('b')).toBe(false);
    expect(d(null)).toBe(false);
  });
});

describe('IA4: o "revisar" a corrigir', () => {
  const linhas = [
    { id: 'r1', colaborador_id: 'a', status_ia4: 'revisar', tentativas: null },
    { id: 'r2', colaborador_id: 'b', status_ia4: 'revisar', tentativas: 1 },
    { id: 'r3', colaborador_id: 'c', status_ia4: 'revisar', tentativas: MAX_CORRECOES },
    { id: 'r4', colaborador_id: 'd', status_ia4: 'aprovado_com_ajustes', tentativas: null },
    { id: 'r5', colaborador_id: 'interna', status_ia4: 'revisar', tentativas: null },
  ];
  it('sem pausa, só as respostas desta rodada', () => {
    expect(selecionarCorrecaoIA4(linhas, { dentro, alvo: ['r2'], revisitar: false })).toEqual(['r2']);
  });
  it('pausada, todas abaixo do teto; "com ajustes" fica; interna fica de fora', () => {
    expect(selecionarCorrecaoIA4(linhas, { dentro, alvo: [], revisitar: true })).toEqual(['r1', 'r2']);
  });
});

describe('auditoria do blueprint: auditar e corrigir', () => {
  const linhas = [
    { colaborador_id: 'novo', auditado_em: null, ok: null },
    { colaborador_id: 'reprov', auditado_em: '2026-10-17T20:00:00Z', ok: 'false', tentativas: null },
    { colaborador_id: 'teto', auditado_em: '2026-10-17T20:00:00Z', ok: 'false', tentativas: String(MAX_CORRECOES) },
    { colaborador_id: 'aprov', auditado_em: '2026-10-17T20:00:00Z', ok: 'true' },
    { colaborador_id: 'antigo', auditado_em: null, ok: null },
  ];
  it('sem pausa: o desta rodada sem auditoria e o desta rodada reprovado; o antigo não entra', () => {
    expect(selecionarAuditoria(linhas, { dentro, alvo: ['novo', 'reprov', 'aprov'], revisitar: false })).toEqual(['novo', 'reprov']);
  });
  it('pausada: também o antigo sem auditoria e o reprovado de antes; o do teto e o aprovado nunca', () => {
    expect(selecionarAuditoria(linhas, { dentro, alvo: [], revisitar: true })).toEqual(['novo', 'reprov', 'antigo']);
  });
});

describe('PDI: o reprovado e o com alerta a refazer', () => {
  const linhas = [
    { colaborador_id: 'f', status: 'fail' }, { colaborador_id: 'w', status: 'warn', tentativas: '1' },
    { colaborador_id: 'p', status: 'pass' }, { colaborador_id: 't', status: 'fail', tentativas: String(MAX_CORRECOES) },
  ];
  it('sem pausa só o desta rodada; pausada todos abaixo do teto (aprovado nunca)', () => {
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: ['w', 'p'], revisitar: false })).toEqual(['w']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: [], revisitar: true })).toEqual(['f', 'w']);
  });
});

describe('cascata (empresa pausada)', () => {
  // Só o blueprint que ESTA automação corrigiu (`cascata: 'true'`) puxa PDI e trilha. Medido 17/10/2026: sem a marca, a
  // Amazon (corrigida à mão, cascata já feita por script) teria 14 trilhas e 4 PDIs refeitos à toa, e a Ibipeba (pausada,
  // 1ª temporada entregue) 38 PDIs.
  const C = '2026-10-17T21:00:00Z';
  it('PDI mais velho que a correção automática entra; sem a marca, mais novo, ou já anunciado, não', () => {
    const pdis = [
      { colaborador_id: 'a', gerado_em: '2026-10-17T18:00:00Z' },
      { colaborador_id: 'novo', gerado_em: '2026-10-17T22:00:00Z' },
      { colaborador_id: 'semmarca', gerado_em: '2026-10-17T18:00:00Z' },
      { colaborador_id: 'anunciado', gerado_em: '2026-10-17T18:00:00Z' },
    ];
    const bps = [
      { colaborador_id: 'a', cascata: 'true', corrigido_em: C },
      { colaborador_id: 'novo', cascata: 'true', corrigido_em: C },
      { colaborador_id: 'semmarca', cascata: null, corrigido_em: C },
      { colaborador_id: 'anunciado', cascata: 'true', corrigido_em: C },
    ];
    expect(selecionarPdiDesatualizado(pdis, bps, dentro, new Set(['anunciado']))).toEqual(['a']);
  });
  it('trilha: só a que ainda não começou, de blueprint corrigido por esta automação depois de ela nascer, uma vez', () => {
    const hojeISO = '2026-10-17T23:00:00Z';
    const t = (colaborador_id: string, criado_em: string, data_inicio = '2026-10-19') => ({ colaborador_id, criado_em, data_inicio });
    const trilhas = [
      t('velha', '2026-10-17T18:00:00Z'), t('nova', '2026-10-17T23:30:00Z'), t('refeita', '2026-10-17T18:00:00Z'),
      t('semmarca', '2026-10-17T18:00:00Z'), t('comecou', '2026-10-17T18:00:00Z', '2026-10-12'), t('anunciado', '2026-10-17T18:00:00Z'),
    ];
    const bps = [
      { colaborador_id: 'velha', cascata: 'true', corrigido_em: C, trilha_refeita_em: null },
      { colaborador_id: 'nova', cascata: 'true', corrigido_em: C, trilha_refeita_em: null },
      { colaborador_id: 'refeita', cascata: 'true', corrigido_em: C, trilha_refeita_em: '2026-10-17T21:30:00Z' },
      { colaborador_id: 'semmarca', corrigido_em: C },
      { colaborador_id: 'comecou', cascata: 'true', corrigido_em: C },
      { colaborador_id: 'anunciado', cascata: 'true', corrigido_em: C },
    ];
    expect(selecionarTrilhaDesatualizada(trilhas, bps, dentro, { entregues: new Set(['anunciado']), hojeISO })).toEqual(['velha']);
  });
});

describe('o passado não se revisita para quem já recebeu o PDI', () => {
  it('pausada: o reprovado de quem já teve o PDI anunciado fica de fora; o desta rodada entra mesmo assim', () => {
    const linhas = [{ colaborador_id: 'anunciado', status: 'fail' }, { colaborador_id: 'livre', status: 'fail' }];
    const entregues = new Set(['anunciado']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: [], revisitar: true, entregues })).toEqual(['livre']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: ['anunciado'], revisitar: true, entregues })).toEqual(['anunciado', 'livre']);
    const bps = [{ colaborador_id: 'anunciado', auditado_em: 'x', ok: 'false' }, { colaborador_id: 'livre', auditado_em: 'x', ok: 'false' }];
    expect(selecionarAuditoria(bps, { dentro, alvo: [], revisitar: true, entregues })).toEqual(['livre']);
    const resp = [{ id: 'r1', colaborador_id: 'anunciado', status_ia4: 'revisar' }, { id: 'r2', colaborador_id: 'livre', status_ia4: 'revisar' }];
    expect(selecionarCorrecaoIA4(resp, { dentro, alvo: [], revisitar: true, entregues })).toEqual(['r2']);
  });
});

describe('melhor versão do PDI', () => {
  const v = (status: string, ocorr = 1) => ({ conteudo: { auditoria: { status, checks: [{ status: status === 'pass' ? 'pass' : 'fail', ocorrencias: Array(ocorr).fill('x') }] } } });
  it('pass vence warn, warn vence fail, nos dois sentidos', () => {
    const p = v('pass'); const w = v('warn'); const f = v('fail');
    expect(melhorVersaoPdi(f, w)).toBe(w);
    expect(melhorVersaoPdi(w, f)).toBe(w);
    expect(melhorVersaoPdi(w, p)).toBe(p);
  });
  it('empate: a de menos ocorrências; empate de novo, fica a atual', () => {
    const a = v('warn', 3); const b = v('warn', 1); const c = v('warn', 3);
    expect(melhorVersaoPdi(a, b)).toBe(b);
    expect(melhorVersaoPdi(a, c)).toBe(a);
  });
});
