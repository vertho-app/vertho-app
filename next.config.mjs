import { withSentryConfig } from '@sentry/nextjs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Build number = short SHA do commit deployado (muda a cada deploy)
let sha = '0000000';
try {
  sha = (process.env.VERCEL_GIT_COMMIT_SHA || execSync('git rev-parse HEAD').toString().trim()).slice(0, 7);
} catch {}
const buildNum = sha;

/** @type {import('next').NextConfig} */
const nextConfig = {
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

  // Upload de anexos (PDF/imagens/áudio) via server action. Default Next é 1MB,
  // insuficiente pra podcasts (m4a típico passa disso). 50MB cobre áudios longos.
  // Next 16 (Turbopack) coloca a chave em experimental, não no top-level.
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Silencia logs do Sentry no build
  silent: true,

  // Não faz upload de source maps (mantém simples)
  disableServerWebpackPlugin: true,
  disableClientWebpackPlugin: true,
});
