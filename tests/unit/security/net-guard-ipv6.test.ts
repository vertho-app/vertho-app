/**
 * Análise de segurança de 05/10/2026: o `net-guard` só reconhecia IPv4 mapeado em
 * IPv6 na forma com pontos (`::ffff:127.0.0.1`), mas o `URL` do Node normaliza
 * essa URL para a forma hexadecimal (`[::ffff:7f00:1]`), então `127.0.0.1` e
 * `169.254.169.254` (metadados de nuvem) passavam como destino público. Também
 * ficavam de fora 6to4, NAT64, site-local, multicast e as faixas IPv4 reservadas.
 *
 * Os dois lados importam: o guard que bloqueia demais quebra Certificado e
 * "puxar cores" (`fetchPublico` já foi fail-closed para qualquer host, 23/07),
 * então o teste também exige que endereço público continue passando.
 */
import { describe, it, expect } from 'vitest';
import { ehIpPrivado, validarUrlPublica } from '@/lib/net-guard';

describe('IPv4 mapeado em IPv6 não esconde destino interno', () => {
  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://[::ffff:10.0.0.5]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
  ])('🔴 %s é bloqueada já na sintaxe (a forma que o URL do Node produz)', (url) => {
    const r = validarUrlPublica(url);
    expect(r.ok, url).toBe(false);
  });

  it('o endereço hexadecimal mapeado de IP público segue permitido', () => {
    expect(ehIpPrivado('::ffff:808:808')).toBe(false);          // 8.8.8.8
    expect(ehIpPrivado('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('outras formas IPv6 que levam a rede interna', () => {
  it.each([
    ['::', 'não especificado'],
    ['::1', 'loopback'],
    ['::7f00:1', 'IPv4-compatível (obsoleto)'],
    ['64:ff9b::7f00:1', 'NAT64 para 127.0.0.1'],
    ['64:ff9b::a9fe:a9fe', 'NAT64 para os metadados'],
    ['64:ff9b:1::1', 'NAT64 de uso local'],
    ['2002:7f00:1::', '6to4 com 127.0.0.1'],
    ['2002:a9fe:a9fe::1', '6to4 com 169.254.169.254'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo'],
    ['2001:db8::1', 'documentação'],
    ['100::1', 'descarte'],
    ['fc00::1', 'ULA'],
    ['fd12:3456::1', 'ULA'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local (borda da faixa)'],
    ['fec0::1', 'site-local (obsoleto)'],
    ['ff02::1', 'multicast'],
    ['zzzz::1', 'malformado'],
    ['1:2:3:4:5:6:7:8:9', 'malformado (9 grupos)'],
  ])('🔴 %s (%s) é privado', (ip) => {
    expect(ehIpPrivado(ip), ip).toBe(true);
  });

  it.each([
    ['2606:4700:4700::1111', 'Cloudflare DNS'],
    ['2001:4860:4860::8888', 'Google DNS'],
    ['2a00:1450:4001:81b::200e', 'Google'],
    ['2002:808:808::1', '6to4 com 8.8.8.8'],
    ['64:ff9b::808:808', 'NAT64 para 8.8.8.8'],
  ])('%s (%s) continua público', (ip) => {
    expect(ehIpPrivado(ip), ip).toBe(false);
  });
});

describe('IPv4: faixas reservadas que faltavam', () => {
  it.each(['224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255', '198.18.0.1', '198.19.255.254',
    '192.0.0.1', '192.0.2.10', '198.51.100.7', '203.0.113.9'])('🔴 %s é privado', (ip) => {
    expect(ehIpPrivado(ip), ip).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '198.17.0.1', '198.20.0.1', '203.0.114.1', '192.0.1.1', '223.255.255.254'])(
    '%s continua público',
    (ip) => { expect(ehIpPrivado(ip), ip).toBe(false); },
  );

  it('as faixas que já eram bloqueadas seguem bloqueadas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(ehIpPrivado(ip), ip).toBe(true);
    }
    for (const ip of ['172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1']) {
      expect(ehIpPrivado(ip), ip).toBe(false);
    }
  });
});
