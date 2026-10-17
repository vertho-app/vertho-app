import { describe, expect, it } from 'vitest';
import { arquivarArtefatoAtual, linhaDoHistorico, TABELA_HISTORICO } from '@/lib/artefatos-historico';

/**
 * Histórico de blueprint e PDI (mig 289, 17/10/2026). `development_blueprints` e `relatorios` têm UMA linha por
 * pessoa e a geração é upsert: na Temporada 2 de Ibipeba, regerar apagaria o blueprint e o PDI da Temporada 1 de 25
 * pessoas. O escritor arquiva a versão atual ANTES de sobrescrever e, se o arquivo falha, não sobrescreve.
 */

const BP = {
  id: 'bp1', blueprint: { competencias: [{ nome: 'Planejamento' }] }, spec_version: 1,
  auditoria: { ok: true }, auditado_em: '2026-10-02T13:00:00Z', gerado_em: '2026-10-02T12:19:04Z',
};
const PDI = { id: 'r1', conteudo: { acolhimento: 'Olá', auditoria: { status: 'pass' } }, pdf_path: 'e1/individual-ana-1720000000000.pdf', gerado_em: '2026-07-20T19:55:12Z' };

/** `tdb` falso: devolve `atual` na leitura e registra o upsert no histórico. */
function tdbFalso(atual: any, opts: { erroLer?: string; erroGravar?: string } = {}) {
  const gravados: Array<{ tabela: string; linha: any; opcoes: any }> = [];
  const lidas: string[] = [];
  const tdb = {
    from(tabela: string) {
      const q: any = {
        select: () => { lidas.push(tabela); return q; },
        eq: () => q,
        maybeSingle: async () => (opts.erroLer ? { data: null, error: { message: opts.erroLer } } : { data: atual, error: null }),
        upsert: async (linha: any, opcoes: any) => {
          gravados.push({ tabela, linha, opcoes });
          return opts.erroGravar ? { error: { message: opts.erroGravar } } : { error: null };
        },
      };
      return q;
    },
  };
  return { tdb, gravados, lidas };
}

describe('linhaDoHistorico', () => {
  it('blueprint leva o JSON, a versão e a auditoria que moravam fora dele', () => {
    expect(linhaDoHistorico('blueprint', 'c1', BP)).toEqual({
      colaborador_id: 'c1', tipo: 'blueprint', origem_id: 'bp1', conteudo: BP.blueprint, spec_version: 1,
      auditoria: { ok: true }, auditado_em: '2026-10-02T13:00:00Z', gerado_em: '2026-10-02T12:19:04Z', motivo: 'sobrescrito',
    });
  });
  it('PDI leva o conteúdo (com a auditoria dentro) e o caminho do PDF, que não é copiado', () => {
    expect(linhaDoHistorico('pdi', 'c1', PDI)).toEqual({
      colaborador_id: 'c1', tipo: 'pdi', origem_id: 'r1', conteudo: PDI.conteudo,
      pdf_path: PDI.pdf_path, gerado_em: PDI.gerado_em, motivo: 'sobrescrito',
    });
  });
});

describe('arquivarArtefatoAtual', () => {
  it('sem versão atual: nada a arquivar, e não grava', async () => {
    const { tdb, gravados } = tdbFalso(null);
    expect(await arquivarArtefatoAtual(tdb, 'blueprint', 'c1')).toEqual({ arquivado: false });
    expect(gravados).toEqual([]);
  });

  it('com versão atual: grava no histórico, idempotente por (tipo, origem_id, gerado_em)', async () => {
    const { tdb, gravados, lidas } = tdbFalso(BP);
    expect(await arquivarArtefatoAtual(tdb, 'blueprint', 'c1')).toEqual({ arquivado: true });
    expect(lidas).toEqual(['development_blueprints']);
    expect(gravados).toHaveLength(1);
    expect(gravados[0].tabela).toBe(TABELA_HISTORICO);
    expect(gravados[0].linha.origem_id).toBe('bp1');
    expect(gravados[0].opcoes).toEqual({ onConflict: 'tipo,origem_id,gerado_em', ignoreDuplicates: true });
  });

  it('PDI lê de relatorios', async () => {
    const { tdb, gravados, lidas } = tdbFalso(PDI);
    expect(await arquivarArtefatoAtual(tdb, 'pdi', 'c1')).toEqual({ arquivado: true });
    expect(lidas).toEqual(['relatorios']);
    expect(gravados[0].linha.pdf_path).toBe(PDI.pdf_path);
  });

  it('🔴 falha ao LER a versão atual volta erro (o escritor não sobrescreve sem saber o que havia)', async () => {
    const { tdb, gravados } = tdbFalso(BP, { erroLer: 'timeout' });
    const r = await arquivarArtefatoAtual(tdb, 'blueprint', 'c1');
    expect(r.error).toMatch(/não li o blueprint atual para arquivar: timeout/);
    expect(gravados).toEqual([]);
  });

  it('🔴 falha ao GRAVAR o histórico volta erro (arquivo que falha calado é só intenção)', async () => {
    const { tdb } = tdbFalso(PDI, { erroGravar: 'relation does not exist' });
    const r = await arquivarArtefatoAtual(tdb, 'pdi', 'c1');
    expect(r.arquivado).toBe(false);
    expect(r.error).toMatch(/não arquivei o pdi atual: relation does not exist/);
  });

  it('versão sem gerado_em não é arquivada como se fosse de jornada nenhuma: erro', async () => {
    const { tdb, gravados } = tdbFalso({ ...BP, gerado_em: null });
    expect((await arquivarArtefatoAtual(tdb, 'blueprint', 'c1')).error).toMatch(/sem gerado_em|não tem gerado_em/);
    expect(gravados).toEqual([]);
  });
});
