import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const locales = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const root = process.cwd();

function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

const keysets = Object.fromEntries(locales.map((locale) => {
  const json = JSON.parse(readFileSync(join(root, 'messages', `${locale}.json`), 'utf8'));
  return [locale, flatten(json)];
}));

const base = keysets['pt-BR'];
let failed = false;

for (const locale of locales.filter((l) => l !== 'pt-BR')) {
  const keys = keysets[locale];
  const missing = [...base].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !base.has(key));

  if (missing.length || extra.length) {
    failed = true;
    console.error(`\n${locale}:`);
    if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    if (extra.length) console.error(`  extra: ${extra.join(', ')}`);
  }
}

if (failed) process.exit(1);

console.log(`i18n keys OK (${base.size} keys across ${locales.length} locales).`);
