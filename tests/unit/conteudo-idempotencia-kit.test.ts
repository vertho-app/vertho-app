import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Bug corrigido em 27/07: a idempotência de `gerarConteudoIA` não filtrava `kit_id`.
 *
 * Conteúdo de KIT é DISC-específico e sai SÓ pelo overlay — o build o exclui com
 * `.is('kit_id', null)`. Sem esse filtro na idempotência, um kit já existente fazia a
 * query dizer "já existe" e o CORE nunca era gerado, com retorno `success: true`:
 * o gap ficava aberto para sempre e o operador via sucesso.
 *
 * Medido no Ibipeba: o áudio de kit de "Busca de apoio e rede" (Gestão Escolar, DISC D)
 * bloqueava o áudio core do mesmo par — 13 das 15 pessoas do cargo (todo DISC ≠ D)
 * ficavam sem áudio naquele descritor das semanas 5-11.
 *
 * O teste exercita o caminho real: se a query NÃO filtrar kit_id, o stub devolve o kit
 * e a função retorna `skipped`. Se filtrar, ela segue para a geração — que aqui morre
 * numa sentinela de propósito, porque o objetivo é só provar que passou da idempotência.
 */

vi.mock('@/lib/season-engine/perfil-publico', () => ({
  resolverPerfilPublicoDaEmpresa: () => { throw new Error('SENTINELA-PASSOU-DA-IDEMPOTENCIA'); },
}));

/** Registra os filtros da cadeia e só "acha" o kit se `kit_id` NÃO foi excluído. */
function stubSb() {
  const filtros: string[] = [];
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { filtros.push(`eq:${col}=${val}`); return builder; },
    is: (col: string, val: any) => { filtros.push(`is:${col}=${val}`); return builder; },
    limit: () => Promise.resolve({
      // A linha existente é um KIT. Uma query que exclui kit_id não a vê.
      data: filtros.includes('is:kit_id=null') ? [] : [{ id: 'kit-existente' }],
    }),
    maybeSingle: () => Promise.resolve({ data: null }),
  };
  return { sb: { from: () => builder } as any, filtros };
}

const ARGS = {
  formato: 'audio' as const,
  competencia: 'Autocuidado e resiliência emocional',
  descritor: 'Busca de apoio e rede',
  cargo: 'Gestão Escolar',
  empresaId: '0d99fed1-1710-40e3-b32e-7a95c7d023fe',
};

beforeEach(() => { vi.resetModules(); });

describe('gerarConteudoIA — idempotência ignora conteúdo de KIT', () => {
  it('kit existente NÃO bloqueia a geração do core', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const { sb, filtros } = stubSb();

    const r: any = await gerarConteudoIA({ ...ARGS, sb });

    // A prova: a cadeia excluiu kit_id...
    expect(filtros).toContain('is:kit_id=null');
    // ...e a função NÃO tratou o kit como core já pronto.
    expect(r?.skipped).toBeFalsy();
    expect(String(r?.error || '')).toContain('SENTINELA-PASSOU-DA-IDEMPOTENCIA');
  });

  it('core já existente segue pulando (a idempotência continua valendo)', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    // Aqui o stub devolve linha mesmo com o filtro de kit — simula um CORE existente.
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      limit: () => Promise.resolve({ data: [{ id: 'core-existente' }] }),
    };
    const r: any = await gerarConteudoIA({ ...ARGS, sb: { from: () => builder } as any });

    expect(r?.skipped).toBe(true);
    expect(r?.conteudoId).toBe('core-existente');
  });

  it('forcar: true regenera mesmo com core existente', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      limit: () => Promise.resolve({ data: [{ id: 'core-existente' }] }),
    };
    const r: any = await gerarConteudoIA({ ...ARGS, sb: { from: () => builder } as any, forcar: true });

    expect(r?.skipped).toBeFalsy();
    expect(String(r?.error || '')).toContain('SENTINELA-PASSOU-DA-IDEMPOTENCIA');
  });

  /**
   * F-C6 (mig 190): `uq_micro_conteudos_core` = UNIQUE(empresa, competencia, descritor,
   * formato, cargo) WHERE kit_id IS NULL. A checagem em código e a constraint têm que
   * cobrir AS MESMAS colunas — se a query enfraquecer (alguém tirar uma coluna), o
   * insert passa na checagem e explode na constraint (500 para o usuário); se ela for
   * mais forte que a constraint, volta a pular geração que o banco permitiria.
   */
  it('a query de idempotência cobre exatamente as colunas da uq_micro_conteudos_core', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const { sb, filtros } = stubSb();

    await gerarConteudoIA({ ...ARGS, sb });

    for (const coluna of ['competencia', 'descritor', 'formato', 'cargo', 'empresa_id']) {
      expect(filtros.some((f) => f.startsWith(`eq:${coluna}=`) || f.startsWith(`is:${coluna}=`)),
        `idempotência perdeu o filtro de ${coluna} — diverge da uq_micro_conteudos_core (mig 190)`).toBe(true);
    }
    expect(filtros).toContain('is:kit_id=null');
  });

  it('sem empresaId, filtra empresa_id IS NULL (mesma semântica do COALESCE da constraint)', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const { sb, filtros } = stubSb();

    await gerarConteudoIA({ ...ARGS, empresaId: null, sb });

    expect(filtros).toContain('is:empresa_id=null');
    expect(filtros.some((f) => f.startsWith('eq:empresa_id='))).toBe(false);
  });
});
