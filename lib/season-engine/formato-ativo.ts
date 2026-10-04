/**
 * Qual formato a tela da semana ABRE, e quando o pedido não existe (R-93,
 * 04/10/2026).
 *
 * 🔴 O DEFEITO. O link da cadência traz `?formato=audio` (ou o que a pessoa prefere), e
 * a tela abria o formato pedido mesmo quando a semana não o tinha: o único teste era
 * "pediu vídeo e não há vídeo". Pedindo áudio numa semana sem áudio, `ativo` ficava
 * `audio`, o `item` não existia, a fonte caía em `conteudo.core_id` (o id do núcleo,
 * que é de OUTRO formato) e o player pedia `/api/conteudo/<id do texto>/podcast`: a rota
 * respondia 400 "Conteúdo não é podcast", o player ficava mudo, e a pessoa não via
 * nenhuma explicação. O mesmo valia para `texto` e `case` apontando para um áudio.
 *
 * A regra passa a ser uma só, para qualquer formato: o aberto é SEMPRE um dos que
 * existem. O pedido que não existe cai no núcleo da semana (o preferido, que o overlay
 * garante que existe) ou no primeiro disponível, e a tela diz que foi isso que
 * aconteceu em vez de calar.
 *
 * Puro de propósito: é a decisão que o teste precisa exercitar sem montar a tela.
 */
export interface FormatoAbertoDaSemana {
  /** O formato a abrir (`null` quando a semana não tem formato nenhum). */
  ativo: string | null;
  /**
   * O formato pedido (deep-link ou clique) que NÃO existe, para a tela avisar. `null`
   * quando o pedido existe ou não houve pedido.
   */
  pedidoIndisponivel: string | null;
}

export function resolverFormatoAtivo(args: {
  /** O que a pessoa pediu: `?formato=` do deep-link ou o último clique. */
  pedido: string | null | undefined;
  /** O formato do núcleo da semana (`conteudo.formato_core`). */
  formatoCore: string | null | undefined;
  /** Os formatos que existem de fato (já com o vídeo resolvido ao vivo). */
  formatos: string[];
  /**
   * O vídeo ainda está sendo resolvido: um pedido de `video` não pode ser dado por
   * indisponível enquanto não se sabe, ou o aviso piscaria em quem tem vídeo.
   */
  videoResolvendo?: boolean;
}): FormatoAbertoDaSemana {
  const { pedido, formatoCore, formatos } = args;
  const existe = (f: string | null | undefined): f is string => !!f && formatos.includes(f);

  if (existe(pedido)) return { ativo: pedido, pedidoIndisponivel: null };

  const reserva = existe(formatoCore) ? formatoCore : (formatos[0] ?? null);
  const aindaSemSaber = pedido === 'video' && !!args.videoResolvendo;
  return { ativo: reserva, pedidoIndisponivel: pedido && !aindaSemSaber ? pedido : null };
}

/**
 * O iframe do PDF abriu uma página de ERRO do app, e não o arquivo?
 *
 * A rota `/api/conteudo/<id>/pdf` redireciona (302) para o Storage, que é outra origem.
 * Quando não há PDF ela responde um JSON `{ error }` NA MESMA origem, e o iframe o
 * desenhava como texto cru. Mesma origem deixa o pai ler o documento do iframe; outra
 * origem (o PDF de verdade) lança `SecurityError`, que aqui significa "carregou bem".
 */
export function iframeMostrouErroDoApp(iframe: { contentDocument?: any } | null | undefined): boolean {
  try {
    const doc = iframe?.contentDocument;
    if (!doc) return false;
    if (typeof doc.contentType === 'string' && doc.contentType.includes('json')) return true;
    const texto = String(doc.body?.textContent ?? '').trim();
    return /^\{\s*"error"\s*:/.test(texto);
  } catch {
    return false;
  }
}
