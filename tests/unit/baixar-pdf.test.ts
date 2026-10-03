import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { baixarPdf, nomeDoArquivo, pareceUmPdf } from '@/lib/relatorios/baixar-pdf';

/**
 * R-129 (revisão de 02/10/2026): os downloads da central do RH eram
 * `<a href download>` direto. Se o PDF falhava, o RH ficava com um arquivo
 * `.pdf` que era JSON, ou com a mensagem interna crua na tela. Agora o pedido
 * vai por fetch e só PDF vira arquivo.
 */
const PDF = '%PDF-1.7\nconteúdo';

function resposta(opts: { status?: number; corpo?: string; cabecalhos?: Record<string, string>; url?: string }) {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: opts.url ?? 'https://rh.vertho.ai/api/relatorios/pdf?id=1',
    headers: new Headers(opts.cabecalhos ?? {}),
    blob: async () => new Blob([opts.corpo ?? PDF]),
  } as unknown as Response;
}

function ambiente(r: Response | Error) {
  const salvar = vi.fn();
  const fetch = vi.fn(async () => { if (r instanceof Error) throw r; return r; });
  return { salvar, fetch, ambiente: { fetch, salvar } };
}

describe('baixarPdf: só PDF vira arquivo', () => {
  it('🔴 500 com JSON: nada é salvo e o motivo volta para a tela', async () => {
    const a = ambiente(resposta({ status: 500, corpo: '{"error":"Cannot convert argument to a ByteString"}' }));
    const r = await baixarPdf('/api/relatorios/evolucao/pdf', 'reserva.pdf', a.ambiente);
    expect(r).toEqual({ ok: false, motivo: 'http', status: 500 });
    expect(a.salvar).not.toHaveBeenCalled();
  });

  it('🔴 200 com corpo que não é PDF também não vira arquivo', async () => {
    const a = ambiente(resposta({ corpo: '{"error":"x"}', cabecalhos: { 'content-type': 'application/pdf' } }));
    const r = await baixarPdf('/x', 'reserva.pdf', a.ambiente);
    expect(r).toMatchObject({ ok: false, motivo: 'formato' });
    expect(a.salvar).not.toHaveBeenCalled();
  });

  it('PDF salva com o nome do cabeçalho, acento incluído', async () => {
    const a = ambiente(resposta({
      cabecalhos: { 'content-disposition': `attachment; filename="vertho-evolucao-diretores-_-turma-1.pdf"; filename*=UTF-8''vertho-evolucao-diretores-%E2%80%94-turma-1-maca%C3%A9.pdf` },
    }));
    const r = await baixarPdf('/api/relatorios/evolucao/pdf', 'reserva.pdf', a.ambiente);
    expect(r).toEqual({ ok: true, nome: 'vertho-evolucao-diretores-—-turma-1-macaé.pdf' });
    expect(a.salvar).toHaveBeenCalledTimes(1);
    expect(a.salvar.mock.calls[0][1]).toBe('vertho-evolucao-diretores-—-turma-1-macaé.pdf');
  });

  it('PDF de octet-stream (Storage antigo) é aceito pelos bytes', async () => {
    const a = ambiente(resposta({ cabecalhos: { 'content-type': 'application/octet-stream' } }));
    expect((await baixarPdf('/x', 'vertho-dna.pdf', a.ambiente)).ok).toBe(true);
  });

  it('link assinado de outro domínio: o nome vem do `download` da URL final', async () => {
    const a = ambiente(resposta({ url: 'https://x.supabase.co/storage/v1/object/sign/relatorios-pdf/e/dna/1.pdf?token=t&download=vertho-dna-1756555200000.pdf' }));
    const r = await baixarPdf('/api/relatorios/organizacional?ref=x&download=1', 'vertho-dna.pdf', a.ambiente);
    expect(r).toEqual({ ok: true, nome: 'vertho-dna-1756555200000.pdf' });
  });

  it('queda de rede vira motivo, não exceção', async () => {
    const a = ambiente(new TypeError('Failed to fetch'));
    expect(await baixarPdf('/x', 'r.pdf', a.ambiente)).toEqual({ ok: false, motivo: 'rede' });
    expect(a.salvar).not.toHaveBeenCalled();
  });

  it('o pedido leva o cookie da sessão (mesma origem), como o link levava', async () => {
    const a = ambiente(resposta({}));
    await baixarPdf('/x', 'r.pdf', a.ambiente);
    expect(a.fetch).toHaveBeenCalledWith('/x', expect.objectContaining({ credentials: 'same-origin' }));
  });
});

describe('nome do arquivo', () => {
  it('ordem: filename*, filename, download da URL, reserva', () => {
    expect(nomeDoArquivo(`attachment; filename="a.pdf"; filename*=UTF-8''b%C3%A1.pdf`, null, 'r.pdf')).toBe('bá.pdf');
    expect(nomeDoArquivo('inline; filename="a.pdf"', null, 'r.pdf')).toBe('a.pdf');
    expect(nomeDoArquivo(null, 'https://s/x?download=c.pdf', 'r.pdf')).toBe('c.pdf');
    expect(nomeDoArquivo(null, '/relativa', 'r.pdf')).toBe('r.pdf');
    expect(nomeDoArquivo(`attachment; filename*=UTF-8''%E0%A4%A`, null, 'r.pdf')).toBe('r.pdf');
  });

  it('barra e caractere de controle não viram caminho', () => {
    expect(nomeDoArquivo('attachment; filename="../../x.pdf"', null, 'r.pdf')).toBe('..-..-x.pdf');
  });

  it('assinatura de PDF', () => {
    expect(pareceUmPdf(new TextEncoder().encode('%PDF-1.4'))).toBe(true);
    expect(pareceUmPdf(new TextEncoder().encode('{"er'))).toBe(false);
    expect(pareceUmPdf(new Uint8Array())).toBe(false);
  });
});

describe('a central do RH baixa pelo helper', () => {
  const VIEW = readFileSync('app/dashboard/relatorios/relatorios-rh-view.tsx', 'utf8');

  it('🔴 nenhum `<a>` aponta para rota de PDF; os dois downloads passam pelo botão', () => {
    const ancoras = [...VIEW.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    const paraPdf = ancoras.filter((a) => /href=\{[^}]*(report\.|\/api\/relatorios)/.test(a) || /\bdownload\b/.test(a));
    expect(paraPdf, 'link direto para PDF entrega JSON cru quando a rota falha').toEqual([]);
    expect((VIEW.match(/<BotaoBaixarPdf\b/g) || []).length).toBe(2);
    expect(VIEW).toContain("t('viewer.downloadError')");
  });
});
