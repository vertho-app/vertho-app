// O GUID dentro da URL de embed do Bunny.
//
// 🔴 POR QUE ESTE ARQUIVO EXISTE (19/08/2026)
// ───────────────────────────────────────────
// A primeira versão desta lógica morava DENTRO do componente da tela e fazia
// `split('/').pop()`. O embed real termina com querystring
// (`?autoplay=false&responsive=true`), então o último segmento vinha
// `{guid}?autoplay=false&responsive=true`, a validação de UUID recusava e **o
// botão de baixar vídeo não aparecia** — enquanto áudio e PDF apareciam.
//
// Nada quebrou, nada avisou: faltou uma opção na tela, e só o dono percebeu.
// A lição está no teste que faltava, não no regex: lógica que pode errar sai da
// tela e vira função exercitada — a URL REAL, com query, é o primeiro caso aqui.
import { describe, it, expect } from 'vitest';
import { guidDoEmbedBunny } from '@/lib/conteudo/bunny-embed';

const GUID = '3153294a-0bfd-46ec-b64a-8450520be102';
const LIB = '470584';

describe('guid do embed', () => {
  it('🔴 a URL REAL, com querystring, devolve o guid', () => {
    expect(guidDoEmbedBunny(
      `https://iframe.mediadelivery.net/embed/${LIB}/${GUID}?autoplay=false&responsive=true`,
    )).toBe(GUID);
  });

  it('sem querystring também', () => {
    expect(guidDoEmbedBunny(`https://iframe.mediadelivery.net/embed/${LIB}/${GUID}`)).toBe(GUID);
  });

  it('com hash, e com barra final', () => {
    expect(guidDoEmbedBunny(`https://iframe.mediadelivery.net/embed/${LIB}/${GUID}#t=10`)).toBe(GUID);
    expect(guidDoEmbedBunny(`https://iframe.mediadelivery.net/embed/${LIB}/${GUID}/`)).toBe(GUID);
  });

  it('normaliza para minúsculas — a rota compara o formato do GUID', () => {
    expect(guidDoEmbedBunny(`https://iframe.mediadelivery.net/embed/${LIB}/${GUID.toUpperCase()}`)).toBe(GUID);
  });

  it('🔴 o que NÃO é embed devolve null — some o botão, não vai um 400 para o admin', () => {
    for (const entrada of [
      null,
      undefined,
      '',
      'https://iframe.mediadelivery.net/embed/470584/nao-e-um-guid',
      'https://iframe.mediadelivery.net/embed/470584',
      `https://outro.dominio/embed/${LIB}/${GUID}`.replace('/embed/', '/x/'),
      GUID, // o guid sozinho não é um embed
    ]) {
      expect(guidDoEmbedBunny(entrada as any), String(entrada)).toBeNull();
    }
  });
});
