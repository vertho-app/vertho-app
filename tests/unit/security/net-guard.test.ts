import { describe, it, expect } from 'vitest';

/**
 * Auditoria 23/07 (grupo D): guarda anti-SSRF compartilhada.
 * - validarUrlPublica: sintaxe/esquema/host interno/IP literal/flag '-'.
 * - assertDestinoPublico: DNS pré-check (borda de submit).
 * - dispatcherPublico: enforcement NO CONNECT — um hostname que PASSA na
 *   sintaxe mas resolve pra IP privado (rebinding/TOCTOU) é bloqueado pelo
 *   lookup do Agent na hora de conectar.
 */

import http from 'node:http';
import { fetch as undiciFetch } from 'undici';
import { ehIpPrivado, validarUrlPublica, assertDestinoPublico, fetchPublico, dispatcherPublico } from '@/lib/net-guard';

describe('ehIpPrivado', () => {
  it.each(['10.0.0.1', '192.168.0.10', '172.16.0.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1'])(
    'v4 privado/reservado: %s', (ip) => expect(ehIpPrivado(ip)).toBe(true),
  );
  it.each(['::1', 'fd12:3456::1', 'fe80::1', '::ffff:10.0.0.1'])(
    'v6 privado/mapeado: %s', (ip) => expect(ehIpPrivado(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '186.202.10.5', '2001:4860:4860::8888'])(
    'público: %s', (ip) => expect(ehIpPrivado(ip)).toBe(false),
  );
  it('malformado = privado (rejeita por default)', () => {
    expect(ehIpPrivado('999.1.2.3')).toBe(true);
  });
});

describe('validarUrlPublica', () => {
  it('aceita domínio (completa https) e URL http com acento', () => {
    expect(validarUrlPublica('www.unianchieta.edu.br')).toMatchObject({ ok: true });
    expect(validarUrlPublica('http://site.com/página')).toMatchObject({ ok: true });
    expect(validarUrlPublica('https://www.youtube.com/watch?v=abc')).toMatchObject({ ok: true });
  });
  it('rejeita host interno, esquema errado e IP privado literal', () => {
    expect(validarUrlPublica('http://localhost:3000')).toMatchObject({ ok: false });
    expect(validarUrlPublica('https://intranet.local')).toMatchObject({ ok: false });
    expect(validarUrlPublica('https://svc.internal')).toMatchObject({ ok: false });
    expect(validarUrlPublica('ftp://site.com')).toMatchObject({ ok: false });
    expect(validarUrlPublica('http://192.168.0.10')).toMatchObject({ ok: false });
    expect(validarUrlPublica('http://169.254.169.254/latest/meta-data')).toMatchObject({ ok: false });
  });
  it('rejeita host começando com "-" (injeção de flag em subprocesso, ex.: yt-dlp)', () => {
    expect(validarUrlPublica('--exec=cat /etc/passwd')).toMatchObject({ ok: false });
    expect(validarUrlPublica('http://--exec=foo/')).toMatchObject({ ok: false });
  });
});

describe('assertDestinoPublico (DNS pré-check)', () => {
  it('rejeita hostname que resolve pra loopback', async () => {
    await expect(assertDestinoPublico(new URL('http://localhost'))).rejects.toThrow(/privado|DNS/i);
  });
  it('rejeita IP privado literal sem nem resolver', async () => {
    await expect(assertDestinoPublico(new URL('http://10.0.0.1'))).rejects.toThrow(/privado/i);
  });
});

describe('dispatcherPublico (enforcement no connect — anti-TOCTOU/rebinding)', () => {
  it('hostname que resolve pra IP privado é bloqueado NO CONNECT (localhost)', async () => {
    // 'localhost' passaria num check só de sintaxe se não fosse bloqueado por
    // nome — aqui o que bloqueia é o LOOKUP do Agent: prova de que a validação
    // acontece na conexão, não só antes dela.
    const err: any = await fetchPublico('http://localhost:59999/').catch((e) => e);
    const msg = String(err?.cause?.message || err?.message || err);
    expect(msg).toMatch(/privado/i);
  });

  it('IP privado literal nem conecta', async () => {
    const err: any = await fetchPublico('http://127.0.0.1:59999/').catch((e) => e);
    const msg = String(err?.cause?.message || err?.message || err);
    expect(msg).toMatch(/privado/i);
  });

  it('IP privado literal é bloqueado NO CONNECT mesmo sem pré-check de URL (hop de redirect)', async () => {
    // Um redirect automático faz o undici conectar DIRETO no destino, sem passar
    // pelo check de URL do fetchPublico. Se o destino for um IP privado literal, o
    // lookup do Agent nem roda (Node conecta literal sem resolver) — só o guard no
    // connect segura. Vamos direto pelo dispatcher (bypassa o check de URL) contra
    // um servidor local real: sem o guard, isto conectaria (200 = vazamento).
    const srv = http.createServer((_q, s) => { s.writeHead(200); s.end('LEAK'); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as any).port;
    try {
      const err: any = await undiciFetch(`http://127.0.0.1:${port}/`, { dispatcher: dispatcherPublico() }).catch((e) => e);
      const msg = String(err?.cause?.message || err?.message || err);
      expect(msg).toMatch(/privado/i);
    } finally {
      srv.close();
    }
  });
});
