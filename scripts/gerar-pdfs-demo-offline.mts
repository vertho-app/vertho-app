// Regera os 18 PDFs de demonstração do pacote offline (lib/demo/offline/documents/<ambiente>/)
// com os renderizadores atuais do app, a partir dos dados fictícios versionados.
//
//   node scripts/gerar-pdfs-demo-offline.mts                 grava em lib/demo/offline/documents
//   node scripts/gerar-pdfs-demo-offline.mts --output=<pasta>  grava em outra pasta (confira antes de versionar)
//
// Precisa de internet só para as fontes públicas que os componentes registram. Não usa banco,
// credencial nem IA. O build normal (`npm run build:demo-offline`) só copia estes arquivos.
// O que não pode aparecer nos PDFs está em tests/unit/demo-offline-pdfs-guard.test.ts.
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const saida = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) || 'lib/demo/offline/documents');
const pacote = resolve('.tmp/gerar-pdfs-demo-offline.mjs');

await build({
  entryPoints: ['lib/demo/offline/documentos.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: pacote,
  logLevel: 'warning',
});
const { gerarDocumentosOffline } = await import(pathToFileURL(pacote).href);

const documentos: Array<{ tenant: string; arquivo: string; bytes: Buffer }> = await gerarDocumentosOffline();
for (const { tenant, arquivo, bytes } of documentos) {
  await mkdir(resolve(saida, tenant), { recursive: true });
  await writeFile(resolve(saida, tenant, arquivo), bytes);
  console.log(`${tenant}/${arquivo} ${bytes.length} bytes`);
}

// Um PDF que ninguém mais gera é um PDF que ninguém mais confere: se sobrou arquivo antigo na pasta
// (o pacote o copia no build), o script avisa e sai com erro, em vez de deixá-lo passar calado.
const gerados = new Set(documentos.map(({ tenant, arquivo }) => `${tenant}/${arquivo}`));
const orfaos: string[] = [];
for (const tenant of new Set(documentos.map((d) => d.tenant))) {
  for (const arquivo of await readdir(resolve(saida, tenant))) {
    if (arquivo.endsWith('.pdf') && !gerados.has(`${tenant}/${arquivo}`)) orfaos.push(`${tenant}/${arquivo}`);
  }
}
console.log(`${documentos.length} documentos em ${saida}`);
if (orfaos.length) {
  console.error(`PDF sem gerador (remova ou crie o gerador): ${orfaos.join(', ')}`);
  process.exit(1);
}
