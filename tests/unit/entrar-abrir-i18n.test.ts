/**
 * R-67 (04/10/2026): `/entrar/abrir` é a primeira tela que quem recebe o link de
 * acesso vê, antes de qualquer login, e estava inteira em português escrito à
 * mão (3 arquivos). Passou para o namespace `AccessLinkConfirm`.
 *
 * É guard de FONTE: a página é um componente de servidor com cabeçalhos e
 * navegador embutido, e a suíte não a renderiza. Prova que (1) cada chave usada
 * nos arquivos existe nos 4 idiomas, (2) as chaves com negrito levam as duas tags
 * em todos, e (3) nenhum texto antigo voltou para o código.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ARQUIVOS = ['app/entrar/abrir/page.tsx', 'app/entrar/abrir/CopiarLink.tsx', 'app/entrar/abrir/SairDoWebView.tsx'];
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;

/** O código sem comentários: o histórico da tela cita os textos antigos, e isso não é texto na tela. */
const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const fonte = Object.fromEntries(ARQUIVOS.map((a) => [a, semComentarios(readFileSync(a, 'utf8'))]));
const mensagens = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')).AccessLinkConfirm])) as Record<string, Record<string, string>>;

const usadas = (() => {
  const chaves = new Set<string>();
  const comRichText = new Set<string>();
  for (const f of Object.values(fonte)) {
    for (const m of f.matchAll(/\b(?:tr|t)\(\s*'([A-Za-z]+)'/g)) chaves.add(m[1]);
    for (const m of f.matchAll(/\b(?:tr|t)\.rich\(\s*'([A-Za-z]+)'/g)) { chaves.add(m[1]); comRichText.add(m[1]); }
  }
  return { chaves: [...chaves], comRichText: [...comRichText] };
})();

describe('/entrar/abrir em 4 idiomas', () => {
  it('os três arquivos usam o namespace e não há texto em português escrito no código', () => {
    for (const [arquivo, texto] of Object.entries(fonte)) {
      expect(texto, arquivo).toMatch(/AccessLinkConfirm/);
    }
    const ANTIGOS = [
      'Link inválido ou expirado', 'Peça um novo link', 'Ir para o login', 'Abrindo no Safari', 'Entrar agora',
      'Entrando na Vertho', 'Entrar na Vertho', 'Prefere entrar pelo navegador', 'Abrir em outro aparelho',
      'Copiar link', 'Copiar endereço', 'Copiado ✓', 'Abrir no Safari e entrar', 'Abrir no Chrome', 'Não abriu?',
      'Seu link de acesso está válido', 'Isto leva um instante', 'Entrar aqui mesmo',
    ];
    for (const [arquivo, texto] of Object.entries(fonte)) {
      for (const antigo of ANTIGOS) expect(texto, `${arquivo}: "${antigo}"`).not.toContain(antigo);
    }
  });

  it('as chaves usadas são as 21 do namespace, sem sobra nem falta', () => {
    expect(usadas.chaves.sort()).toEqual(Object.keys(mensagens['pt-BR']).sort());
  });

  it.each(LOCALES)('%s: cada chave usada existe e tem texto', (locale) => {
    for (const chave of usadas.chaves) {
      expect(typeof mensagens[locale][chave], `${locale}: AccessLinkConfirm.${chave}`).toBe('string');
      expect(mensagens[locale][chave].length).toBeGreaterThan(3);
    }
  });

  it.each(LOCALES)('%s: as chaves com negrito (rich) trazem a tag aberta e fechada', (locale) => {
    expect(usadas.comRichText.sort()).toEqual(['notOpenedBody', 'validBody']);
    for (const chave of usadas.comRichText) {
      const texto = mensagens[locale][chave];
      expect(texto, `${locale}: ${chave}`).toMatch(/<b>[^<]+<\/b>/);
      expect(texto.match(/<b>/g)!.length).toBe(texto.match(/<\/b>/g)!.length);
    }
  });

  it.each(LOCALES)('%s: nenhum texto traz travessão', (locale) => {
    for (const [chave, texto] of Object.entries(mensagens[locale])) {
      expect(texto, `${locale}: ${chave}`).not.toMatch(/[–—―]/);
    }
  });
});
