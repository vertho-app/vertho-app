import 'server-only';
import { z } from 'zod';
import type { Estado } from './schema';
import { SimuladorError } from './core';
import { notaPacePublica } from './escala';

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
};
export type LinhaResumo = {
  id: string;
  created_at: string;
  colaborador_id?: string | null;
  resumo: Omit<ResumoTreino, 'id' | 'criadoEm' | 'testeAdmin'>;
};
export const COLUNAS_HISTORICO = 'id,created_at,colaborador_id,resumo';
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
      escalaOriginal: r.resumo.versaoRegua === 'pace-6' ? null : '0-10',
      id: r.id,
      criadoEm: r.created_at,
      testeAdmin: !r.colaborador_id,
    })),
    proximoCursor:
      rows.length > tamanho && last
        ? Buffer.from(
            JSON.stringify({ em: last.created_at, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
