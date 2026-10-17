import { describe, it, expect } from 'vitest';
import {
  blocoVazio, diagnosticarModulo, corrigirModulosGerados, MAX_CORRECOES_MODULO, type ModuloParaCorrigir,
} from '@/lib/modulos-base/correcao-automatica';

/**
 * Correção automática dos módulos-base de um manuscrito (17/10/2026). Os dois defeitos medidos na 4Life: bloco inteiro
 * vazio (6 de 51) e reprovação por coerência (11). Os testes travam o que o job faz com cada um, o teto e que um módulo
 * que falha não para os outros.
 */
const cheio = { ideia_central: 'Clareza é dizer o essencial primeiro e conferir se foi entendido.', principios: ['a', 'b'] };
const mod = (id: string, extra: Partial<ModuloParaCorrigir> = {}): ModuloParaCorrigir => ({
  id, status: 'revisao', conteudo_central: cheio, conteudo_aplicavel: cheio, auditoria_ia: { veredito: 'aprovado' }, ...extra,
});

describe('blocoVazio e diagnóstico', () => {
  it('vazio: {}, [], string vazia, nulo; cheio não', () => {
    for (const v of [{}, [], '', null, undefined, '{}', { a: '' }]) expect(blocoVazio(v), JSON.stringify(v)).toBe(true);
    expect(blocoVazio(cheio)).toBe(false);
  });
  it('vazio vence o veredito; reprovado com conteúdo pede refino; aprovado e com ressalvas ficam', () => {
    expect(diagnosticarModulo(mod('a', { conteudo_aplicavel: {}, auditoria_ia: { veredito: 'aprovado' } }))).toBe('vazio');
    expect(diagnosticarModulo(mod('b', { auditoria_ia: { veredito: 'reprovado' } }))).toBe('reprovado');
    expect(diagnosticarModulo(mod('c', { auditoria_ia: { veredito: 'aprovado_com_ressalvas' } }))).toBe('ok');
    expect(diagnosticarModulo(mod('d', { auditoria_ia: null }))).toBe('sem-auditoria');
  });
});

function banco(inicial: ModuloParaCorrigir[]) {
  const linhas = new Map(inicial.map((m) => [m.id, { ...m }]));
  const chamadas: string[] = [];
  return { linhas, chamadas };
}

describe('corrigirModulosGerados', () => {
  it('vazio é regerado (o id novo entra no lugar) e reprovado é refinado; aprovado não é tocado', async () => {
    const b = banco([mod('vazio', { conteudo_central: {} }), mod('reprov', { auditoria_ia: { veredito: 'reprovado' } }), mod('ok')]);
    const r = await corrigirModulosGerados(['vazio', 'reprov', 'ok'], {
      ler: async (id) => b.linhas.get(id) ?? null,
      regerar: async (m) => { b.chamadas.push(`regerar.${m.id}`); b.linhas.set('novo', mod('novo')); return 'novo'; },
      refinar: async (id) => { b.chamadas.push(`refinar.${id}`); b.linhas.get(id)!.auditoria_ia = { veredito: 'aprovado' }; },
    });
    expect(b.chamadas).toEqual(['regerar.vazio', 'refinar.reprov']);
    expect(r).toEqual({ ids: ['novo', 'reprov', 'ok'], regerados: 1, refinados: 1, seguem: [] });
  });

  it(`para no teto (${MAX_CORRECOES_MODULO} tentativas) e o módulo fica em "seguem"`, async () => {
    const b = banco([mod('teimoso', { auditoria_ia: { veredito: 'reprovado' } })]);
    const r = await corrigirModulosGerados(['teimoso'], {
      ler: async (id) => b.linhas.get(id) ?? null,
      regerar: async () => null,
      refinar: async (id) => { b.chamadas.push(`refinar.${id}`); },
    });
    expect(b.chamadas).toHaveLength(MAX_CORRECOES_MODULO);
    expect(r.seguem).toEqual(['teimoso']);
  });

  it('o regerado que volta reprovado ainda pode ser refinado dentro do mesmo teto', async () => {
    const b = banco([mod('vazio', { conteudo_aplicavel: {} })]);
    const r = await corrigirModulosGerados(['vazio'], {
      ler: async (id) => b.linhas.get(id) ?? null,
      regerar: async () => { b.linhas.set('novo', mod('novo', { auditoria_ia: { veredito: 'reprovado' } })); return 'novo'; },
      refinar: async (id) => { b.chamadas.push(`refinar.${id}`); b.linhas.get(id)!.auditoria_ia = { veredito: 'aprovado' }; },
    });
    expect(b.chamadas).toEqual(['refinar.novo']);
    expect(r).toMatchObject({ ids: ['novo'], regerados: 1, refinados: 1, seguem: [] });
  });

  it('um módulo que estoura não para os outros', async () => {
    const b = banco([mod('quebra', { auditoria_ia: { veredito: 'reprovado' } }), mod('reprov', { auditoria_ia: { veredito: 'reprovado' } })]);
    const r = await corrigirModulosGerados(['quebra', 'reprov'], {
      ler: async (id) => b.linhas.get(id) ?? null,
      regerar: async () => null,
      refinar: async (id) => { if (id === 'quebra') throw new Error('IA fora'); b.linhas.get(id)!.auditoria_ia = { veredito: 'aprovado' }; },
    });
    expect(r.seguem).toEqual(['quebra']);
    expect(r.ids).toEqual(['quebra', 'reprov']);
  });
});
