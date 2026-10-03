import 'server-only';

import { createHash } from 'node:crypto';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';
import {
  GRAVACAO_TAMANHO_DA_ETIQUETA,
  entradaDaEtiqueta,
} from '@/lib/demo/degustacao-gravacao';

/**
 * A etiqueta que o navegador do lead põe na gravação, calculada do lado do
 * painel: `sha256("degustacao:" + código do convite)`, 12 primeiros hex. O
 * navegador calcula o mesmo com `crypto.subtle`
 * (`app/degustacao/gravacao-da-degustacao.tsx`); `tests/unit/degustacao-gravacao.test.ts`
 * prova que os dois caminhos dão o mesmo valor.
 */
export function etiquetaDaGravacao(slug: string, sessionId: string): string {
  return createHash('sha256')
    .update(entradaDaEtiqueta(emitirCodigoCurto(slug, sessionId)))
    .digest('hex')
    .slice(0, GRAVACAO_TAMANHO_DA_ETIQUETA);
}
