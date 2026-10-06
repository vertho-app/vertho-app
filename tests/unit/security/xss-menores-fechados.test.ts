/**
 * Reanálise de segurança de 05/10/2026, os dois pontos de XSS que sobraram depois do e-mail de disparo
 * (esse tem o teste de comportamento em `tests/unit/emails-4-idiomas.test.ts`):
 *
 *  1. `/api/inbox/midia/[mediaId]`: quando a cópia no Storage falha, a rota entrega o binário que baixou
 *     da Meta com o `Content-Type` do REMETENTE e `Content-Disposition: inline`. Um `text/html` ou
 *     `image/svg+xml` mandado por WhatsApp abriria como página na origem do app, com a sessão do admin;
 *  2. `/api/upload-logo`: aceitava `image/svg+xml` pelo tipo que o CLIENTE declara, num bucket público.
 *     O app só mostra o logo em `<img>`, mas o link direto do Storage abre o SVG como documento.
 *
 * Validado por mutação: voltar o `inline` para qualquer tipo, ou o SVG para a lista, reprova um teste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cabecalhosDoArquivoRecebido } from '@/lib/inbox/midia-recebida';
import { semComentarios } from '../../helpers/fonte';

describe('cabecalhosDoArquivoRecebido: o tipo vem do remetente', () => {
  it.each([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg; codecs=opus', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'video/mp4', 'video/3gpp', 'application/pdf', 'IMAGE/PNG', '  image/png  ',
  ])('%s segue inline, com o próprio tipo e nosniff', (mime) => {
    const h = cabecalhosDoArquivoRecebido(mime);
    expect(h['Content-Disposition']).toBe('inline');
    expect(h['Content-Type']).toBe(mime.trim());
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(h['Cache-Control']).toBe('private, max-age=300');
  });

  it.each([
    'text/html', 'text/html; charset=utf-8', 'image/svg+xml', 'application/xml', 'text/xml', 'text/javascript', 'application/javascript',
    'application/xhtml+xml', 'image/png-evil', 'image/pngx', 'audio/ogg.html', 'text/plain', 'application/octet-stream', '', '   ', null, undefined,
  ])('🔴 %j sai como DOWNLOAD, sem tipo, num sandbox', (mime) => {
    const h = cabecalhosDoArquivoRecebido(mime as any);
    expect(h['Content-Disposition']).toBe('attachment');
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toBe("default-src 'none'; sandbox");
    expect(h['Cache-Control']).toBe('private, max-age=300');
  });
});

describe('a rota da mídia usa o helper no ramo do binário', () => {
  const rota = semComentarios(readFileSync('app/api/inbox/midia/[mediaId]/route.ts', 'utf8'));

  it('🔴 o ramo `guarda.body` monta os cabeçalhos por cabecalhosDoArquivoRecebido, e não por `inline` fixo', () => {
    expect(rota).toContain('headers: cabecalhosDoArquivoRecebido(guarda.mime)');
    expect(rota).not.toMatch(/'Content-Disposition':\s*'inline'/);
    expect(rota).not.toMatch(/'Content-Type':\s*guarda\.mime/);
  });
});

describe('logo da empresa: sem SVG', () => {
  const rota = semComentarios(readFileSync('app/api/upload-logo/route.ts', 'utf8'));

  it('🔴 a lista de tipos aceitos não tem svg, e a mensagem de erro não o oferece', () => {
    const linha = rota.split('\n').find((l) => l.includes('const allowed')) || '';
    expect(linha).toContain("'image/png'");
    expect(linha).not.toMatch(/svg/i);
    expect(rota).not.toMatch(/Use PNG, JPG, SVG/);
  });

  it('a tela não oferece SVG no seletor de arquivo nem no texto de ajuda (4 idiomas)', () => {
    expect(readFileSync('app/admin/empresas/[empresaId]/configuracoes/page.tsx', 'utf8')).not.toMatch(/accept="[^"]*svg/);
    for (const idioma of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const msg = readFileSync(`messages/${idioma}.json`, 'utf8');
      const dica = /"logoHint":\s*"([^"]*)"/.exec(msg)?.[1] ?? '';
      expect(dica, idioma).not.toBe('');
      expect(dica, idioma).not.toMatch(/svg/i);
    }
  });
});
