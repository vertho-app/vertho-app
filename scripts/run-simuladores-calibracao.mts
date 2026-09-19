import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (!process.argv.includes('--executar'))
  throw Error('Canário pago: informe --executar.');
mkdirSync('tmp', { recursive: true });
await build({
  entryPoints: ['scripts/simuladores-calibracao.ts'],
  outfile: 'tmp/simuladores-calibracao.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { 'next/headers': 'next/headers.js' },
  plugins: [
    {
      name: 'server-marker',
      setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({
          path: 'empty',
          namespace: 'marker',
        }));
        b.onLoad({ filter: /.*/, namespace: 'marker' }, () => ({
          contents: '',
          loader: 'js',
        }));
      },
    },
  ],
});
const result = spawnSync(
  process.execPath,
  ['tmp/simuladores-calibracao.mjs', '--executar'],
  { stdio: 'inherit', env: process.env, windowsHide: true },
);
process.exitCode = result.status ?? 1;
