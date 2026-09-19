import 'server-only';
import { z } from 'zod';
import type { Estado } from './schema';
import { SimuladorError } from './core';
import { notaPacePublica } from './escala';
import { escalaNativa14 } from './matriz-avaliacao';
import type { NotasPorCompetencia } from './evolucao';

export type ResumoTreino = {
  id: string;
  criadoEm: string;
  status: Estado['status'];
  nivel: 1 | 2 | 3;
  nome: string | null;
  nomeVendedor: string;
  nota: number | null;
  temRelatorio: boolean;
  versaoRegua: string;
  testeAdmin: boolean;
  /** Só no histórico do PRÓPRIO participante, e só de devolutiva liberada. */
  competencias?: NotasPorCompetencia | null;
  /** Título da recomendação prioritária: o foco sugerido para o próximo treino. */
  foco?: string | null;
};
type NotaJson = number | null | undefined;
export type LinhaResumo = {
  id: string;
  created_at: string;
  colaborador_id?: string | null;
  resumo: Omit<ResumoTreino, 'id' | 'criadoEm' | 'testeAdmin' | 'competencias' | 'foco'>;
  // Projeções do histórico do participante (COLUNAS_HISTORICO_PARTICIPANTE).
  pl?: NotaJson;
  p?: NotaJson;
  a?: NotaJson;
  c?: NotaJson;
  e?: NotaJson;
  liberado?: unknown;
  foco?: unknown;
};
export const COLUNAS_HISTORICO = 'id,created_at,colaborador_id,resumo';
/**
 * O participante vê a própria evolução por competência e o foco sugerido. São
 * caminhos JSON pequenos, não o relatório: a lista não carrega conversa nem
 * evidências. `liberado` é a avaliação da experiência, que libera a devolutiva.
 */
export const COLUNAS_HISTORICO_PARTICIPANTE =
  COLUNAS_HISTORICO +
  ',pl:estado->relatorio->PL,p:estado->relatorio->P,a:estado->relatorio->A,c:estado->relatorio->C,e:estado->relatorio->E' +
  ',liberado:estado->feedback->realismo,foco:estado->relatorio->Recomendacoes->0->>titulo';
const nota = (n: NotaJson) => (typeof n === 'number' ? n : null);
/** Evolução e foco só de devolutiva LIBERADA e na escala 1 a 4 nativa (pace-6 em diante). */
function evolucaoDaLinha(r: LinhaResumo) {
  if (r.liberado == null || !escalaNativa14(r.resumo?.versaoRegua)) return {};
  return {
    competencias: { PL: nota(r.pl), P: nota(r.p), A: nota(r.a), C: nota(r.c), E: nota(r.e) },
    foco: typeof r.foco === 'string' && r.foco.trim() ? r.foco.trim() : null,
  };
}
const cursorSchema = z
  .object({ em: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .strict();
export function lerCursor(cursor?: string | null) {
  if (!cursor) return null;
  try {
    if (cursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(cursor))
      throw new Error();
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
  } catch {
    throw new SimuladorError(
      400,
      'Página de histórico inválida. Atualize a lista.',
    );
  }
}
export function aplicarCursor(query: any, cursor?: string | null) {
  const c = lerCursor(cursor);
  // Somente timestamp ISO e UUID validados entram na gramática PostgREST.
  return c
    ? query.or(`created_at.lt.${c.em},and(created_at.eq.${c.em},id.lt.${c.id})`)
    : query;
}
export function paginaDeHistorico(rows: LinhaResumo[], tamanho: number) {
  const itens = rows.slice(0, tamanho);
  const last = itens.at(-1);
  return {
    historico: itens.map((r) => ({
      ...r.resumo,
      nota: notaPacePublica(r.resumo.nota, r.resumo.versaoRegua),
      escalaOriginal: escalaNativa14(r.resumo.versaoRegua) ? null : '0-10',
      id: r.id,
      criadoEm: r.created_at,
      testeAdmin: !r.colaborador_id,
      ...evolucaoDaLinha(r),
    })),
    proximoCursor:
      rows.length > tamanho && last
        ? Buffer.from(
            JSON.stringify({ em: last.created_at, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
