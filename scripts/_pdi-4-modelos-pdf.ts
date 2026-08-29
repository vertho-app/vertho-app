/* eslint-disable */
// INTERNO/descartável: renderiza os JSONs da comparação de modelos pelo template
// REAL do PDI (components/pdf/RelatorioIndividual — mesmo wrapper de
// gerarPDFBuffer da action) e salva PDI-<modelo>.pdf em Downloads.
// uso: npx tsx scripts/_pdi-4-modelos-pdf.ts
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const OUT = path.join(os.homedir(), 'Downloads', 'pdi-4-modelos-elda');
const NOME = 'Elda Alves de Souza';
const CARGO = 'Coordenação Pedagógica';
const EMPRESA = 'Secretaria Municipal de Ibipeba/BA';

async function main() {
  const logoBase64 = getLogoCoverBase64();
  const jsons = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
  if (!jsons.length) throw new Error(`nenhum .json em ${OUT}`);
  for (const f of jsons) {
    const modelo = f.replace(/\.json$/, '');
    const conteudo = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    const data = { conteudo, colaborador_nome: NOME, colaborador_cargo: CARGO, gerado_em: new Date().toISOString() };
    const buffer = await renderToBuffer(
      React.createElement(RelatorioIndividualPDF as any, { data, empresaNome: EMPRESA, logoBase64 }) as any,
    );
    const dest = path.join(OUT, `PDI-${modelo}.pdf`);
    fs.writeFileSync(dest, buffer);
    console.log(`✓ ${dest} (${(buffer.length / 1024) | 0}KB)`);
  }
  console.log('Feito.');
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
