import { describe, it, expect } from 'vitest';
import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';

/**
 * O plano da coorte passa a dizer, por DISC, quais formatos o kit leva (2 primeiros das preferências de aprendizagem,
 * união por célula) e se tem vídeo. Aqui a célula é (tema × cargo × DISC): pessoas do mesmo DISC e cargo compartilham.
 */
type Linha = Record<string, any>;
function sbFake(d: { colaboradores: Linha[]; trilhas: Linha[] }) {
  return {
    from(tabela: string) {
      let inF: { c: string; v: any[] } | null = null;
      const fonte = (): Linha[] => (tabela === 'colaboradores' ? d.colaboradores : tabela === 'trilhas' ? d.trilhas : []);
      const api: any = {
        select: () => api, eq: () => api, is: () => api, or: () => api, order: () => api, limit: () => api,
        in: (c: string, v: any[]) => { inF = { c, v }; return api; },
        then: (resolve: any) => resolve({ data: inF ? fonte().filter((r) => inF!.v.includes(r[inF!.c])) : fonte(), error: null }),
      };
      return api;
    },
  };
}
const SEM = [{ tipo: 'conteudo', semana: 1, descritor: 'D1' }];
const prefs = (p: Record<string, number>) => ({ pref_video_curto: 0, pref_video_longo: 0, pref_texto: 0, pref_audio: 0, pref_estudo_caso: 0, ...p });
const colab = (id: string, disc: string, p: Record<string, number>) => ({ id, perfil_dominante: disc, cargo: 'CAIXA', ...prefs(p) });
const trilha = (id: string) => ({ colaborador_id: id, competencia_foco: 'C1', temporada_plano: SEM, criado_em: '2026-10-01', data_inicio: '2026-10-05' });

describe('plano da coorte: formatos por DISC', () => {
  it('cada DISC leva a UNIÃO dos 2 primeiros de quem está na célula; vídeo vira flag', async () => {
    const sb = sbFake({
      colaboradores: [
        colab('a', 'D', { pref_audio: 7, pref_video_curto: 6 }),
        colab('b', 'D', { pref_texto: 7, pref_estudo_caso: 6 }),
        colab('c', 'S', { pref_texto: 7, pref_estudo_caso: 6 }),
        colab('d', 'I', {}),
      ],
      trilhas: ['a', 'b', 'c', 'd'].map(trilha),
    });
    const r: any = await levantarPlanoKitsCoorte(sb, 'e1', {});
    const item = r.plano[0];
    expect(item.formatosPorDisc.D).toEqual({ formatos: ['audio', 'texto', 'case'], video: true, semPreferencia: 0 });
    expect(item.formatosPorDisc.S).toEqual({ formatos: ['texto', 'case'], video: false, semPreferencia: 0 });
    expect(item.formatosPorDisc.I).toEqual({ formatos: ['texto', 'case'], video: false, semPreferencia: 1 });
  });

  it('só pessoas DA CÉLULA contam: a preferência de outro DISC não vaza para o kit', async () => {
    const sb = sbFake({
      colaboradores: [colab('a', 'D', { pref_texto: 7, pref_estudo_caso: 6 }), colab('b', 'C', { pref_audio: 7, pref_video_curto: 6 })],
      trilhas: ['a', 'b'].map(trilha),
    });
    const r: any = await levantarPlanoKitsCoorte(sb, 'e1', {});
    expect(r.plano[0].formatosPorDisc.D.video).toBe(false);
    expect(r.plano[0].formatosPorDisc.D.formatos).toEqual(['texto', 'case']);
    expect(r.plano[0].formatosPorDisc.C.video).toBe(true);
  });
});

describe('plano da coorte: falha de leitura dos colaboradores', () => {
  it('erro de query vira erro do plano (não "empresa sem colaboradores", que o fluxo leria como fila vazia)', async () => {
    const sb = { from: () => { const api: any = { select: () => api, eq: () => api, then: (r: any) => r({ data: null, error: { message: 'timeout' } }) }; return api; } };
    const r: any = await levantarPlanoKitsCoorte(sb, 'e1', {});
    expect(r.error).toMatch(/Falha ao ler os colaboradores: timeout/);
  });
});
