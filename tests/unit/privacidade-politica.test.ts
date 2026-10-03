/**
 * Política de privacidade (R-06, R-43, R-46 da revisão de 02/10/2026).
 *
 * Estático de propósito: o que se protege aqui é TEXTO que precisa acompanhar o
 * código. A política dizia que quem usa a plataforma declara ciência dela, e
 * nenhuma tela levava até ela; e omitia fornecedores que o código usa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];

describe('o caminho até a política existe', () => {
  it('login e rodapé do painel apontam para /privacidade com texto traduzido', () => {
    const login = ler('app/login/login-form.tsx');
    const shell = ler('app/dashboard/dashboard-shell.tsx');
    expect(login).toContain('href="/privacidade"');
    expect(login).toContain("t('privacyLink')");
    expect(shell).toContain('href="/privacidade"');
    expect(shell).toContain("t('privacyLink')");
  });

  it('a chave existe nos 4 idiomas, nos dois namespaces', () => {
    for (const l of LOCALES) {
      const m = JSON.parse(ler(`messages/${l}.json`));
      expect(m.Login.privacyLink, `${l} Login`).toBeTruthy();
      expect(m.DashboardShell.privacyLink, `${l} DashboardShell`).toBeTruthy();
    }
  });
});

describe('a política nomeia quem o código usa', () => {
  const pagina = ler('app/privacidade/page.tsx');
  const fluxo = ler('docs/FLUXO-DE-DADOS-PESSOAIS.md');

  it.each(['Hetzner', 'Trigger.dev', 'Upstash', 'Sentry', 'WaSender', 'Voyage', 'Bunny Stream', 'HeyGen'])(
    '%s está na política e no levantamento técnico',
    (fornecedor) => {
      expect(pagina).toContain(fornecedor);
      expect(fluxo).toContain(fornecedor);
    },
  );

  it('voz é declarada: transcrição na OpenAI e áudio do WhatsApp no Google', () => {
    expect(pagina).toMatch(/3\.4\. Voz/);
    expect(pagina).toMatch(/transcritas pela OpenAI/);
    expect(pagina).toMatch(/interpretados pelo Google/);
    expect(fluxo).toContain('Whisper');
  });

  it('o documento antigo está marcado como obsoleto e aponta para o levantamento', () => {
    const antigo = ler('docs/lgpd-politica.md');
    expect(antigo.slice(0, 600)).toContain('OBSOLETO');
    expect(antigo.slice(0, 1200)).toContain('docs/FLUXO-DE-DADOS-PESSOAIS.md');
  });
});
