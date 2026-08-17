// `derivarParametroAcesso` — o que faz TODO caminho de login usar a Cloud API.
//
// 🔴 Medido em 17/08/2026: `sendAccessLink` só usava o template quando recebia
// `acessoParam`, e dos **4 call-sites apenas 1** passava. Os outros três —
// `phone-magic-link/request` (o login por telefone do colaborador!),
// `magic-link` e `signup` — caíam no legado, que depende da Z-API desconectada
// desde 11/08: **28 falhas com "zapi: saúde: desconectada"** entre 14 e 16/08.
//
// A correção derruba a classe: em vez de repetir a linha em três lugares (e
// esquecer no quarto), deriva do `whatsappLink` que todos já passam.
//
// ⚠️ A função é ESTRITA de propósito. O `whatsappLink` pode ser o `action_link`
// do Supabase (outro host) quando o `token_hash` não veio — derivar dali daria
// um slug que não é tenant nenhum, e link de acesso apontando para o lugar
// errado é pior que não mandar.
import { describe, it, expect } from 'vitest';
import { derivarParametroAcesso, lerParametroAcesso } from '@/lib/auth/magic-link-whatsapp';

const cb = (host: string, token = 'pkce_a1b2c3d4e5f6') =>
  `https://${host}/auth/callback?token_hash=${token}&type=email&next=%2Fdashboard`;

describe('deriva o parâmetro do callback do tenant', () => {
  it('🔴 extrai slug e token de um callback real', () => {
    expect(derivarParametroAcesso(cb('ibipeba.vertho.ai'))).toBe('ibipeba~pkce_a1b2c3d4e5f6');
  });

  it('o que sai daqui é legível pelo `/entrar` — o círculo fecha', () => {
    const p = derivarParametroAcesso(cb('macae.vertho.ai', 'abc123def456'))!;
    expect(lerParametroAcesso(p)).toEqual({ slug: 'macae', tokenHash: 'abc123def456' });
  });

  it('slug com hífen sobrevive (o separador é `~`, não `-`)', () => {
    expect(derivarParametroAcesso(cb('teste-piloto.vertho.ai'))).toBe('teste-piloto~pkce_a1b2c3d4e5f6');
  });
});

describe('🔴 recusa tudo que não é inequivocamente um tenant nosso', () => {
  it('host de FORA — é o caso do `action_link` do Supabase', () => {
    expect(derivarParametroAcesso('https://xyz.supabase.co/auth/v1/verify?token=abc&type=magiclink')).toBeNull();
    expect(derivarParametroAcesso(cb('ibipeba.evil.com'))).toBeNull();
    expect(derivarParametroAcesso(cb('vertho.ai.evil.com'))).toBeNull();
  });

  it('🔴 domínio SÓSIA: o teste da fronteira é `endsWith`, não "contém"', () => {
    // `axvertho.ai` CONTÉM "vertho.ai" e não termina em ".vertho.ai". Trocar o
    // `endsWith` por `includes` deixa passar exatamente esta forma — e os outros
    // guards não pegam, porque o slug extraído ("a") é válido e sem ponto.
    // Sem este caso a mutação passava verde: o teste anterior era mascarado.
    expect(derivarParametroAcesso(cb('axvertho.ai'))).toBeNull();
    expect(derivarParametroAcesso(cb('meuvertho.ai'))).toBeNull();
  });

  it('subdomínio RESERVADO não é tenant', () => {
    for (const r of ['app', 'www', 'api', 'admin', 'radar', 'radarbett']) {
      expect(derivarParametroAcesso(cb(`${r}.vertho.ai`)), r).toBeNull();
    }
  });

  it('sub-subdomínio não vira slug', () => {
    expect(derivarParametroAcesso(cb('algo.ibipeba.vertho.ai'))).toBeNull();
  });

  it('caminho que não é o callback não carrega token de sessão', () => {
    expect(derivarParametroAcesso('https://ibipeba.vertho.ai/dashboard?token_hash=abc123def456')).toBeNull();
  });

  it('sem `token_hash` não há o que redimir', () => {
    expect(derivarParametroAcesso('https://ibipeba.vertho.ai/auth/callback?type=email')).toBeNull();
  });

  it('http puro é recusado — o link vai por WhatsApp, não pode ser interceptável', () => {
    expect(derivarParametroAcesso(cb('ibipeba.vertho.ai').replace('https:', 'http:'))).toBeNull();
  });

  it('lixo não quebra: devolve null', () => {
    for (const v of [null, undefined, '', 'não é url', 'javascript:alert(1)']) {
      expect(derivarParametroAcesso(v as any)).toBeNull();
    }
  });
});
