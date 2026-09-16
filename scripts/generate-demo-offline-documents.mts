// Manual regeneration of fictional reports using the canonical product templates.
// Requires internet for the public fonts registered by those templates.
// Ordinary application builds only copy the committed PDFs; no network or credentials.
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const documentsDir = resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'lib/demo/offline/documents');
await build({stdin:{contents:`
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import Pdi from './components/pdf/RelatorioIndividual';
import Gestor from './components/pdf/RelatorioGestor';
import Rh from './components/pdf/RelatorioRH';
import { schoolOfflineData } from './lib/demo/offline/data';
import { acmeOfflineData } from './lib/demo/offline/acme-data';
import { offlineEnvironment } from './lib/demo/offline/environment';
for(const tenant of ['acme-demo','escolas-acme']) {
 const data=tenant==='acme-demo'?acmeOfflineData():schoolOfflineData();
 const environment=offlineEnvironment(tenant);
 const root=resolve(${JSON.stringify(documentsDir)},tenant);
 await mkdir(root,{recursive:true});
 for(const [name,Component,content] of [['pdi',Pdi,data.pdi],['gestor',Gestor,data.coordination],['rh',Rh,data.direction]]) {
  const bytes=await renderToBuffer(React.createElement(Component,{empresaNome:environment.name,data:{conteudo:content,colaborador_nome:environment.names.participant,colaborador_cargo:data.people.find(p=>p.key===environment.participantKey)?.role,gestor_nome:environment.names.manager,gerado_em:data.capturedAt}}));
  await writeFile(resolve(root,name+'.pdf'),bytes);
  console.log(tenant,name,bytes.length);
 }
}
`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.tmp/offline-pdf-renderer.mjs'});
await import(pathToFileURL(resolve('.tmp/offline-pdf-renderer.mjs')).href);
