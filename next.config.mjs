import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Garante que os PNGs usados via fs.readFileSync em server components/API
  // routes sejam incluídos no bundle serverless na Vercel.
  outputFileTracingIncludes: {
    '/api/relatorios/**': ['./public/logo-vertho.png', './public/logo-vertho-cover.png', './public/template-fundo-relatorios.png'],
    '/**': ['./public/logo-vertho.png', './public/logo-vertho-cover.png', './public/template-fundo-relatorios.png'],
  },
};

export default withSentryConfig(nextConfig, {
  // Silencia logs do Sentry no build
  silent: true,

  // Não faz upload de source maps (mantém simples)
  disableServerWebpackPlugin: true,
  disableClientWebpackPlugin: true,
});
