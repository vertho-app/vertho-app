// Detecção de navegador EMBUTIDO — a guarda que impede o link de acesso de ser
// queimado dentro do WhatsApp.
//
// 🔴 O CASO REAL (15/08/2026): o link chega por WhatsApp, o app abre no WebView,
// o `/auth/callback` consome o token de uso único e a sessão nasce num cookie
// jar isolado. A pessoa fecha o WhatsApp, abre o app instalado — não está
// logada, e o link não serve mais.
//
// A assimetria que guia os testes: falso POSITIVO só mostra uma tela a mais a
// quem já estava no navegador certo; falso NEGATIVO queima o acesso.
import { describe, it, expect } from 'vitest';
import { ehNavegadorEmbutido, ehAndroid, intentChrome, esquemaSafari, esquemaChrome } from '@/lib/auth/navegador-embutido';

const UA = {
  waAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  /**
   * 🔑 MEDIDO em aparelho real (15/08/2026, iPhone do dono). Repare no
   * `Safari/604.1`: o WebView do WhatsApp no iOS **assina como Safari**, e foi
   * por isso que a primeira régua — que procurava a AUSÊNCIA desse token —
   * deixou passar. O sinal de verdade é o `[WAiOS/…]` no fim.
   *
   * Esta string é dado de campo, não exemplo inventado: não editar.
   */
  waIosReal: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 [WAiOS/2.26.31]',
  waIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0 (iPhone14,3; iOS 17_5)',
};

describe('navegador embutido — quem NÃO pode consumir o token', () => {
  it('🔴 o UA REAL do WhatsApp no iPhone é detectado — ele assina como Safari', () => {
    // A regressão que este caso trava: procurar a ausência de `Safari/` deixava
    // este aparelho passar, e o token era consumido dentro do WhatsApp.
    expect(UA.waIosReal).toMatch(/Safari\//); // o token ESTÁ lá
    expect(ehNavegadorEmbutido(UA.waIosReal)).toBe(true);
  });

  it('🔴 WhatsApp no Android e no iOS antigo são detectados', () => {
    expect(ehNavegadorEmbutido(UA.waAndroid)).toBe(true);
    expect(ehNavegadorEmbutido(UA.waIos)).toBe(true);
  });

  it('outros apps com WebView também (Instagram)', () => {
    expect(ehNavegadorEmbutido(UA.instagram)).toBe(true);
  });

  it('🔴 navegador de verdade NÃO é bloqueado — senão ninguém entra', () => {
    expect(ehNavegadorEmbutido(UA.safariIos)).toBe(false);
    expect(ehNavegadorEmbutido(UA.chromeIos)).toBe(false);
    expect(ehNavegadorEmbutido(UA.chromeAndroid)).toBe(false);
    expect(ehNavegadorEmbutido(UA.desktop)).toBe(false);
  });

  it('sem UA, segue o fluxo normal (não dá para afirmar embutido)', () => {
    expect(ehNavegadorEmbutido(null)).toBe(false);
    expect(ehNavegadorEmbutido('')).toBe(false);
  });

  it('o Safari do iOS traz `Safari/` e o WebView não — é o que os separa', () => {
    expect(UA.safariIos).toMatch(/Safari\//);
    expect(UA.waIos).not.toMatch(/Safari\//);
  });
});

describe('saída do WebView', () => {
  it('Android é reconhecido — só lá existe caminho programático', () => {
    expect(ehAndroid(UA.waAndroid)).toBe(true);
    expect(ehAndroid(UA.waIos)).toBe(false);
  });

  it('intent:// preserva host, caminho e query do link original', () => {
    const url = 'https://app.vertho.ai/entrar?t=ibipeba~abc123';
    const intent = intentChrome(url);
    expect(intent.startsWith('intent://app.vertho.ai/entrar?t=ibipeba~abc123')).toBe(true);
    expect(intent).toContain('scheme=https');
    expect(intent).toContain('package=com.android.chrome');
    // Sem `https://` duplicado: o esquema vai no fragmento, não no início.
    expect(intent).not.toContain('intent://https');
  });

  it('🔴 o fallback do intent NÃO é o link de acesso — seria voltar ao laço', () => {
    const link = 'https://app.vertho.ai/entrar?t=ibipeba~abc123';
    const despacho = 'https://app.vertho.ai/entrar/abrir?t=ibipeba~abc123';
    const intent = intentChrome(link, despacho);
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(despacho)}`);
    // O `/entrar` cru consumiria o token de novo dentro do WhatsApp.
    expect(intent).toContain(encodeURIComponent('/entrar/abrir'));
  });

  it('🔴 os esquemas do iOS preservam o caminho E a query', () => {
    // A query é o que faz a pessoa cair na semana que ela tocou: o aviso do
    // login manda a URL COM `?redirect=`. Perder a query aqui manda todo mundo
    // para a home genérica, e o sintoma é "abriu no Safari mas foi pro lugar
    // errado" — parece bug de navegação, é perda de parâmetro.
    const url = 'https://ibipeba.vertho.ai/login?redirect=%2Fdashboard%2Ftemporada%2Fsemana%2F5';
    expect(esquemaSafari(url)).toBe('x-safari-https://ibipeba.vertho.ai/login?redirect=%2Fdashboard%2Ftemporada%2Fsemana%2F5');
    expect(esquemaChrome(url)).toBe('googlechromes://ibipeba.vertho.ai/login?redirect=%2Fdashboard%2Ftemporada%2Fsemana%2F5');
  });

  it('os esquemas não deixam `https://` duplicado', () => {
    expect(esquemaSafari('https://app.vertho.ai/x')).not.toContain('//https');
    expect(esquemaChrome('http://app.vertho.ai/x')).not.toContain('//http');
  });

  it('sem fallback informado, a intent continua válida', () => {
    const intent = intentChrome('https://app.vertho.ai/entrar?t=x~y');
    expect(intent).not.toContain('browser_fallback_url');
    expect(intent.endsWith(';end')).toBe(true);
  });
});
