import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const withNextIntl = createNextIntlPlugin();

// Build number = short SHA do commit deployado (muda a cada deploy)
let sha = '0000000';
try {
  sha = (process.env.VERCEL_GIT_COMMIT_SHA || execSync('git rev-parse HEAD').toString().trim()).slice(0, 7);
} catch {}
const buildNum = sha;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não vaza a versão do framework.
  poweredByHeader: false,

  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_NUM: buildNum,
    NEXT_PUBLIC_GIT_SHA: sha,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },
  // Garante que os PNGs usados via fs.readFileSync em server components/API
  // routes sejam incluídos no bundle serverless na Vercel.
  outputFileTracingIncludes: {
    '/api/relatorios/**': ['./public/logo-vertho.png', './public/logo-vertho-cover.png', './public/template-fundo-relatorios.png'],
    '/**': ['./public/logo-vertho.png', './public/logo-vertho-cover.png', './public/template-fundo-relatorios.png'],
  },

  // Server actions: default Next 16 é 1MB. 15MB cobre a maioria dos
  // fluxos (anexos base64, PDFs, imagens). Uploads grandes (áudios,
  // vídeos) vão via /api/upload/signed-url direto pro Supabase Storage,
  // bypassando o server action — ver actions/conteudos.js::uploadConteudo.
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },

  // exceljs é ESM em modo nativo; mantém como server-external pra evitar
  // problemas de bundling do Turbopack.
  serverExternalPackages: ['exceljs'],

  // Define a root do projeto pra Turbopack — silencia warning de
  // "inferred workspace root" e evita confusão quando há symlinks.
  turbopack: {
    root: import.meta.dirname,
  },

  /**
   * Rewrite opcional pro site institucional Gamma servido no apex `vertho.ai`.
   *
   * `vertho.ai/imprensa` é nativo da Next agora (app/imprensa/page.tsx), então
   * NÃO precisa rewrite — quando o DNS apex migrar pro Vercel, o Next serve a
   * página direto.
   *
   * O único caso ainda dependente do Gamma é a HOME (`/`) — enquanto a home
   * não for replicada na Next, configurar `GAMMA_HOME_URL` no Vercel faz a
   * Next proxyar `/` pro doc Gamma. Sem essa env, `/` cai na home nativa.
   *
   * Filtro `has: host` garante que esse rewrite só roda no apex (vertho.ai
   * com ou sem www) — nunca em `app.`, `radar.`, `radarbett.` ou subdomínios
   * de tenants.
   */
  /**
   * Security headers aplicados a todas as respostas servidas pela Next.
   * CSP completo (script-src/style-src) exige auditar inline-scripts da Next +
   * Sentry + Supabase + Bunny e fica para um passo dedicado; aqui cobrimos o
   * essencial sem risco de quebrar carregamento de recursos:
   *  - HSTS (força HTTPS, inclui subdomínios de tenant)
   *  - frame-ancestors / X-Frame-Options (anti-clickjacking)
   *  - nosniff, Referrer-Policy, Permissions-Policy
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), payment=(), browsing-topics=()' },
        ],
      },
    ];
  },

  async rewrites() {
    const gammaHome = process.env.GAMMA_HOME_URL?.replace(/\/+$/, '') || '';
    if (!gammaHome) return [];

    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: '(www\\.)?vertho\\.ai' }],
          destination: `${gammaHome}/`,
        },
      ],
    };
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Silencia logs do Sentry no build
  silent: true,

  // Não faz upload de source maps (mantém simples)
  disableServerWebpackPlugin: true,
  disableClientWebpackPlugin: true,
});
