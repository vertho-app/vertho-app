/**
 * Parâmetro de acesso do magic link por WhatsApp (14/08/2026).
 *
 * O QUE ESTES TESTES PROTEGEM
 * ───────────────────────────
 * A rota `/entrar` é **pública e pré-sessão** — quem clica ainda não está
 * logado — e o que ela faz é decidir PARA ONDE redirecionar, a partir de uma
 * query string. Montar a URL com o valor cru seria **open redirect no canal de
 * login**: a vítima recebe um link que começa no domínio da Vertho, chega pelo
 * WhatsApp junto com uma mensagem legítima de acesso, e termina em outro lugar.
 *
 * `lerParametroAcesso` é a primeira barreira (forma). A segunda é a rota
 * confirmar que o slug EXISTE no banco — as duas são necessárias: a regex
 * sozinha aceita `qualquercoisa`, e a consulta sozinha receberia texto arbitrário.
 */
import { describe, it, expect } from 'vitest';
import {
  montarParametroAcesso,
  lerParametroAcesso,
  caminhoCallback,
} from '@/lib/auth/magic-link-whatsapp';

const TOKEN = 'pkce_a1b2c3d4e5f6a7b8c9d0';

describe('ida e volta', () => {
  it('monta e lê de volta', () => {
    const p = montarParametroAcesso('ibipeba', TOKEN);
    expect(lerParametroAcesso(p)).toEqual({ slug: 'ibipeba', tokenHash: TOKEN });
  });

  it('slug com hífen sobrevive — o separador não pode ser "-"', () => {
    // `acme-demo` e `teste-piloto` são slugs reais. Um separador `-` partiria o
    // slug ao meio e mandaria a pessoa para um tenant que não existe.
    for (const slug of ['acme-demo', 'teste-piloto', 'projetomacae']) {
      expect(lerParametroAcesso(montarParametroAcesso(slug, TOKEN))?.slug).toBe(slug);
    }
  });

  it('token com _ e - sobrevive (base64url)', () => {
    const tk = 'abc-DEF_123-xyz_890';
    expect(lerParametroAcesso(montarParametroAcesso('bett', tk))?.tokenHash).toBe(tk);
  });
});

describe('🔴 open redirect — o que esta validação existe para impedir', () => {
  it.each([
    ['host externo', 'site-malicioso.com~' + TOKEN],
    ['url completa', 'https://evil.test~' + TOKEN],
    ['barra dupla', '//evil.test~' + TOKEN],
    ['travessia', '../../evil~' + TOKEN],
    ['maiúsculas (slug é minúsculo)', 'Ibipeba~' + TOKEN],
    ['espaço', 'ibi peba~' + TOKEN],
    ['arroba (userinfo em URL)', 'ibipeba@evil.test~' + TOKEN],
    ['dois pontos (porta)', 'ibipeba:8080~' + TOKEN],
  ])('recusa slug: %s', (_rotulo, valor) => {
    expect(lerParametroAcesso(valor)).toBeNull();
  });

  it.each([
    ['token com barra', 'ibipeba~abc/../../evil'],
    ['token com dois pontos', 'ibipeba~http://evil.test'],
    ['token com espaço', 'ibipeba~abc def123'],
    ['token curto demais', 'ibipeba~abc'],
  ])('recusa token: %s', (_rotulo, valor) => {
    expect(lerParametroAcesso(valor)).toBeNull();
  });

  it('recusa entrada vazia, sem separador ou começando com separador', () => {
    expect(lerParametroAcesso(null)).toBeNull();
    expect(lerParametroAcesso('')).toBeNull();
    expect(lerParametroAcesso('semseparador')).toBeNull();
    // Separador na posição 0 = slug vazio.
    expect(lerParametroAcesso('~' + TOKEN)).toBeNull();
  });

  it('recusa token absurdamente longo', () => {
    expect(lerParametroAcesso('ibipeba~' + 'a'.repeat(600))).toBeNull();
  });

  it('usa o PRIMEIRO separador — token com ~ não desloca a fronteira', () => {
    const r = lerParametroAcesso('ibipeba~abc12345~def');
    // O `~` extra invalida o token (não casa a regex), o que é o lado seguro.
    expect(r).toBeNull();
  });
});

describe('caminho do callback', () => {
  it('inclui type=email — sem ele o callback não chama verifyOtp', () => {
    const c = caminhoCallback(TOKEN);
    expect(c).toContain('type=email');
    expect(c).toContain(`token_hash=${TOKEN}`);
    expect(c).toContain('next=%2Fdashboard');
  });

  it('escapa o destino em vez de concatenar', () => {
    const c = caminhoCallback(TOKEN, '/dashboard/temporada');
    expect(c).toContain('next=%2Fdashboard%2Ftemporada');
  });
});
