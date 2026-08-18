// O auto-entrar da tela de link de acesso — o que substituiu o toque em
// "Entrar agora" (18/08/2026).
//
// 🔴 O INVARIANTE DESTE ARQUIVO: **quem consome o token é JavaScript de
// navegador de verdade.**
//
// O par deste teste é `entrar-nao-consome.test.ts`, que garante o lado do
// servidor (nenhum GET sem `ir=1` aponta para o `/auth/callback`). Os dois juntos
// descrevem a fronteira nova: antes, o que separava "consome" de "não consome"
// era um TOQUE; agora é a EXECUÇÃO DE JS. Se um dos dois cair, o robô de preview
// da Meta passa a queimar o token de todo link enviado — e o sintoma chega como
// "o link não funciona" para a pessoa, sem erro nenhum do nosso lado.
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { scriptAutoEntrar, scriptSairParaNavegador, CHAVE_AUTO_ENTRAR } from '@/lib/auth/auto-entrar';
import { ehRoboDePreview, esquemaSafari } from '@/lib/auth/navegador-embutido';

const URL_ENTRAR = '/entrar?t=ibipeba~abcdef0123456789&ir=1';

/**
 * Roda o script como um navegador rodaria, e devolve o que ele FEZ.
 *
 * Observar o efeito (navegou? gravou o quê?) em vez de casar texto é o que
 * separa este teste de um snapshot: ele continua valendo se o script for
 * reescrito, e falha se o comportamento mudar.
 */
function executar({
  agora = 1_000_000,
  guardado = null as string | null,
  storageQuebrado = false,
  script = scriptAutoEntrar(URL_ENTRAR),
} = {}) {
  const gravado: Record<string, string> = {};
  const navegouPara: string[] = [];
  const storage = storageQuebrado
    ? {
        getItem() { throw new Error('storage bloqueado'); },
        setItem() { throw new Error('storage bloqueado'); },
      }
    : {
        getItem: (k: string) => (k === CHAVE_AUTO_ENTRAR ? guardado : null),
        setItem: (k: string, v: string) => { gravado[k] = v; },
      };

  // `href` é uma PROPRIEDADE: o setter registra a navegação, do mesmo jeito que
  // o navegador faria. Assim os dois modos (replace × href) são observados pelo
  // mesmo sandbox, e nenhum deles passa despercebido.
  const location: any = { replace: (u: string) => { navegouPara.push(u); } };
  Object.defineProperty(location, 'href', {
    get: () => '',
    set: (u: string) => { navegouPara.push(u); },
  });

  const sandbox = { sessionStorage: storage, location, Date: { now: () => agora } };
  vm.runInNewContext(script, sandbox);
  return { gravado, navegouPara };
}

describe('o script entra sozinho — o toque virou JS', () => {
  it('navega para o ÚNICO caminho que consome (`ir=1`)', () => {
    const { navegouPara } = executar();
    expect(navegouPara).toEqual([URL_ENTRAR]);
  });

  it('🔴 usa `replace`: sem isso, o "voltar" reentra com o token já gasto', () => {
    // O sandbox só oferece `location.replace`. Se o script passasse a usar
    // `location.href = …`, isto quebraria — que é exatamente o que se quer.
    expect(scriptAutoEntrar(URL_ENTRAR)).toContain('location.replace(');
    expect(scriptAutoEntrar(URL_ENTRAR)).not.toContain('location.href');
  });

  it('🔴 não deixa o token em storage — grava TIMESTAMP', () => {
    const { gravado } = executar({ agora: 1_700_000 });
    expect(gravado[CHAVE_AUTO_ENTRAR]).toBe('1700000');
    // O `t` carrega o `token_hash`; ele pode estar na URL de destino, nunca
    // sobrando em `sessionStorage` depois que a navegação acabar.
    expect(JSON.stringify(gravado)).not.toContain('abcdef0123456789');
  });

  it('não reentra se acabou de tentar — laço em bfcache/recarga', () => {
    const { navegouPara } = executar({ agora: 1_000_000, guardado: '999000' });
    expect(navegouPara).toEqual([]);
  });

  it('tentativa velha não bloqueia: link novo na mesma aba entra', () => {
    const { navegouPara } = executar({ agora: 5_000_000, guardado: '999000' });
    expect(navegouPara).toEqual([URL_ENTRAR]);
  });

  it('🔴 storage bloqueado NÃO pode travar a pessoa na tela', () => {
    // WebView com storage negado faz `sessionStorage` LANÇAR. Sem os `try`, o
    // throw mataria o script e a tela ficaria parada em "Entrando…".
    const { navegouPara } = executar({ storageQuebrado: true });
    expect(navegouPara).toEqual([URL_ENTRAR]);
  });

  it('🔴 `</script>` no destino não fecha a tag', () => {
    // O `t` real nunca produz isto (a régua do `lerParametroAcesso` recusa), mas
    // o escape é o que impede que uma mudança de régua vire injeção na página.
    const script = scriptAutoEntrar('/entrar?t=x</script><script>alert(1)</script>&ir=1');
    expect(script).not.toContain('</script>');
    expect(script).toContain('\\u003C/script>');
  });
});

describe('iPhone no WhatsApp: a tela tenta o SAFARI, não o WebView', () => {
  // 🔴 `x-safari-https://` NÃO é API suportada — é um efeito colateral (app
  // bem-comportado repassa esquema desconhecido ao sistema), medido no WhatsApp
  // 2.26.31 em 15/08/2026. Pode sumir numa atualização, e o teste aqui não
  // protege contra isso: quem protege é a tela nascer com os botões visíveis e o
  // `[entrar] consumido … embutido=true` denunciar no log que a saída parou de
  // funcionar.
  const URL_ABS = 'https://app.vertho.ai/entrar?t=ibipeba~abcdef0123456789&ir=1';
  const script = () => scriptSairParaNavegador(esquemaSafari(URL_ABS));

  it('entrega a navegação ao Safari, com `ir=1` (entra direto lá)', () => {
    const { navegouPara } = executar({ script: script() });
    expect(navegouPara).toEqual(['x-safari-https://app.vertho.ai/entrar?t=ibipeba~abcdef0123456789&ir=1']);
  });

  it('🔴 usa `href`: com `replace`, a tela sumiria e o fallback iria junto', () => {
    // Se o esquema não for repassado, o WKWebView cancela a navegação e a pessoa
    // FICA nesta tela — que é o fallback. Ela precisa continuar existindo.
    expect(script()).toContain('location.href=');
    expect(script()).not.toContain('location.replace');
  });

  it('a mesma trava de 60 s vale aqui', () => {
    const { navegouPara } = executar({ script: script(), agora: 1_000_000, guardado: '999000' });
    expect(navegouPara).toEqual([]);
  });

  it('🔴 nada é consumido pela tentativa em si', () => {
    // O que consome é o `/entrar?ir=1` — e ele só é alcançado se o Safari
    // realmente abrir. Tentativa que falha deixa o token intacto.
    const { navegouPara } = executar({ script: script() });
    expect(navegouPara[0].startsWith('x-safari-https://')).toBe(true);
  });
});

describe('quem NÃO recebe o script: o robô de preview', () => {
  // Régua por marcador POSITIVO — a lição do `WAiOS`, onde detectar por ausência
  // deixou passar um iPhone real.
  const ROBOS = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.2449.4 A',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  ];

  const GENTE = [
    // WhatsApp no iPhone — o UA medido em 15/08/2026, que assina como Safari.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 [WAiOS/2.26.31]',
    // WhatsApp no Android (WebView).
    'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
    // Safari e Chrome de verdade.
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ];

  it.each(ROBOS)('robô: %s', (ua) => {
    expect(ehRoboDePreview(ua)).toBe(true);
  });

  it.each(GENTE)('gente: %s', (ua) => {
    expect(ehRoboDePreview(ua)).toBe(false);
  });

  it('🔴 sem User-Agent, o lado seguro é NÃO entrar', () => {
    // Navegador sempre manda UA. A ausência é sinal de cliente automatizado — e
    // aqui o custo do erro é assimétrico ao contrário do `ehNavegadorEmbutido`:
    // um falso positivo mostra um botão a mais; um falso negativo gasta o token.
    expect(ehRoboDePreview(null)).toBe(true);
    expect(ehRoboDePreview('')).toBe(true);
    expect(ehRoboDePreview('   ')).toBe(true);
  });
});
