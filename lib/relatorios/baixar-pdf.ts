/**
 * Baixar PDF por `fetch`, com a falha tratada na tela (R-129, 03/10/2026).
 *
 * Os downloads da central do RH eram `<a href download>` direto para a rota.
 * Quando o PDF falhava, a rota respondia JSON e o navegador fazia o que sabe
 * fazer com isso: salvava um arquivo `.pdf` com `{"error": ...}` dentro, ou
 * abria a página com a mensagem interna crua ("Cannot convert argument to a
 * ByteString...", medido no PDF de evolução das turmas de Macaé, que têm
 * travessão no nome). Aqui o pedido vai por `fetch` e só vira arquivo o que É
 * um PDF; o resto volta como motivo, e a tela mostra a mensagem dela.
 *
 * Sem `'use client'` de propósito: as funções puras são testadas em node, e o
 * `baixarPdf` recebe o ambiente do navegador por parâmetro.
 */

export type FalhaDownload = 'http' | 'formato' | 'rede';
export type ResultadoDownload = { ok: true; nome: string } | { ok: false; motivo: FalhaDownload; status?: number };

/** Assinatura de todo PDF: o arquivo começa com `%PDF-`. */
export function pareceUmPdf(inicio: Uint8Array): boolean {
  const assinatura = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  return inicio.length >= assinatura.length && assinatura.every((b, i) => inicio[i] === b);
}

function limparNome(nome: string): string {
  return nome.replace(/[\\/\x00-\x1f\x7f]/g, '-').trim();
}

/**
 * Nome do arquivo salvo, na ordem de quem sabe mais:
 *  1. `filename*=UTF-8''...` do `Content-Disposition` (o nome com acento);
 *  2. `filename="..."` (a versão ASCII);
 *  3. `download=` da URL final: o PDF organizacional chega por link assinado
 *     do Storage, de outro domínio, e o cabeçalho não é exposto ao `fetch`
 *     entre domínios; o nome pedido viaja na própria URL;
 *  4. o nome de reserva da tela.
 */
export function nomeDoArquivo(contentDisposition: string | null | undefined, urlFinal: string | null | undefined, reserva: string): string {
  const cd = contentDisposition || '';
  const estendido = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (estendido) {
    try {
      const nome = limparNome(decodeURIComponent(estendido[1].trim()));
      if (nome) return nome;
    } catch { /* codificação inválida: tenta o próximo */ }
  }
  const simples = cd.match(/filename\s*=\s*"([^"]*)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);
  if (simples) {
    const nome = limparNome(simples[1]);
    if (nome) return nome;
  }
  if (urlFinal) {
    try {
      const nome = limparNome(new URL(urlFinal).searchParams.get('download') || '');
      if (nome) return nome;
    } catch { /* URL relativa ou inválida */ }
  }
  return reserva;
}

export type AmbienteDownload = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Entrega o arquivo à pessoa. No navegador: link temporário com `download`. */
  salvar: (arquivo: Blob, nome: string) => void;
};

/** O `salvar` do navegador. Revoga o link depois, não no mesmo tique do clique. */
export function salvarNoNavegador(arquivo: Blob, nome: string): void {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function baixarPdf(
  url: string,
  reserva: string,
  ambiente: AmbienteDownload = { fetch: (u, i) => fetch(u, i), salvar: salvarNoNavegador },
): Promise<ResultadoDownload> {
  let resposta: Response;
  try {
    // Mesma origem: o cookie da sessão vai junto, como ia no `<a href>`.
    resposta = await ambiente.fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { ok: false, motivo: 'rede' };
  }
  if (!resposta.ok) return { ok: false, motivo: 'http', status: resposta.status };

  let arquivo: Blob;
  try {
    arquivo = await resposta.blob();
  } catch {
    return { ok: false, motivo: 'rede' };
  }
  // Pelos bytes, não pelo `Content-Type`: PDF antigo do Storage pode ter
  // subido como `application/octet-stream`, e um 200 com corpo de erro não
  // pode virar arquivo.
  const inicio = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
  if (!pareceUmPdf(inicio)) return { ok: false, motivo: 'formato', status: resposta.status };

  const nome = nomeDoArquivo(resposta.headers.get('content-disposition'), resposta.url, reserva);
  ambiente.salvar(arquivo, nome);
  return { ok: true, nome };
}
