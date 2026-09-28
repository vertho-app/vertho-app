/**
 * A-14 da revisão de 27/09/2026: a voz da pessoa simulada.
 *
 * A rota de voz usava `ELENCO.mentora.voz` (Aoede, feminina) com o portão da
 * narração: medido em 22/09, 7 sínteses para 4 falas, 3 reprovadas, e se a 3ª
 * reprovasse a rota devolvia 502 depois de pagar as três. Rafael e Bruno saíam
 * com voz feminina. Agora: voz própria por gênero do nome, UMA síntese, sem o
 * portão da narração.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vozDaPersona } from '@/lib/recepcao/voz-persona';
import { ELENCO, PESSOA_SIMULADA } from '@/lib/tts/elenco';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';

describe('A-14: voz pelo nome da pessoa simulada', () => {
  it('todas as pessoas dos 15 casos publicados: Rafael e Bruno masculinas, o resto feminina', () => {
    const pessoas = [...catalogoInicial, ...catalogoDesafiador, ...catalogoLimites].flatMap((c) => [c.paciente, ...(c.variantes || [])]);
    const porNome = Object.fromEntries(pessoas.map((p) => [p.nome, vozDaPersona(p.nome)]));
    expect(porNome).toEqual({
      Marina: 'feminina', Lívia: 'feminina', Paula: 'feminina', Renata: 'feminina', Camila: 'feminina', Fernanda: 'feminina',
      Rafael: 'masculina', Bruno: 'masculina',
    });
  });

  it('terminações e exceções comuns do português', () => {
    for (const n of ['Raquel', 'Beatriz', 'Inês', 'Simone', 'Andréa', 'Maria Clara']) expect(vozDaPersona(n), n).toBe('feminina');
    for (const n of ['Daniel', 'Lucas', 'Felipe', 'João Pedro', 'Luca']) expect(vozDaPersona(n), n).toBe('masculina');
    expect(vozDaPersona('')).toBe('feminina');
  });

  it('as vozes da pessoa simulada são do catálogo do Gemini e não as da marca', () => {
    const marca = Object.values(ELENCO).map((p) => p.voz as string);
    expect(PESSOA_SIMULADA.feminina.voz).not.toBe(PESSOA_SIMULADA.masculina.voz);
    for (const g of ['feminina', 'masculina'] as const) {
      expect(marca).not.toContain(PESSOA_SIMULADA[g].voz);
      expect(PESSOA_SIMULADA[g].direcao).toContain(g === 'feminina' ? 'voz feminina' : 'voz masculina');
    }
  });
});

describe('A-14: rota de voz', () => {
  const mock = vi.hoisted(() => ({ auth: null as any, ctx: null as any, narrar: vi.fn() }));
  vi.mock('@/lib/auth/request-context', () => ({ requireUser: async () => mock.auth }));
  vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
  vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
  vi.mock('@/lib/gemini-tts', () => ({ generateNarrationAudio: mock.narrar }));
  vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn() }));
  vi.mock('@/lib/recepcao/access', async (original) => ({ ...(await original<any>()), contextoRecepcao: async () => mock.ctx }));
  const ID = '11111111-1111-4111-8111-111111111111';
  let estado: any;
  beforeEach(async () => {
    mock.auth = { email: 'teste@example.test', isPlatformAdmin: true };
    mock.narrar.mockReset().mockResolvedValue({ buffer: Buffer.from('audio'), contentType: 'audio/mpeg' });
    const { criarSupabaseMock } = await import('../helpers/supabase-mock');
    const sb = criarSupabaseMock({ resolver: (t) => (t === 'recepcao_sessoes' ? { id: ID, colaborador_id: null, estado } : null) });
    mock.ctx = { empresaId: 'empresa', ownerKey: 'admin:1', sb: sb.client };
  });
  const ouvir = async (nome: string) => {
    estado = { status: 'em_andamento', cenario: { versao: '3.3', paciente: { nome } }, historico: [{ id: 'm0', role: 'assistant', content: 'Não aceito espera.' }] };
    const { POST } = await import('@/app/api/recepcao/voz/route');
    const r = await POST(new Request(`https://local/api/recepcao/voz?acao=ouvir&sessaoId=${ID}&mensagemId=m0`, { method: 'POST' }));
    expect(r.status).toBe(200);
    return mock.narrar.mock.calls.at(-1)![1];
  };

  it('Rafael fala com a voz masculina, numa síntese só, sem o portão da narração', async () => {
    const opcoes = await ouvir('Rafael');
    expect(opcoes).toMatchObject({ voice: PESSOA_SIMULADA.masculina.voz, style: PESSOA_SIMULADA.masculina.direcao, segmentar: false, semPortao: true });
    expect(opcoes.voice).not.toBe(ELENCO.mentora.voz);
  });

  it('Marina fala com a voz feminina da pessoa simulada, não com a da Mentora', async () => {
    const opcoes = await ouvir('Marina');
    expect(opcoes).toMatchObject({ voice: PESSOA_SIMULADA.feminina.voz, semPortao: true });
    expect(opcoes.voice).not.toBe(ELENCO.mentora.voz);
    expect(opcoes.tentativas).toBeUndefined();
  });
});
