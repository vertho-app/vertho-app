/**
 * Análise de segurança de 05/10/2026: das ~150 arquivos `'use server'`, só um usava
 * limitador. O Beto chamava o Sonnet sem freio de frequência, com `bodySizeLimit`
 * de 15 MB e sem teto diário, e qualquer colaborador logado podia repeti-lo em
 * laço. Três ações de IA da área do colaborador tinham o mesmo desenho.
 *
 * O limite é por PESSOA (e-mail da sessão), nunca por IP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRateLimiter, limitarAcao } from '@/lib/rate-limit';

describe('limitarAcao', () => {
  it('devolve null dentro do limite e a espera em segundos quando estoura', async () => {
    const l = createRateLimiter({ maxRequests: 2, windowMs: 60_000, escopo: 'teste-limitar-acao' });
    expect(await limitarAcao(l, 'ana@x.com')).toBeNull();
    expect(await limitarAcao(l, 'ana@x.com')).toBeNull();
    const espera = await limitarAcao(l, 'ana@x.com');
    expect(espera).toBeGreaterThanOrEqual(1);
    expect(espera).toBeLessThanOrEqual(60);
  });

  it('a chave é a pessoa: quem estourou não trava a outra', async () => {
    const l = createRateLimiter({ maxRequests: 1, windowMs: 60_000, escopo: 'teste-por-pessoa' });
    expect(await limitarAcao(l, 'ana@x.com')).toBeNull();
    expect(await limitarAcao(l, 'ana@x.com')).not.toBeNull();
    expect(await limitarAcao(l, 'bia@x.com')).toBeNull();
  });
});

// ── Beto ────────────────────────────────────────────────────────────────
const callAIChat = vi.fn(async (..._a: any[]) => 'resposta do beto');
vi.mock('@/actions/ai-client', () => ({ callAIChat, callAI: async () => '' }));
let emailDaSessao: string | null = 'colab@escola.br';
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: emailDaSessao }),
  getAuthenticatedEmailFromAction: async () => emailDaSessao,
}));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => { throw new Error('sem banco no teste'); },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

let n = 0;
const emailNovo = () => { emailDaSessao = `pessoa${++n}-${Date.now()}@escola.br`; return emailDaSessao; };

describe('chatWithBeto: freio de uso e de tamanho', () => {
  beforeEach(() => { callAIChat.mockClear(); });

  it('🔴 a 11ª mensagem no mesmo minuto é recusada ANTES de chamar o modelo', async () => {
    const { chatWithBeto } = await import('@/app/actions/beto');
    emailNovo();
    for (let i = 0; i < 10; i++) await chatWithBeto('oi', [], null, 'pt-BR');
    expect(callAIChat).toHaveBeenCalledTimes(10);
    await expect(chatWithBeto('oi', [], null, 'pt-BR')).rejects.toThrow(/limite de uso/);
    expect(callAIChat).toHaveBeenCalledTimes(10);
  });

  it('o limite é por pessoa: outra conta segue conversando', async () => {
    const { chatWithBeto } = await import('@/app/actions/beto');
    emailNovo();
    for (let i = 0; i < 10; i++) await chatWithBeto('oi', [], null, 'pt-BR');
    await expect(chatWithBeto('oi', [], null, 'pt-BR')).rejects.toThrow();
    emailNovo();
    await expect(chatWithBeto('oi', [], null, 'pt-BR')).resolves.toBe('resposta do beto');
  });

  it('🔴 mensagem e histórico gigantes chegam ao modelo cortados em 4.000 caracteres por fala', async () => {
    const { chatWithBeto } = await import('@/app/actions/beto');
    emailNovo();
    const gigante = 'x'.repeat(200_000);
    await chatWithBeto(gigante, [{ role: 'user', content: gigante }, { role: 'assistant', content: gigante }], null, 'pt-BR');
    const mensagens = callAIChat.mock.calls[0][1] as Array<{ content: string }>;
    expect(mensagens.length).toBeGreaterThan(0);
    for (const m of mensagens) expect(m.content.length).toBeLessThanOrEqual(4000);
  });

  it('histórico que não é lista não derruba a action', async () => {
    const { chatWithBeto } = await import('@/app/actions/beto');
    emailNovo();
    await expect(chatWithBeto('oi', 'nao-e-lista' as any, null, 'pt-BR')).resolves.toBe('resposta do beto');
  });
});

describe('as três ações de IA do colaborador consultam o limitador antes do custo', () => {
  const lerFonte = (f: string) => readFileSync(f, 'utf8');

  it.each([
    ['app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts', /limitarAcao\(heavyLimiter, `insights:\$\{email\}`\)/],
    ['app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts', /limitarAcao\(heavyLimiter, `relatorio:\$\{email\}`\)/],
    ['app/dashboard/perfil-comportamental/mapeamento/mapeamento-actions.ts', /limitarAcao\(heavyLimiter, `perfil:\$\{email\}`\)/],
  ])('🔴 %s', (arquivo, padrao) => {
    expect(lerFonte(arquivo)).toMatch(padrao);
  });

  it('gerarInsightsExecutivos consulta o limite DEPOIS do cache e ANTES de montar o prompt', () => {
    const s = lerFonte('app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts');
    const i = s.indexOf('async function gerarInsightsExecutivos');
    const cache = s.indexOf('cached: true', i);
    const limite = s.indexOf('limitarAcao(heavyLimiter', i);
    const prompt = s.indexOf('buildInsightsExecutivosPrompt({', i);
    expect(cache).toBeGreaterThan(i);
    expect(limite).toBeGreaterThan(cache);
    expect(prompt).toBeGreaterThan(limite);
  });

  it('salvarPerfilComportamental consulta o limite antes de qualquer leitura ou escrita', () => {
    const s = lerFonte('app/dashboard/perfil-comportamental/mapeamento/mapeamento-actions.ts');
    const i = s.indexOf('async function salvarPerfilComportamental');
    expect(s.indexOf('limitarAcao(heavyLimiter', i)).toBeGreaterThan(i);
    expect(s.indexOf('limitarAcao(heavyLimiter', i)).toBeLessThan(s.indexOf('findColabByEmail(email', i));
  });
});
