import { describe, it, expect } from 'vitest';
import { resolverKitDaSemana, precarregarKits } from '@/lib/season-engine/kit/entrega-semana';

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
      select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q,
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
    const entrada = cache.get(`${BRIEF.competencia} ::: ${BRIEF.descritor}`);
    expect(entrada).toBeTruthy();
    expect(Object.keys(entrada!.formatos).sort()).toEqual(['audio', 'case', 'texto']);
  });

  it('os dois caminhos concordam — nenhum esconde formato que o outro serve', async () => {
    const individual = await resolverKitDaSemana(sbMock() as any, ARGS);
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    const doCache = cache.get(`${BRIEF.competencia} ::: ${BRIEF.descritor}`);
    expect(Object.keys(individual!.formatos).sort()).toEqual(Object.keys(doCache!.formatos).sort());
    expect(individual!.kitId).toBe(doCache!.kitId);
  });

  it('nenhum dos dois serve vídeo — o vídeo é do pipeline de célula', async () => {
    const individual = await resolverKitDaSemana(sbMock() as any, ARGS);
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    expect(individual!.formatos).not.toHaveProperty('video');
    expect(cache.get(`${BRIEF.competencia} ::: ${BRIEF.descritor}`)!.formatos).not.toHaveProperty('video');
  });
});
