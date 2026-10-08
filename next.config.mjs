import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import { rewritesDaMidiaOffline } from './lib/demo/offline/midia-rewrites.mjs';
import { CSP_RELATORIO } from './lib/csp-politica.mjs';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não vaza a versão do framework.
  poweredByHeader: false,

  // ESLint (eslint.config.mjs) é rede de segurança MANUAL (`npx eslint .`), não
  // gate de build — o código legado tem warnings demais pra bloquear deploy.
  eslint: { ignoreDuringBuilds: true },

  // Garante que os PNGs usados via fs.readFileSync em server components/API
  // routes sejam incluídos no bundle serverless na Vercel.
  outputFileTracingIncludes: {
    '/api/ipi': ['./.ipi/knowledge.json'],
    '/api/relatorios/**': ['./public/logo-vertho.png', './public/logo-vertho-cover.png', './public/template-fundo-relatorios.png'],
    // Imagens do PDF da proposta (logos e fundadores), lidas por fs em lib/pdf-assets.ts.
    '/proposta/**': ['./public/proposta/*.jpg'],
    '/**': [
      './public/logo-vertho.png',
      './public/logo-vertho-cover.png',
      './public/template-fundo-relatorios.png',
      './public/audio/podcast/mentorIA-abertura.wav',
      './public/audio/podcast/mentorIA-encerramento.wav',
      // Codec Extra Bold dos PDFs (components/pdf/fontes.ts lê por fs; sem isto os títulos caem para Roboto só na Vercel).
      './lib/pdf-fontes/CodecCold-ExtraBold.otf',
    ],
  },

  // Server actions: default Next 16 é 1MB. 15MB cobre a maioria dos
  // fluxos (anexos base64, PDFs, imagens). Uploads grandes (áudios,
  // vídeos) vão via /api/upload/signed-url direto pro Supabase Storage,
  // bypassando o server action — ver actions/conteudos.js::uploadConteudo.
  //
  // ⚠️ ESTE NÚMERO NÃO VALE EM PRODUÇÃO ACIMA DE 4,5 MB. A Vercel corta o corpo
  // da request em **4,5 MB** e devolve 413 `FUNCTION_PAYLOAD_TOO_LARGE` antes de
  // qualquer código nosso rodar (conferido na doc da Vercel em 15/08/2026). O
  // efeito é o pior tipo: funciona em dev e falha só no ar. Quem depende de
  // corpo maior tem que ir por signed URL direto ao Storage — e quem valida
  // tamanho em código deve usar o teto REAL, como `lib/inbox/anexos.ts` faz.
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
          // CSP completa (script-src) SÓ EM MODO RELATÓRIO: o navegador reporta o que
          // violaria e não bloqueia nada. Enforçar vem depois de ler os relatórios
          // (`lib/csp-politica.mjs` explica o porquê e o que medir).
          { key: 'Content-Security-Policy-Report-Only', value: CSP_RELATORIO },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), payment=(), browsing-topics=()' },
        ],
      },
    ];
  },

  async rewrites() {
    const gammaHome = process.env.GAMMA_HOME_URL?.replace(/\/+$/, '') || '';

    return {
      beforeFiles: gammaHome
        ? [
            {
              source: '/',
              has: [{ type: 'host', value: '(www\\.)?vertho\\.ai' }],
              destination: `${gammaHome}/`,
            },
          ]
        : [],
      // Mídias dos pacotes offline pelo mesmo domínio: ver lib/demo/offline/midia-rewrites.mjs.
      afterFiles: rewritesDaMidiaOffline(),
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
