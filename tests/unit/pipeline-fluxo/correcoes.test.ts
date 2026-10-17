import { describe, it, expect } from 'vitest';
import {
  MAX_CORRECOES, dentroDoEscopo, passadoPode, selecionarCorrecaoIA4, selecionarAuditoria, selecionarCorrecaoPdi,
  selecionarPdiDesatualizado, selecionarTrilhaDesatualizada, melhorVersaoPdi,
} from '@/lib/pipeline-fluxo/correcoes';

/**
 * As filas das CORREÇÕES do fluxo (17/10/2026). O que elas precisam garantir, e o que quebraria em silêncio:
 *  - sem a empresa pausada, só o que ESTA rodada gerou (o fluxo não revisita o que já pode ter sido entregue);
 *  - pausada, também o reprovado de rodadas anteriores, mas só o que nasceu DEPOIS do início da pausa e de quem ainda
 *    não teve o PDI anunciado (a Ibipeba estava pausada com a 1ª temporada entregue);
 *  - o teto de tentativas, contado no artefato, tira o item da fila (nenhuma execução paga a mesma correção sem fim);
 *  - conta interna e quem está fora do escopo nunca entram.
 */
const dentro = dentroDoEscopo(null, new Set(['interna']));
const PAUSA = '2026-10-17T20:31:57.967Z';
const ANTES = '2026-10-17T19:00:00Z';
const DEPOIS = '2026-10-17T21:00:00Z';
const pausada = { revisitarDesde: PAUSA };
const semPausa = { revisitarDesde: null };

describe('dentroDoEscopo e passadoPode', () => {
  it('fora: conta interna, id vazio e quem não está nos permitidos', () => {
    const d = dentroDoEscopo(new Set(['a', 'interna']), new Set(['interna']));
    expect(d('a')).toBe(true);
    expect(d('interna')).toBe(false);
    expect(d('b')).toBe(false);
    expect(d(null)).toBe(false);
  });
  it('o passado só entra pausado, nascido depois do início da pausa, de quem não teve o PDI anunciado', () => {
    expect(passadoPode(pausada, 'a', DEPOIS)).toBe(true);
    expect(passadoPode(pausada, 'a', ANTES)).toBe(false);
    expect(passadoPode(pausada, 'a', null)).toBe(false);
    expect(passadoPode(semPausa, 'a', DEPOIS)).toBe(false);
    expect(passadoPode({ ...pausada, entregues: new Set(['a']) }, 'a', DEPOIS)).toBe(false);
  });
});

describe('IA4: o "revisar" a corrigir', () => {
  const linhas = [
    { id: 'r1', colaborador_id: 'a', status_ia4: 'revisar', avaliado_em: DEPOIS, tentativas: null },
    { id: 'r2', colaborador_id: 'b', status_ia4: 'revisar', avaliado_em: DEPOIS, tentativas: 1 },
    { id: 'r3', colaborador_id: 'c', status_ia4: 'revisar', avaliado_em: DEPOIS, tentativas: MAX_CORRECOES },
    { id: 'r4', colaborador_id: 'd', status_ia4: 'aprovado_com_ajustes', avaliado_em: DEPOIS, tentativas: null },
    { id: 'r5', colaborador_id: 'interna', status_ia4: 'revisar', avaliado_em: DEPOIS, tentativas: null },
    { id: 'r6', colaborador_id: 'e', status_ia4: 'revisar', avaliado_em: ANTES, tentativas: null },
  ];
  it('sem pausa, só as respostas desta rodada (mesmo as de antes de uma pausa qualquer)', () => {
    expect(selecionarCorrecaoIA4(linhas, { dentro, alvo: ['r2', 'r6'], ...semPausa })).toEqual(['r2', 'r6']);
  });
  it('pausada: as nascidas sob a pausa e abaixo do teto; "com ajustes", interna e a de antes da pausa ficam', () => {
    expect(selecionarCorrecaoIA4(linhas, { dentro, alvo: [], ...pausada })).toEqual(['r1', 'r2']);
  });
});

describe('auditoria do blueprint: auditar e corrigir', () => {
  const linhas = [
    { colaborador_id: 'novo', auditado_em: null, gerado_em: DEPOIS, ok: null },
    { colaborador_id: 'reprov', auditado_em: DEPOIS, gerado_em: DEPOIS, ok: 'false', tentativas: null },
    { colaborador_id: 'teto', auditado_em: DEPOIS, gerado_em: DEPOIS, ok: 'false', tentativas: String(MAX_CORRECOES) },
    { colaborador_id: 'aprov', auditado_em: DEPOIS, gerado_em: DEPOIS, ok: 'true' },
    { colaborador_id: 'antigo', auditado_em: null, gerado_em: DEPOIS, ok: null },
    { colaborador_id: 'temporada1', auditado_em: ANTES, gerado_em: ANTES, ok: 'false' },
  ];
  it('sem pausa: o desta rodada sem auditoria e o desta rodada reprovado; o antigo não entra', () => {
    expect(selecionarAuditoria(linhas, { dentro, alvo: ['novo', 'reprov', 'aprov'], ...semPausa })).toEqual(['novo', 'reprov']);
  });
  it('pausada: também o nascido sob a pausa sem auditoria e o reprovado; o do teto, o aprovado e o de antes da pausa nunca', () => {
    expect(selecionarAuditoria(linhas, { dentro, alvo: [], ...pausada })).toEqual(['novo', 'reprov', 'antigo']);
  });
});

describe('PDI: o reprovado e o com alerta a refazer', () => {
  const linhas = [
    { colaborador_id: 'f', status: 'fail', gerado_em: DEPOIS }, { colaborador_id: 'w', status: 'warn', gerado_em: DEPOIS, tentativas: '1' },
    { colaborador_id: 'p', status: 'pass', gerado_em: DEPOIS }, { colaborador_id: 't', status: 'fail', gerado_em: DEPOIS, tentativas: String(MAX_CORRECOES) },
    { colaborador_id: 'velho', status: 'fail', gerado_em: ANTES },
  ];
  it('sem pausa só o desta rodada; pausada todos os nascidos sob a pausa abaixo do teto (aprovado nunca)', () => {
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: ['w', 'p'], ...semPausa })).toEqual(['w']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: [], ...pausada })).toEqual(['f', 'w']);
  });
  it('o reprovado de quem já teve o PDI anunciado fica de fora; o desta rodada entra mesmo assim', () => {
    const entregues = new Set(['f']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: [], ...pausada, entregues })).toEqual(['w']);
    expect(selecionarCorrecaoPdi(linhas, { dentro, alvo: ['f'], ...pausada, entregues })).toEqual(['f', 'w']);
  });
});

describe('cascata (empresa pausada)', () => {
  // Só o blueprint que ESTA automação corrigiu (`cascata: 'true'`) puxa PDI e trilha. Medido 17/10/2026: sem a marca, a
  // Amazon (corrigida à mão, cascata já feita por script) teria 14 trilhas e 4 PDIs refeitos à toa, e a Ibipeba (pausada,
  // 1ª temporada entregue) 38 PDIs.
  const C = '2026-10-17T22:00:00Z';
  it('PDI nascido sob a pausa e mais velho que a correção automática entra; sem marca, mais novo, anterior à pausa ou anunciado, não', () => {
    const pdis = [
      { colaborador_id: 'a', gerado_em: DEPOIS }, { colaborador_id: 'novo', gerado_em: '2026-10-17T23:00:00Z' },
      { colaborador_id: 'semmarca', gerado_em: DEPOIS }, { colaborador_id: 'anunciado', gerado_em: DEPOIS },
      { colaborador_id: 'temporada1', gerado_em: ANTES },
    ];
    const bps = ['a', 'novo', 'anunciado', 'temporada1'].map((id) => ({ colaborador_id: id, cascata: 'true', corrigido_em: C }))
      .concat([{ colaborador_id: 'semmarca', cascata: null as any, corrigido_em: C }]);
    expect(selecionarPdiDesatualizado(pdis, bps, dentro, { ...pausada, entregues: new Set(['anunciado']) })).toEqual(['a']);
    expect(selecionarPdiDesatualizado(pdis, bps, dentro, semPausa)).toEqual([]);
  });
  it('trilha: só a que nasceu sob a pausa e não começou, de blueprint corrigido por esta automação depois dela, uma vez', () => {
    const hojeISO = '2026-10-17T23:30:00Z';
    const t = (colaborador_id: string, criado_em: string, data_inicio = '2026-10-19') => ({ colaborador_id, criado_em, data_inicio });
    const trilhas = [
      t('velha', DEPOIS), t('nova', '2026-10-17T23:00:00Z'), t('refeita', DEPOIS), t('semmarca', DEPOIS),
      t('comecou', DEPOIS, '2026-10-12'), t('anunciado', DEPOIS), t('temporada1', ANTES),
    ];
    const bps = [
      { colaborador_id: 'velha', cascata: 'true', corrigido_em: C, trilha_refeita_em: null },
      { colaborador_id: 'nova', cascata: 'true', corrigido_em: C, trilha_refeita_em: null },
      { colaborador_id: 'refeita', cascata: 'true', corrigido_em: C, trilha_refeita_em: '2026-10-17T22:30:00Z' },
      { colaborador_id: 'semmarca', corrigido_em: C },
      { colaborador_id: 'comecou', cascata: 'true', corrigido_em: C },
      { colaborador_id: 'anunciado', cascata: 'true', corrigido_em: C },
      { colaborador_id: 'temporada1', cascata: 'true', corrigido_em: C },
    ];
    expect(selecionarTrilhaDesatualizada(trilhas, bps, dentro, { ...pausada, entregues: new Set(['anunciado']), hojeISO })).toEqual(['velha']);
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
