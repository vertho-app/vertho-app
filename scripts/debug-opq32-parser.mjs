#!/usr/bin/env node
// Debug do parser OPQ32 — extrai texto via unpdf e mostra o bloco de
// dados encontrado, pra ajustar regex se necessário.
//
// Uso: node scripts/debug-opq32-parser.mjs <caminho-pdf>
import { readFileSync } from 'node:fs';
import { extractText } from 'unpdf';

const path = process.argv[2];
if (!path) {
  console.error('Uso: node scripts/debug-opq32-parser.mjs <caminho-pdf>');
  process.exit(1);
}

const buf = readFileSync(path);
const result = await extractText(new Uint8Array(buf));
const texto = Array.isArray(result.text) ? result.text.join('\n\n') : (result.text || '');

console.log(`=== Tamanho total: ${texto.length} chars ===`);
console.log(`=== Páginas: ${Array.isArray(result.text) ? result.text.length : 1} ===\n`);

// Procura "Dados do Candidato"
const idxDados = texto.indexOf('Dados do Candidato');
if (idxDados >= 0) {
  console.log('=== Bloco "Dados do Candidato" encontrado ===');
  console.log(texto.slice(idxDados, idxDados + 800));
  console.log('---\n');
} else {
  console.log('⚠ Bloco "Dados do Candidato" NÃO ENCONTRADO no texto extraído!\n');
}

// Procura por padrões RP/TS/FE
const re = /\b(RP\d{1,2}|TS\d{1,2}|FE\d{1,2}|CNS)\s*=\s*(\d{1,2})\b/g;
const matches = [...texto.matchAll(re)];
console.log(`=== Matches do regex atual: ${matches.length} ===`);
for (const m of matches.slice(0, 35)) {
  console.log(`  ${m[1]}=${m[2]}`);
}

// Trecho da última página (geralmente onde está o bloco)
console.log('\n=== Últimos 1500 chars do PDF ===');
console.log(texto.slice(-1500));

// Variantes de regex pra testar:
console.log('\n=== Testes de regex alternativos ===');
const variantes = [
  { nome: 'atual',           re: /\b(RP\d{1,2}|TS\d{1,2}|FE\d{1,2}|CNS)\s*=\s*(\d{1,2})\b/g },
  { nome: 'sem-boundary',    re: /(RP\d{1,2}|TS\d{1,2}|FE\d{1,2}|CNS)\s*=\s*(\d{1,2})/g },
  { nome: 'multiline-sep',   re: /(RP\d{1,2}|TS\d{1,2}|FE\d{1,2}|CNS)[\s\S]{0,5}=[\s\S]{0,5}(\d{1,2})/g },
];
for (const v of variantes) {
  const c = [...texto.matchAll(v.re)].length;
  console.log(`  ${v.nome}: ${c} matches`);
}
