import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Régua das seções do Mercado potencial (R-108, 03/10/2026).
 *
 * O estado REAL (Radar Empresas off-line, aba fora) é afirmado no
 * `blocos-offline-guard`, que não mocka nada. Aqui fica o controle positivo:
 * com o bloco ligado a aba volta. Sem ele, uma régua que devolvesse sempre
 * "só mercado" passaria no guard pelo motivo errado, e religar o bloco não
 * devolveria a aba.
 */
const estado = vi.hoisted(() => ({ offline: new Set<string>() }));
vi.mock('@/lib/blocos-offline', () => ({ blocoEstaOffline: (b: string) => estado.offline.has(b) }));

import { abaUnificadaDisponivel, secoesDoMercado, secaoInicialDoMercado } from '@/lib/mercado-potencial/secoes';

describe('seções do Mercado potencial', () => {
  beforeEach(() => { estado.offline = new Set(); });

  it('com o Radar Empresas ligado, a aba Unificado existe e o link dela abre nela', () => {
    expect(abaUnificadaDisponivel()).toBe(true);
    expect(secoesDoMercado()).toEqual(['mercado', 'unificado']);
    expect(secaoInicialDoMercado('unificado')).toBe('unificado');
  });

  it('com o Radar Empresas off-line, só o mercado de escolas', () => {
    estado.offline = new Set(['radarempresas']);
    expect(abaUnificadaDisponivel()).toBe(false);
    expect(secoesDoMercado()).toEqual(['mercado']);
    expect(secaoInicialDoMercado('unificado')).toBe('mercado');
  });

  it('outro bloco off-line não tira a aba', () => {
    estado.offline = new Set(['pulso', 'conarh']);
    expect(secoesDoMercado()).toEqual(['mercado', 'unificado']);
  });

  it('sem `?tab` ou com valor desconhecido, abre o mercado', () => {
    expect(secaoInicialDoMercado(null)).toBe('mercado');
    expect(secaoInicialDoMercado(undefined)).toBe('mercado');
    expect(secaoInicialDoMercado('mercado')).toBe('mercado');
    expect(secaoInicialDoMercado('qualquer')).toBe('mercado');
  });
});
