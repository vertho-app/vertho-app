import { describe, it, expect } from 'vitest';
import { resolverKitDaSemana, precarregarKits, overlayKitNaSemana } from '@/lib/season-engine/kit/entrega-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

/**
 * INVARIANTE: os DOIS resolvedores de kit entregam os mesmos formatos.
 *
 * `overlayConteudo` usa `precarregarKits` (3 queries, cache em memória) quando o
 * pré-carregamento deu certo, e cai em `resolverKitDaSemana` quando não deu
 * (`actions/temporadas.ts` chama precarregarKits com `.catch(() => undefined)`).
 * São caminhos alternativos para a MESMA entrega — divergir significa que a mesma
 * pessoa vê 3 formatos ou 1 dependendo de uma query ter falhado.
 *
 * Divergiram em produção: a correção de 16/07 (a entrega é por ID, não por `url` —
 * `gerarConteudoIA` grava url=null quando o PDF headless falha, e a tela abre
 * `/api/conteudo/{id}/pdf`, que renderiza no runtime) foi aplicada só em
 * `precarregarKits`. `resolverKitDaSemana` seguiu exigindo `url` e escondia
 * texto/case do kit. Ver docs/KIT-SEMANAL.md (armadilha 5).
 */

const BRIEF = { id: 'b1', competencia: 'Planejamento', descritor: 'Gestão de riscos', cargo: 'Gestão Escolar', empresa_id: 'e1' };
const KIT = { id: 'k1', brief_id: 'b1', disc: 'S', desafio: { desafio_texto: 'faça X' } };
// O caso que importa: texto/case SEM url (PDF headless falhou), áudio sem MP3.
const CONTEUDOS = [
  { id: 'c-texto', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto' },
  { id: 'c-case', kit_id: 'k1', formato: 'case', url: null, titulo: 'Caso' },
  { id: 'c-audio', kit_id: 'k1', formato: 'audio', url: null, titulo: 'Podcast' },
  { id: 'c-video', kit_id: 'k1', formato: 'video', url: 'http://v', titulo: 'Vídeo' },
];

/** Mock encadeável mínimo do supabase-js: devolve por tabela, ignorando filtros. */
function sbMock() {
  const tabela = (nome: string) => {
    const rows =
      nome === 'kit_briefs' ? [BRIEF] :
      nome === 'kits' ? [KIT] :
      nome === 'micro_conteudos' ? CONTEUDOS : [];
    const q: any = {
      select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q, order: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      single: async () => ({ data: rows[0] ?? null }),
      then: (res: any) => Promise.resolve({ data: rows }).then(res),
    };
    return q;
  };
  return { from: (n: string) => tabela(n) };
}

const ARGS = { empresaId: 'e1', competencia: BRIEF.competencia, descritor: BRIEF.descritor, disc: 'S', cargo: BRIEF.cargo };

describe('paridade entre os dois resolvedores de kit', () => {
  it('resolverKitDaSemana entrega texto/case mesmo sem url (entrega é por ID)', async () => {
    const kit = await resolverKitDaSemana(sbMock() as any, ARGS);
    expect(kit).not.toBeNull();
    expect(Object.keys(kit!.formatos).sort()).toEqual(['audio', 'case', 'texto']);
    expect(kit!.formatos.texto.id).toBe('c-texto');
    expect(kit!.formatos.texto.url).toBeNull();
  });

  it('precarregarKits entrega o mesmo conjunto de formatos', async () => {
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    const entrada = cache.get(`${BRIEF.competencia} ::: ${normDescritor(BRIEF.descritor)}`);
    expect(entrada).toBeTruthy();
    expect(Object.keys(entrada!.formatos).sort()).toEqual(['audio', 'case', 'texto']);
  });

  it('os dois caminhos concordam — nenhum esconde formato que o outro serve', async () => {
    const individual = await resolverKitDaSemana(sbMock() as any, ARGS);
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    const doCache = cache.get(`${BRIEF.competencia} ::: ${normDescritor(BRIEF.descritor)}`);
    expect(Object.keys(individual!.formatos).sort()).toEqual(Object.keys(doCache!.formatos).sort());
    expect(individual!.kitId).toBe(doCache!.kitId);
  });

  /**
   * O caso que ESCAPOU: os testes acima consultam o cache com o descritor do BRIEF,
   * que é sempre o mesmo dos dois lados — assim a divergência de grafia nunca é
   * exercitada. Em produção quem consulta é o overlay, com o descritor do PLANO, que
   * às vezes vem com prefixo de código. `resolverDesafioDoKit` normaliza (normDescritor)
   * desde 20/07; o cache não normalizava, e como o overlay real SEMPRE tem cache, o
   * caminho tolerante nunca rodava. Medido em ibipeba (29/07): 29 leituras caíram no
   * conteúdo genérico com o kit publicado do DISC na prateleira.
   */
  it('o cache casa o descritor do PLANO (com prefixo) no brief de nome limpo', async () => {
    const doPlano = 'COO03_D3 — ' + BRIEF.descritor; // grafia da trilha
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });

    // Pelo CONSUMIDOR real (overlayKitNaSemana), não reconstruindo a chave aqui:
    // um teste que monta a chave com a mesma função da implementação passaria mesmo
    // se o overlay consultasse de outro jeito — que é exatamente o que acontecia.
    const semanaPlan: any = {
      semana: 7, tipo: 'conteudo', descritor: doPlano,
      conteudo: { formato_core: 'texto', formatos_disponiveis: {} },
    };
    await overlayKitNaSemana(sbMock() as any, semanaPlan, {
      empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo, formatoPref: 'texto',
      competenciaFoco: BRIEF.competencia, kitsCache: cache,
    });

    const individual = await resolverKitDaSemana(sbMock() as any, { ...ARGS, descritor: doPlano });
    expect(individual).not.toBeNull();
    expect(semanaPlan.conteudo.kit_id).toBe(individual!.kitId); // overlay aplicou o MESMO kit
  });

  /**
   * Cargo é FILTRO, não desempate. Quando o brief do cargo certo não tem o DISC da
   * pessoa, o kit de OUTRO cargo NÃO pode entrar: o desafio e a ação observável são
   * escritos no registro daquele cargo. Decisão do Rodrigo (29/07) depois de medir 18
   * leituras assim em ibipeba — conteúdo do cargo errado é pior que o genérico.
   * Os dois resolvedores barram igual; o cache ainda marca `barradoPorCargo` para o
   * overlay registrar o motivo certo.
   */
  describe('kit de outro cargo é barrado', () => {
    const OUTRO = { ...BRIEF, id: 'b2', cargo: 'Gestão Escolar' }; // colab é Coordenação
    const sbOutroCargo = () => ({
      from: (nome: string) => {
        const rows = nome === 'kit_briefs' ? [OUTRO] : nome === 'kits' ? [{ ...KIT, brief_id: 'b2' }] : CONTEUDOS;
        const q: any = {
          select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q, order: () => q,
          maybeSingle: async () => ({ data: rows[0] ?? null }),
          then: (res: any) => Promise.resolve({ data: rows }).then(res),
        };
        return q;
      },
    });
    const COLAB = { empresaId: 'e1', disc: 'S', cargo: 'Coordenação Pedagógica' };

    it('resolverKitDaSemana não serve kit de cargo divergente', async () => {
      const kit = await resolverKitDaSemana(sbOutroCargo() as any, { ...ARGS, cargo: COLAB.cargo });
      expect(kit).toBeNull();
    });

    it('o cache marca barradoPorCargo em vez de servir o kit', async () => {
      const cache = await precarregarKits(sbOutroCargo() as any, COLAB);
      const entrada = cache.get(`${BRIEF.competencia} ::: ${normDescritor(BRIEF.descritor)}`);
      expect(entrada?.kitId).toBeNull();
      expect(entrada?.barradoPorCargo).toBe('Gestão Escolar');
    });

    it('o overlay não aplica o kit barrado', async () => {
      const cache = await precarregarKits(sbOutroCargo() as any, COLAB);
      const plan: any = { semana: 7, tipo: 'conteudo', descritor: BRIEF.descritor, conteudo: { formato_core: 'texto', formatos_disponiveis: {} } };
      await overlayKitNaSemana(sbOutroCargo() as any, plan, {
        ...COLAB, formatoPref: 'texto', competenciaFoco: BRIEF.competencia, kitsCache: cache,
      });
      expect(plan.conteudo.kit_id).toBeUndefined(); // mantém o conteúdo do build
    });

    it('brief SEM cargo segue servindo (curinga do legado)', async () => {
      const sbCuringa = () => ({
        from: (nome: string) => {
          const rows = nome === 'kit_briefs' ? [{ ...BRIEF, cargo: null }] : nome === 'kits' ? [KIT] : CONTEUDOS;
          const q: any = {
            select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q, order: () => q,
            maybeSingle: async () => ({ data: rows[0] ?? null }),
            then: (res: any) => Promise.resolve({ data: rows }).then(res),
          };
          return q;
        },
      });
      const kit = await resolverKitDaSemana(sbCuringa() as any, { ...ARGS, cargo: COLAB.cargo });
      expect(kit?.kitId).toBe('k1');
    });
  });

  it('nenhum dos dois serve vídeo — o vídeo é do pipeline de célula', async () => {
    const individual = await resolverKitDaSemana(sbMock() as any, ARGS);
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    expect(individual!.formatos).not.toHaveProperty('video');
    expect(cache.get(`${BRIEF.competencia} ::: ${normDescritor(BRIEF.descritor)}`)!.formatos).not.toHaveProperty('video');
  });
});
