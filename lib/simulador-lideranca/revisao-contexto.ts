import { createHash } from 'node:crypto';
import type { Episodio } from './schema';
/** Identifica as avaliações exibidas, sem conversa, preparação ou reflexão. */
export function referenciaEncontros(
  encontros: Array<
    Pick<Episodio, 'id' | 'indice' | 'repeticao' | 'encerradoEm' | 'avaliacao'>
  >,
) {
  const recorte = encontros
    .filter((e) => e.avaliacao)
    .map((e) => ({
      id: e.id,
      indice: e.indice,
      repeticao: !!e.repeticao,
      encerradoEm: e.encerradoEm,
      avaliacao: e.avaliacao,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(recorte)).digest('hex');
}
