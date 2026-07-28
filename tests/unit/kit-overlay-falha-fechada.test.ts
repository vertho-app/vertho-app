import { describe, it, expect } from 'vitest';
import { precarregarKits } from '@/lib/season-engine/kit/entrega-semana';

/**
 * F-C4 (docs/FMEA-PIPELINE.md) — a invariante mais cara do overlay.
 *
 * `precarregarKits` ignorava o `error` das suas 3 queries e devolvia um Map VAZIO
 * MAS TRUTHY. `overlayConteudo` escolhe o caminho assim:
 *
 *     const kit = args.kitsCache ? args.kitsCache.get(chave) : await resolverKitDaSemana(...)
 *
 * Cache truthy vence. `.get()` devolve undefined, `if (!kit) return` mantém o
 * conteúdo do build — e a personalização da COORTE INTEIRA some de uma vez, sem
 * erro e sem telemetria. Foi a causa-raiz do episódio de 16/07.
 *
 * A distinção que este teste guarda:
 *   · "não há kits"            → Map vazio (legítimo, o overlay mantém o genérico)
 *   · "não consegui saber"     → THROW (o chamador cai no resolvedor live)
 */

/** Mock encadeável: `falharEm` injeta `{data:null, error}` na tabela escolhida. */
function sbMock(falharEm?: 'kit_briefs' | 'kits' | 'micro_conteudos', dados: Record<string, any[]> = {}) {
  return {
    from(tabela: string) {
      const rows = dados[tabela] ?? [];
      const resposta = falharEm === tabela
        ? { data: null, error: { message: 'timeout: pool esgotado' } }
        : { data: rows, error: null };
      const q: any = {
        select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q, order: () => q,
        maybeSingle: async () => ({ ...resposta, data: rows[0] ?? null }),
        then: (res: any) => Promise.resolve(resposta).then(res),
      };
      return q;
    },
  };
}

const BRIEF = { id: 'b1', competencia: 'Planejamento', descritor: 'Gestão de riscos', cargo: 'Gestão Escolar', empresa_id: 'e1' };
const KIT = { id: 'k1', brief_id: 'b1', desafio: { desafio_texto: 'faça X' } };
const CONTEUDO = { id: 'mc1', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto' };
const ARGS = { empresaId: 'e1', disc: 'S', cargo: 'Gestão Escolar' };

describe('F-C4 · falha de query NÃO pode virar cache vazio silencioso', () => {
  it('query de briefs falha → LANÇA (não devolve Map vazio truthy)', async () => {
    await expect(precarregarKits(sbMock('kit_briefs') as any, ARGS)).rejects.toThrow(/precarregarKits/);
  });

  it('query de kits falha → LANÇA', async () => {
    await expect(precarregarKits(sbMock('kits', { kit_briefs: [BRIEF] }) as any, ARGS)).rejects.toThrow(/kits/);
  });

  it('query de micro_conteudos falha → LANÇA', async () => {
    await expect(
      precarregarKits(sbMock('micro_conteudos', { kit_briefs: [BRIEF], kits: [KIT] }) as any, ARGS),
    ).rejects.toThrow(/micro_conteudos/);
  });

  it('a mensagem diz o que aconteceu — o erro precisa ser diagnosticável', async () => {
    await expect(precarregarKits(sbMock('kit_briefs') as any, ARGS))
      .rejects.toThrow(/timeout: pool esgotado/);
  });

  it('SEM kits (dados vazios, sem erro) → Map vazio, sem lançar — degradação legítima', async () => {
    const cache = await precarregarKits(sbMock(undefined, { kit_briefs: [] }) as any, ARGS);
    expect(cache.size).toBe(0);
  });

  it('briefs existem mas nenhum kit publicado do DISC → Map vazio, sem lançar', async () => {
    const cache = await precarregarKits(sbMock(undefined, { kit_briefs: [BRIEF], kits: [] }) as any, ARGS);
    expect(cache.size).toBe(0);
  });

  it('caminho feliz → Map preenchido', async () => {
    const cache = await precarregarKits(
      sbMock(undefined, { kit_briefs: [BRIEF], kits: [KIT], micro_conteudos: [CONTEUDO] }) as any, ARGS);
    expect(cache.size).toBe(1);
    expect(cache.get('Planejamento ::: Gestão de riscos')?.kitId).toBe('k1');
  });

  it('DISC inválido → Map vazio sem tocar no banco (guard barato antes das queries)', async () => {
    const cache = await precarregarKits(sbMock('kit_briefs') as any, { ...ARGS, disc: null });
    expect(cache.size).toBe(0); // não lançou: nem chegou a consultar
  });
});
