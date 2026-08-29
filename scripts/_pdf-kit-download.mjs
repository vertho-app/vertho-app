// INTERNO / não-versionar: baixa os PDFs do kit de treinamento do representante
// (bucket sales-materials) pra ~/Downloads/vertho-pdf-samples. Rodar de nextjs-app:
//   node scripts/_pdf-kit-download.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k) => ENV.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim();
const url = pick('NEXT_PUBLIC_SUPABASE_URL');
const key = pick('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) { console.error('env ausente'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const OUT = path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples');
fs.mkdirSync(OUT, { recursive: true });

// paths distintos e ativos do kit (de sales_materials.storage_path) → nome de saída
const FILES = [
  ['kit/scripts-qualificacao.pdf', '16-kit-scripts-qualificacao'],
  ['kit/modelo-proposta.pdf', '17-kit-modelo-proposta'],
  ['kit/onepagers-segmento.pdf', '18-kit-onepagers-segmento'],
  ['kit/onepager-escola-privada.pdf', '19-kit-onepager-escola-privada'],
  ['kit/battlecard.pdf', '20-kit-battlecard'],
  ['kit/cheat-sheet-demo.pdf', '21-kit-cheat-sheet-demo'],
  ['kit/7-etapas.pdf', '22-kit-7-etapas'],
  ['kit/mapa-jornada.pdf', '23-kit-mapa-jornada'],
];

let ok = 0;
for (const [src, nome] of FILES) {
  const { data, error } = await sb.storage.from('sales-materials').download(src);
  if (error || !data) { console.error(`  ✗ ${nome}: ${error?.message || 'indisponível'}`); continue; }
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(path.join(OUT, nome + '.pdf'), buf);
  console.log(`  ✔ ${nome}.pdf (${(buf.length / 1024) | 0} KB)`);
  ok++;
}
console.log(`\n${ok}/${FILES.length} baixados em ${OUT}`);
