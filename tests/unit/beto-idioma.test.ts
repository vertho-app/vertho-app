/**
 * R-68 (revisão de 02/10/2026): o Beto respondia no idioma do COOKIE, e o
 * login por senha não grava o cookie. Nesse caso ele respondia em pt-BR
 * enquanto a tela seguia o idioma da empresa.
 *
 * Agora o chat manda o idioma da tela, e sem ele a action cai no cookie e,
 * por fim, no idioma da pessoa ou da empresa (a régua do `/auth/callback`).
 * Nome e contatos sintéticos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from './../helpers/supabase-mock';

const h = vi.hoisted(() => ({
  sb: null as any,
  callAIChat: vi.fn(),
  cookie: undefined as string | undefined,
  localeDoCadastro: null as string | null,
}));
const COLAB = { id: 'col-1', empresa_id: 'emp-1', nome_completo: 'Lucía Pérez', cargo: 'Coordinación', perfil_dominante: 'S' };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: 'lucia@escuela.es', empresaId: 'emp-1', colaborador: { id: 'col-1' } }),
}));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => COLAB }));
vi.mock('@/actions/ai-client', () => ({ callAIChat: h.callAIChat }));
vi.mock('@/lib/fase4/contexto-semanal', () => ({ resolverContextoSemanal: async () => null }));
vi.mock('@/lib/blueprint/resumo', () => ({ carregarBlueprintResumo: async () => '' }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarCargoInfo: async () => null, formatBlocoCargo: () => '' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (nome: string) => (nome === 'vertho-locale' && h.cookie ? { value: h.cookie } : undefined) }),
}));
vi.mock('@/lib/i18n-server', () => ({ getLocaleForEmail: async () => h.localeDoCadastro }));

import { chatWithBeto } from '@/app/actions/beto';

const localeEnviado = () => h.callAIChat.mock.calls.at(-1)?.[4]?.locale;

beforeEach(() => {
  h.callAIChat.mockReset();
  h.callAIChat.mockResolvedValue('ok');
  h.cookie = undefined;
  h.localeDoCadastro = null;
  h.sb = criarSupabaseMock({ resolver: (t) => (t === 'empresas' ? { nome: 'Escuela' } : null) });
});

describe('R-68 · o Beto responde no idioma da tela', () => {
  it('🔴 sem cookie (login por senha), segue o idioma que a tela informa', async () => {
    await chatWithBeto('¿Cómo practico?', [], '/dashboard', 'es-ES');
    expect(localeEnviado()).toBe('es-ES');
  });

  it('a tela vence o cookie: é ela que a pessoa está lendo', async () => {
    h.cookie = 'pt-BR';
    await chatWithBeto('Hi', [], '/dashboard', 'en-US');
    expect(localeEnviado()).toBe('en-US');
  });

  it('valor fora da lista não vira idioma: cai no cookie', async () => {
    h.cookie = 'pt-PT';
    await chatWithBeto('Olá', [], '/dashboard', 'xx-YY');
    expect(localeEnviado()).toBe('pt-PT');
  });

  it('bundle antigo (sem o 4º argumento) e sem cookie: idioma do cadastro da pessoa/empresa', async () => {
    h.localeDoCadastro = 'es-ES';
    await chatWithBeto('Hola', [], '/dashboard');
    expect(localeEnviado()).toBe('es-ES');
  });

  it('sem nada: pt-BR, o padrão', async () => {
    await chatWithBeto('Oi', [], '/dashboard');
    expect(localeEnviado()).toBe('pt-BR');
  });

  it('o chat da tela manda o idioma em que está', () => {
    const fonte = readFileSync('components/beto-chat.tsx', 'utf8');
    expect(fonte).toMatch(/const locale = useLocale\(\);/);
    expect(fonte).toMatch(/chatWithBeto\(userMsg, messages\.slice\(-10\), pathname, locale\)/);
  });
});
