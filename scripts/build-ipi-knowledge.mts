import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Executado apenas no build. A lambda recebe um índice fechado, nunca o filesystem do projeto.
const root = process.cwd();
type Chunk = { kind: 'manual' | 'codigo'; title: string; reference: string; route?: string; text: string };
const chunks: Chunk[] = [];
const scrub = (text: string) => text
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
  .replace(/\b(?:sk-|sk_live_|ghp_|github_pat_|eyJ)[a-zA-Z0-9_.-]{18,}/g, '[credencial removida]')
  .replace(/^.*(?:process\.env|Bearer |PRIVATE KEY|service_role|SUPABASE_SERVICE_ROLE_KEY).*$/gm, '// configuração privada omitida');

const manual = JSON.parse(await readFile(path.join(root, 'docs/ipi/manual.json'), 'utf8'));
for (const page of manual.pages) {
  for (const [i, section] of page.sections.entries()) {
    chunks.push({ kind: 'manual', title: page.title, route: page.route, reference: `Manual de telas · ${page.title} · seção ${i + 1} (${manual.reviewedAt})`, text: section });
  }
}

async function visit(relative: string) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) { await visit(file); continue; }
    if (!/\.tsx?$/.test(entry.name) || /(?:ipi|supabase|secret|credential)/i.test(file)) continue;
    const content = scrub(await readFile(path.join(root, file), 'utf8'));
    const lines = content.split(/\r?\n/);
    const route = /^app\/admin(?:-v2)?\//.test(file) && entry.name === 'page.tsx' ? '/' + file.replace(/^app\//, '').replace(/\/page.tsx$/, '') : undefined;
    for (let start = 0; start < lines.length; start += 65) {
      chunks.push({ kind: 'codigo', title: file, reference: `${file}:${start + 1}`, route, text: lines.slice(start, start + 80).join('\n').slice(0, 6500) });
    }
  }
}

// Somente fontes do produto. Nada de envs, backups, scripts, logs ou dados de produção.
for (const dir of ['app/admin', 'app/admin-v2', 'actions', 'lib/season-engine', 'lib/scoring']) await visit(dir);
for (const file of ['lib/blocos-offline.ts', 'lib/permissions.ts', 'lib/competencia-conhecimento.ts', 'lib/cargo-contexto.ts']) {
  const content = scrub(await readFile(path.join(root, file), 'utf8'));
  const lines = content.split(/\r?\n/);
  for (let start = 0; start < lines.length; start += 65) chunks.push({ kind: 'codigo', title: file, reference: `${file}:${start + 1}`, text: lines.slice(start, start + 80).join('\n').slice(0, 6500) });
}
const digest = createHash('sha256').update(JSON.stringify(chunks)).digest('hex');
await mkdir(path.join(root, '.ipi'), { recursive: true });
await writeFile(path.join(root, '.ipi/knowledge.json'), JSON.stringify({ version: 1, digest, chunks }));
console.log(`[ipi] ${manual.pages.length} telas do manual, ${chunks.length} trechos; índice ${digest.slice(0, 12)}.`);
