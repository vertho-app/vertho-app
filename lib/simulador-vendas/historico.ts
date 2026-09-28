import 'server-only';
import { z } from 'zod';
import { SimuladorError } from './core';
import { pontuacaoMatriz } from './escala';
import type { AvaliacaoMatriz } from './matriz-avaliacao';
import {
  notaVemDaMatriz,
  resumoPublico,
  type LinhaResumo,
  type PontuacaoMatriz,
} from './resumo';

// A projeção de cada linha é pura e mora em `resumo.ts` (o harness da tela usa a mesma).
export {
  ehTesteAdmin,
  notaVemDaMatriz,
  type LinhaResumo,
  type PontuacaoMatriz,
  type ResumoTreino,
} from './resumo';

export const COLUNAS_HISTORICO = 'id,created_at,colaborador_id,owner_key,resumo';
/**
 * O participante vê a própria evolução por competência e o foco sugerido. São
 * caminhos JSON pequenos, não o relatório: a lista não carrega conversa nem
 * evidências. `liberado` é a avaliação da experiência, que libera a devolutiva.
 */
export const COLUNAS_HISTORICO_PARTICIPANTE =
  COLUNAS_HISTORICO +
  ',pl:estado->relatorio->PL,p:estado->relatorio->P,a:estado->relatorio->A,c:estado->relatorio->C,e:estado->relatorio->E' +
  ',liberado:estado->feedback->realismo,foco:estado->relatorio->Recomendacoes->0->>titulo';
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
/**
 * UMA nota por treino (V-5, 27/09/2026). A devolutiva de um treino pace-4/pace-5
 * recalcula as notas pela matriz, incluindo Planejamento (`relatorioPacePublico`);
 * o histórico, a gestão e o CSV convertiam linearmente a média 0 a 10 gravada
 * (`1 + 3n/10`), que deixa Planejamento de fora. Plano N1 e conversa N3 davam
 * 3,25 (Nível 3) na lista e 2,6 (Nível 2) na devolutiva. Aqui a lista lê a
 * matriz SÓ dessas versões (as da pace-6 em diante já gravam a média da matriz)
 * e calcula com a mesma função da devolutiva; a conversão linear fica para quem
 * não tem matriz.
 *
 * `consulta(colunas)` devolve a consulta já escopada a quem pergunta (dono ou
 * tenant); aqui só se acrescenta o filtro por id, em lotes de 100.
 */
export async function pontuacoesDaMatriz(
  consulta: (colunas: string) => any,
  linhas: Array<{ id: string; versaoRegua?: string | null; comRelatorio: boolean }>,
): Promise<Map<string, PontuacaoMatriz>> {
  const alvo = linhas.filter((l) => l.comRelatorio && notaVemDaMatriz(l.versaoRegua));
  const mapa = new Map<string, PontuacaoMatriz>();
  for (let i = 0; i < alvo.length; i += 100) {
    const lote = alvo.slice(i, i + 100);
    const { data, error } = await consulta('id,matriz:estado->relatorio->Matriz').in(
      'id',
      lote.map((l) => l.id),
    );
    if (error)
      throw new SimuladorError(503, 'Não foi possível consultar as notas dos treinos.');
    for (const r of (data || []) as Array<{ id: string; matriz?: unknown }>) {
      const versao = lote.find((l) => l.id === r.id)?.versaoRegua ?? undefined;
      if (r.matriz && typeof r.matriz === 'object')
        mapa.set(r.id, pontuacaoMatriz(r.matriz as AvaliacaoMatriz, versao));
    }
  }
  return mapa;
}
export function paginaDeHistorico(
  rows: LinhaResumo[],
  tamanho: number,
  opcoes: { notasMatriz?: Map<string, PontuacaoMatriz>; participante?: boolean } = {},
) {
  const itens = rows.slice(0, tamanho);
  const last = itens.at(-1);
  return {
    historico: itens.map((r) => resumoPublico(r, opcoes)),
    proximoCursor:
      rows.length > tamanho && last
        ? Buffer.from(
            JSON.stringify({ em: last.created_at, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
