/**
 * CSP em MODO RELATÓRIO (análise de segurança de 05/10/2026). A CSP enforçada do app era só
 * `frame-ancestors 'self'`, sem `script-src`: nenhum XSS explorável foi achado, mas um futuro
 * não encontraria barreira. Enforçar uma `script-src` de primeira podia derrubar telas (os
 * scripts inline do próprio Next, o Sentry, o player do Bunny), então a política entra só
 * como `Content-Security-Policy-Report-Only`: o navegador reporta e não bloqueia nada.
 *
 * Estes testes seguram as duas pontas do combinado: a política-ALVO é de verdade restritiva
 * (senão o relatório não mediria nada) e ela NÃO está enforçada (senão o "modo relatório"
 * viraria um corte de produção sem aviso).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSP_RELATORIO, CSP_REPORT_PATH } from '@/lib/csp-politica.mjs';

const diretiva = (nome: string) =>
  CSP_RELATORIO.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${nome} `)) ?? '';

describe('a política-alvo é restritiva de verdade', () => {
  it('🔴 script-src não tem unsafe-inline nem unsafe-eval (os inline do Next TÊM que aparecer nos relatórios)', () => {
    const s = diretiva('script-src');
    expect(s).toContain("'self'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
    expect(CSP_RELATORIO).not.toContain("'unsafe-eval'");
  });

  it('scripts externos só os que o código usa (player.js do Bunny), e pede a amostra do script', () => {
    // `'report-sample'` não afrouxa nada: só faz o navegador mandar o começo do script no
    // relatório. Sem ele a amostra vem vazia e o script inline do Next não se distingue de outro.
    expect(diretiva('script-src')).toBe("script-src 'self' https://cdn.embed.ly 'report-sample'");
  });

  it('objetos, base e formulários fechados; frames só o Bunny', () => {
    expect(diretiva('object-src')).toBe("object-src 'none'");
    expect(diretiva('base-uri')).toBe("base-uri 'self'");
    expect(diretiva('form-action')).toBe("form-action 'self'");
    expect(diretiva('frame-src')).toBe('frame-src https://iframe.mediadelivery.net');
    expect(diretiva('frame-ancestors')).toBe("frame-ancestors 'self'");
  });

  it('connect-src cobre o que o navegador realmente fala (Supabase, Sentry, ASR local do copiloto)', () => {
    const c = diretiva('connect-src');
    for (const origem of ['https://*.supabase.co', 'wss://*.supabase.co', 'https://*.ingest.sentry.io', 'ws://127.0.0.1:*']) {
      expect(c, origem).toContain(origem);
    }
  });

  it('os relatórios vão para a rota pelo report-uri', () => {
    expect(CSP_REPORT_PATH).toBe('/api/csp-report');
    expect(diretiva('report-uri')).toBe('report-uri /api/csp-report');
  });

  // Medido em 05/10/2026 num Chromium de verdade: o report-uri entregou o relatório na hora;
  // o report-to (com Reporting-Endpoints) não entregou nenhum em 75 s; e com os DOIS presentes
  // o Chromium usa só o report-to e o relatório nunca chega. Um modo relatório que não relata
  // é pior que nenhum, porque dá a sensação de que "não deu erro".
  it('🔴 NÃO usa report-to: com os dois, o Chromium ignora o report-uri e nada chega', () => {
    expect(CSP_RELATORIO).not.toContain('report-to');
    expect(readFileSync('next.config.mjs', 'utf8')).not.toContain('Reporting-Endpoints');
  });
});

describe('🔴 ela está em modo relatório, não enforçada', () => {
  const config = readFileSync('next.config.mjs', 'utf8');

  it('o header enforçado segue sendo SÓ frame-ancestors', () => {
    const enforcados = config.match(/key: 'Content-Security-Policy',\s*value: ([^}]+)\}/g) ?? [];
    expect(enforcados).toHaveLength(1);
    expect(enforcados[0]).toContain(`"frame-ancestors 'self'"`);
  });

  it('a política nova sai como Report-Only, vinda de lib/csp-politica.mjs', () => {
    expect(config).toMatch(/key: 'Content-Security-Policy-Report-Only',\s*value: CSP_RELATORIO/);
    expect(config).toContain("from './lib/csp-politica.mjs'");
  });

  it('a política nova não é usada em nenhum header enforçado', () => {
    const usos = config.match(/CSP_RELATORIO/g) ?? [];
    expect(usos).toHaveLength(2); // o import e o header Report-Only
  });
});

describe('o proxy não paga renovação de sessão por relatório', () => {
  it('/api/csp-report está em ROTAS_SEM_SESSAO (um relatório por violação, dezenas por página)', () => {
    expect(readFileSync('proxy.js', 'utf8')).toMatch(/ROTAS_SEM_SESSAO = \[[^\]]*'\/api\/csp-report'/);
  });
});
