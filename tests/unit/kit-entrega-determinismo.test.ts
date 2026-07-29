import { describe, it, expect } from 'vitest';
import { resolverKitDaSemana, precarregarKits } from '@/lib/season-engine/kit/entrega-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

/**
 * INVARIANTE (FMEA-PIPELINE 1.5, residual): com DUPLICATAS do mesmo formato sob o
 * mesmo kit_id (re-runs de geração empilham cópias — a idempotência é pulada quando
 * vem de kit), os DOIS resolvedores escolhem a MESMA cópia, e a escolhida é a mais
 * RECENTE (created_at desc, desempate id desc) — a regra que a entrega de vídeo já
 * usa (`actions/gerar-video.ts:136`). Antes não havia ORDER BY e o merge
 * `formatos[c.formato] = …` servia uma cópia ARBITRÁRIA (ordem do Postgres).
 *
 * O stub simula o Postgres honrando ORDER BY: com `.order()` ele ordena; SEM
 * `.order()` ele devolve na ordem ADVERSA (mais antiga primeiro). Logo, remover a
 * ordenação do código (mutação) derruba estes testes.
 */

const BRIEF = { id: 'b1', competencia: 'Planejamento', descritor: 'Gestão de riscos', cargo: 'Gestão Escolar', empresa_id: 'e1' };
const KIT = { id: 'k1', brief_id: 'b1', disc: 'S', desafio: { desafio_texto: 'faça X' } };
// Duas cópias de 'texto' no MESMO kit: a velha (re-run anterior) e a nova.
const TEXTO_VELHO = { id: 'c-texto-velho', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto v1', created_at: '2026-07-20T10:00:00Z' };
const TEXTO_NOVO = { id: 'c-texto-novo', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto v2', created_at: '2026-07-25T10:00:00Z' };
const CASE_UNICO = { id: 'c-case', kit_id: 'k1', formato: 'case', url: null, titulo: 'Caso', created_at: '2026-07-20T10:00:00Z' };
// Ordem ADVERSA de chegada (mais antiga primeiro): sem ORDER BY, tanto
// "primeiro fica" quanto "último sobrescreve" escolheriam a cópia VELHA.
const CONTEUDOS_ADVERSOS = [TEXTO_VELHO, CASE_UNICO, TEXTO_NOVO];

/** Stub que honra ORDER BY como o Postgres; sem `.order()`, devolve na ordem adversa. */
function sbMock() {
  const tabela = (nome: string) => {
    const rows: any[] =
      nome === 'kit_briefs' ? [BRIEF] :
      nome === 'kits' ? [KIT] :
      nome === 'micro_conteudos' ? [...CONTEUDOS_ADVERSOS] : [];
    let ordenado = false;
    const q: any = {
      select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q,
      order: () => { ordenado = true; return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (res: any) => {
        const out = ordenado
          ? [...rows].sort((a, b) =>
              String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) ||
              String(b.id).localeCompare(String(a.id)))
          : rows; // sem ORDER BY: ordem arbitrária — aqui, a pior possível
        return Promise.resolve({ data: out }).then(res);
      },
    };
    return q;
  };
  return { from: (n: string) => tabela(n) };
}

const ARGS = { empresaId: 'e1', competencia: BRIEF.competencia, descritor: BRIEF.descritor, disc: 'S', cargo: BRIEF.cargo };
// A chave do cache normaliza o descritor (normDescritor): o overlay consulta com o
// descritor do PLANO, que pode vir prefixado ("COO03_D3 — Nome"), e o cache é montado
// com o do BRIEF. Ver kit-entrega-paridade.test.ts.
const KEY = `${BRIEF.competencia} ::: ${normDescritor(BRIEF.descritor)}`;

describe('duplicatas de kit — escolha determinística (a mais recente vence)', () => {
  it('resolverKitDaSemana escolhe a cópia mais recente do formato duplicado', async () => {
    const kit = await resolverKitDaSemana(sbMock() as any, ARGS);
    expect(kit!.formatos.texto.id).toBe('c-texto-novo');
    expect(kit!.formatos.case.id).toBe('c-case');
  });

  it('precarregarKits escolhe a cópia mais recente do formato duplicado', async () => {
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    const entrada = cache.get(KEY)!;
    expect(entrada.formatos.texto.id).toBe('c-texto-novo');
    expect(entrada.formatos.case.id).toBe('c-case');
  });

  it('os DOIS resolvedores escolhem a MESMA cópia (paridade sob duplicata)', async () => {
    const individual = await resolverKitDaSemana(sbMock() as any, ARGS);
    const cache = await precarregarKits(sbMock() as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    const doCache = cache.get(KEY)!;
    for (const fmt of Object.keys(individual!.formatos)) {
      expect(doCache.formatos[fmt]?.id).toBe(individual!.formatos[fmt].id);
    }
  });
});
