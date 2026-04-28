#!/usr/bin/env node
/**
 * Filtra Tabela_Escola_*.csv (microdados Censo Escolar INEP, ~165MB) pelos
 * 20 municípios da microrregião de Irecê/BA. Saída fica em ~5MB e pode ser
 * importada via /admin/radar.
 *
 * Uso:
 *   node scripts/filter-censo-irece.mjs <input.csv> [output.csv]
 *   node scripts/filter-censo-irece.mjs "C:/.../Tabela_Escola_2025.csv"
 *
 * Saída padrão: censo_escolar_irece_<ano>.csv ao lado do input.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { argv, exit, stderr, stdout } from 'node:process';

const IRECE_IBGE = new Set([
  '2900801', '2902708', '2902906', '2904902', '2906105', '2907400',
  '2912012', '2913101', '2913200', '2914604', '2915205', '2915809',
  '2917509', '2918506', '2919405', '2921005', '2925006', '2929206',
  '2933000', '2933505',
]);

async function main() {
  const inputPath = argv[2];
  if (!inputPath) {
    stderr.write('Uso: node scripts/filter-censo-irece.mjs <input.csv> [output.csv]\n');
    exit(1);
  }
  const inputAbs = resolve(inputPath);
  const dir = dirname(inputAbs);
  const baseName = basename(inputAbs, '.csv');
  const outputPath = argv[3] || resolve(dir, `${baseName}_irece.csv`);

  stderr.write(`Input:  ${inputAbs}\n`);
  stderr.write(`Output: ${outputPath}\n`);
  stderr.write(`Filtro: ${IRECE_IBGE.size} municípios IBGE da microrregião de Irecê/BA\n\n`);

  const rl = createInterface({
    input: createReadStream(inputAbs, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const out = createWriteStream(outputPath, { encoding: 'utf8' });

  let header = null;
  let ibgeIdx = -1;
  let total = 0;
  let kept = 0;
  let skipped = 0;
  const startedAt = Date.now();
  let lastReport = startedAt;

  for await (const line of rl) {
    if (!header) {
      header = line;
      const cells = header.split(';');
      ibgeIdx = cells.indexOf('CO_MUNICIPIO');
      if (ibgeIdx < 0) {
        stderr.write('ERRO: coluna CO_MUNICIPIO não encontrada no header.\n');
        exit(2);
      }
      out.write(line + '\n');
      continue;
    }
    total++;
    const idx = nthCell(line, ibgeIdx, ';');
    if (idx == null) { skipped++; continue; }
    const ibge = idx.padStart(7, '0');
    if (IRECE_IBGE.has(ibge)) {
      out.write(line + '\n');
      kept++;
    } else {
      skipped++;
    }

    const now = Date.now();
    if (now - lastReport > 1500) {
      stderr.write(`  ... ${total.toLocaleString('pt-BR')} linhas processadas, ${kept} mantidas\n`);
      lastReport = now;
    }
  }

  out.end();
  await new Promise((res) => out.on('finish', res));

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  stdout.write(`\n✓ Concluído em ${elapsed}s\n`);
  stdout.write(`  Total processado: ${total.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Mantidas (Irecê): ${kept}\n`);
  stdout.write(`  Ignoradas:        ${skipped.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Saída: ${outputPath}\n`);
}

/** Lê apenas a célula N de uma linha CSV (separador `;`), evitando split global. */
function nthCell(line, n, sep) {
  let cell = 0;
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || line[i] === sep) {
      if (cell === n) return line.slice(start, i);
      cell++;
      start = i + 1;
    }
  }
  return null;
}

main().catch((err) => {
  stderr.write(`FATAL: ${err?.stack || err}\n`);
  exit(3);
});
