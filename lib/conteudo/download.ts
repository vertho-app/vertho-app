import { NextResponse } from 'next/server';

/**
 * Transforma a URL pública de um artefato (Storage/CDN) num DOWNLOAD com nome.
 *
 * 🔑 POR QUE NÃO BASTA O 302 (nem o `download` do `<a>`)
 * ─────────────────────────────────────────────────────
 * As rotas de conteúdo redirecionam para o Storage, que serve o arquivo
 * `inline` e com nome de hash (`a7f3….mp3`). E o atributo `download` do link
 * **é ignorado quando o arquivo está em outra origem** — que é sempre o caso
 * aqui. Sem este proxy, "baixar" abre uma aba e entrega ao admin um arquivo
 * cujo nome não diz de quem é: numa auditoria com dez pessoas, é exatamente o
 * que não pode acontecer.
 *
 * O custo é o arquivo passar pela função. Vale para PDF e MP3 (poucos MB);
 * **não** vale para vídeo — o MP4 tem rota própria, que já faz stream do Bunny
 * (`/api/video-download/[videoId]`).
 */

/**
 * Caracteres de controle, montados por código.
 *
 * Escritos como literal, eles entram no arquivo como bytes crus e sobrevivem
 * mal a qualquer ferramenta que reescreva o fonte — `lib/domain.ts` já carrega
 * a mesma cicatriz e a mesma solução.
 */
const CONTROLE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]+`,
  'g',
);

/** Nome de arquivo seguro: sem separador de caminho, sem excesso, com extensão. */
export function nomeDeArquivo(bruto: string | null | undefined, ext: string): string {
  const base = String(bruto || 'conteudo')
    // `/` e `\` sairiam do diretório; `"` quebraria o header; e um `\r\n` no
    // meio do nome seria injeção de cabeçalho na resposta.
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(CONTROLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'conteudo';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

const TIPO: Record<string, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
};

export async function servirComoDownload(
  urlDoArquivo: string,
  nomePedido: string | null | undefined,
  ext: 'pdf' | 'mp3',
): Promise<Response> {
  const nome = nomeDeArquivo(nomePedido, ext);

  const upstream = await fetch(urlDoArquivo, { cache: 'no-store' });
  // Falha aqui NÃO pode virar um arquivo vazio com nome bonito — o admin
  // guardaria um PDF de 0 byte achando que tem o material.
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `arquivo indisponível na origem (${upstream.status})` },
      { status: 502 },
    );
  }

  // ASCII no `filename` (reserva) e UTF-8 no `filename*` (RFC 5987), que é o que
  // preserva acento e o `·` do nome montado pela tela.
  const asciiSeguro = nome.replace(/[^\x20-\x7E]/g, '_');

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || TIPO[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiSeguro}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
