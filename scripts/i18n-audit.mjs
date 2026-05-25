import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const includeDirs = ['app', 'components', 'actions', 'lib'];
const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ignoreDirs = new Set(['node_modules', '.next', 'public', 'data-pipeline']);
const portuguesePattern = /[áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ]|(?:\b(?:não|você|seu|sua|para|com|erro|salvar|voltar|entrar|relatório|avaliação|competência|jornada)\b)/i;

function extname(file) {
  const match = file.match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoreDirs.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (exts.has(extname(entry))) files.push(full);
  }
  return files;
}

const findings = [];

for (const dir of includeDirs) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (trimmed.includes('console.') || trimmed.includes('import ')) return;
      if (portuguesePattern.test(trimmed)) {
        findings.push({ file: rel, line: index + 1, text: trimmed.slice(0, 180) });
      }
    });
  }
}

console.log(`i18n audit: ${findings.length} possíveis textos hardcoded encontrados.`);
for (const item of findings.slice(0, 200)) {
  console.log(`${item.file}:${item.line} ${item.text}`);
}
if (findings.length > 200) {
  console.log(`... mais ${findings.length - 200} ocorrências.`);
}
