import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buscarContextoPPP, formatarSecoesPPP } from '@/lib/ia2-gabarito';

/**
 * F-I10 (`docs/FMEA-PIPELINE.md`) — gêmeo de `buscarValores`, fechado em 27/07.
 *
 * `buscarContextoPPP` fazia `.limit(1)` por `extracted_at` e entregava a IA1/IA2/IA3 o
 * PPP de UMA escola sorteada como se fosse o município. Numa rede (Ibipeba: 11 PPPs)
 * a régua de competências de todos os cargos saía calibrada numa escola arbitrária —
 * em silêncio. As duas invariantes que este teste protege:
 *   1. rede (N PPPs) NUNCA devolve o PPP de uma escola só;
 *   2. tenant de 1 PPP continua recebendo o formato curado de sempre, sem custo de IA
 *      (a correção não podia mudar o prompt de quem não estava quebrado).
 */

const resolverContextoEmpresa = vi.fn(async () => 'CONTEXTO MUNICIPAL CONSOLIDADO');
vi.mock('@/lib/season-engine/kit/contexto-empresa', () => ({
  resolverContextoEmpresa: (...args: any[]) => resolverContextoEmpresa(...(args as [])),
}));

/** tdb encadeável: `.select().eq().order()` resolve a lista; `.eq('id').maybeSingle()` a row. */
function stubTdb(rows: any[], byId: any = null) {
  const eqs: Array<[string, any]> = [];
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { eqs.push([col, val]); return builder; },
    order: () => Promise.resolve({ data: rows }),
    maybeSingle: () => Promise.resolve({ data: byId }),
  };
  return { tdb: { from: () => builder, raw: { marker: 'raw-client' } } as any, eqs };
}

const escola = (nome: string) => ({
  extracao: {
    perfil_instituicao: `Escola ${nome}, rede municipal de Ibipeba/BA.`,
    desafios_metas: `Desafio principal da ${nome}: alfabetização na idade certa.`,
  },
});

beforeEach(() => {
  resolverContextoEmpresa.mockClear();
  resolverContextoEmpresa.mockResolvedValue('CONTEXTO MUNICIPAL CONSOLIDADO');
});

describe('formatarSecoesPPP', () => {
  it('rotula as seções conhecidas e ignora as ausentes', () => {
    const out = formatarSecoesPPP({
      perfil_instituicao: 'Centro universitário em Jundiaí/SP com colégio e graduação.',
      vocabulario: 'Usa "colaborador" e "docente"; evita "funcionário".',
    });
    expect(out).toContain('## PERFIL DA INSTITUIÇÃO');
    expect(out).toContain('## VOCABULÁRIO');
    expect(out).not.toContain('## MERCADO E STAKEHOLDERS');
  });

  it('extrai `.conteudo` do formato novo {conteudo, origem, confianca}', () => {
    const out = formatarSecoesPPP({
      identidade: { conteudo: 'Pedagogia da autonomia como eixo do PPP.', origem: 'pdf', confianca: 0.9 },
    });
    expect(out).toContain('Pedagogia da autonomia como eixo do PPP.');
    expect(out).not.toContain('confianca');
  });

  it('trunca a seção em 800 chars e o total em ~4000', () => {
    const gigante = Object.fromEntries(
      ['perfil_organizacional', 'perfil_instituicao', 'comunidade_contexto', 'mercado_stakeholders',
       'identidade_cultura', 'identidade', 'operacao_processos', 'praticas_descritas',
       'desafios_estrategia', 'desafios_metas'].map((k) => [k, 'x'.repeat(2000)]),
    );
    const out = formatarSecoesPPP(gigante);
    expect(out).toContain('...');
    expect(out.length).toBeLessThan(5000);
  });

  it('aceita a extração como string JSON e devolve vazio sem extração', () => {
    expect(formatarSecoesPPP(JSON.stringify({ identidade: 'Gestão democrática e participativa.' })))
      .toContain('## IDENTIDADE');
    expect(formatarSecoesPPP(null)).toBe('');
  });
});

describe('buscarContextoPPP', () => {
  it('sem PPP extraído: contexto vazio, sem chamar a síntese', async () => {
    const { tdb } = stubTdb([]);
    expect(await buscarContextoPPP(tdb, { empresaId: 'e1' })).toBe('');
    expect(resolverContextoEmpresa).not.toHaveBeenCalled();
  });

  it('1 PPP: formato curado de sempre e ZERO custo de IA', async () => {
    const { tdb } = stubTdb([escola('UniAnchieta')]);
    const out = await buscarContextoPPP(tdb, { empresaId: 'e1' });
    expect(out).toBe(formatarSecoesPPP(escola('UniAnchieta').extracao));
    expect(resolverContextoEmpresa).not.toHaveBeenCalled();
  });

  it('rede: consolida e NÃO entrega o PPP de uma escola só (o bug)', async () => {
    const rede = [escola('Creche Girassol'), escola('Colégio Central'), escola('Escola do Campo')];
    const { tdb } = stubTdb(rede);
    const out = await buscarContextoPPP(tdb, { empresaId: 'e1' });

    expect(out).toBe('CONTEXTO MUNICIPAL CONSOLIDADO');
    // A invariante: nenhuma escola individual vaza como se fosse a rede.
    expect(out).not.toContain('Creche Girassol');
    expect(out).not.toContain('Colégio Central');
    // Recebe o client raw (lê/grava `empresas`, cujo id É o tenant) + o empresaId.
    expect(resolverContextoEmpresa).toHaveBeenCalledWith({ marker: 'raw-client' }, 'e1', {});
  });

  it('rede sem síntese disponível: degrada para 1 PPP curado, nunca para prompt sem contexto', async () => {
    resolverContextoEmpresa.mockResolvedValue('' as any);
    const { tdb } = stubTdb([escola('Creche Girassol'), escola('Colégio Central')]);
    const out = await buscarContextoPPP(tdb, { empresaId: 'e1' });
    expect(out).toContain('## PERFIL DA INSTITUIÇÃO');
  });

  it('cenário por escola: usa ESSE ppp_escola_id, sem consolidar', async () => {
    const { tdb, eqs } = stubTdb([], escola('Escola do Campo'));
    const out = await buscarContextoPPP(tdb, { empresaId: 'e1', pppEscolaId: 'ppp-42' });
    expect(out).toContain('Escola do Campo');
    expect(eqs).toContainEqual(['id', 'ppp-42']);
    expect(resolverContextoEmpresa).not.toHaveBeenCalled();
  });

  it('erro no banco não derruba a geração — contexto vazio', async () => {
    const tdb: any = { from: () => { throw new Error('PostgREST fora do ar'); } };
    expect(await buscarContextoPPP(tdb, { empresaId: 'e1' })).toBe('');
  });
});
