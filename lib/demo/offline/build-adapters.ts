import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'esbuild';

/** Build-only adapters: the original pages are bundled; server modules never are. */
export function offlineAdapters(): Plugin {
  const root = process.cwd();
  const offline = resolve(root, 'lib/demo/offline');
  const adapters: Record<string, string> = {
    'next/navigation': 'navigation.tsx', 'next/link': 'navigation.tsx',
    '@/lib/supabase-browser': 'session.ts',
    '@/components/dashboard/presentation-role-switcher': 'presentation.tsx',
    '@/components/bunny-video-player': 'media.tsx',
    '@/lib/use-bunny-tracking': 'media.tsx', '@/lib/auth/fetch-auth': 'media.tsx',
  };
  return { name: 'offline-presentation', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (adapters[args.path]) return { path: resolve(offline, adapters[args.path]) };
    });
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
      if (args.path.includes('node_modules')) return;
      let source = await readFile(args.path, 'utf8');
      if (/^[\s\uFEFF]*['"]use server['"]/.test(source)) {
        const tree = ts.createSourceFile(args.path, source, ts.ScriptTarget.Latest, true);
        const names = tree.statements.filter(ts.isFunctionDeclaration).filter(node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(node => node.name?.text).filter(Boolean) as string[];
        const local = await readFile(resolve(offline, 'local-actions.ts'), 'utf8');
        const known = new Set([...local.matchAll(/export (?:async function|const|function) (\w+)/g)].map(m => m[1]));
        return { contents: `import * as local from ${JSON.stringify(resolve(offline, 'local-actions.ts'))};\n`+names.map(name => `export const ${name} = local.${known.has(name) ? name : 'unavailable'};`).join('\n'), loader: 'ts' };
      }
      if (/['"]server-only['"]/.test(source)) throw new Error(`Server dependency in offline UI: ${args.path}`);
      // Shared UI image references remain under the worker's isolated scope.
      if (args.path.endsWith('beto-chat.tsx')) source = source.replace('src="/beto-avatar.jpg"', 'src={__OFFLINE_BASE__ + "assets/beto-avatar.jpg"}');
      if (args.path.endsWith('dashboard-shell.tsx')) source = source.replace("logoUrl: '/logo-vertho.png'", 'logoUrl: __OFFLINE_BASE__ + "assets/logo-vertho.png"');
      if (args.path.endsWith('in-app-pdf-document.tsx')) source = source.replace(/new URL\(\s*'pdfjs-dist\/build\/pdf.worker.min.mjs',\s*import.meta.url,?\s*\).toString\(\)/, '__OFFLINE_BASE__ + "assets/pdf.worker.min.mjs"');
      if (args.path.endsWith('first-view-video.tsx')) source = source.replace("if (!localStorage.getItem(storageKey)) setOpen(true);", '/* Tutorials open only on request during a presentation. */');
      return { contents: source, loader: args.path.endsWith('tsx') ? 'tsx' : args.path.endsWith('ts') ? 'ts' : 'jsx' };
    });
  } };
}
