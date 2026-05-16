/**
 * Stage 5b (BR) — 1 XLSX por município com os priorizados (top 10%).
 *
 * O lead-a-lead NÃO vai pro DB Supabase (custo). Vira arquivo no
 * Storage: a tela mostra consolidado por cidade e oferece "baixar XLSX
 * desta cidade". Lê as partições priorizados/municipio_ibge=... (Stage
 * 5), gera out/xlsx/{ibge}.xlsx via exceljs streaming (mem constante).
 *
 * npx tsx data-pipeline/radarempresas/br/16_export_xlsx.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import ExcelJS from 'exceljs';

const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';
const PRIO = `${OUT}/priorizados`;
const XLSX = `${OUT}/xlsx`;
const duck = (sql: string) =>
  execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });

const COLS = [
  ['cnpj_completo', 'CNPJ'], ['score_total', 'Score'], ['classificacao', 'Classe'],
  ['priority_rank', 'Rank %'], ['segmento_key', 'Segmento'],
  ['score_confidence', 'Confiança'], ['score_dor_pessoas', 'Dor'],
  ['score_capacidade_compra', 'Capacidade'], ['score_fit_vertho', 'Fit'],
  ['commercial_actionability', 'Acionab.'],
] as const;

async function main() {
  if (!existsSync(PRIO)) { console.error(`Sem ${PRIO} — rode Stage 5 antes.`); process.exit(1); }
  rmSync(XLSX, { recursive: true, force: true });
  mkdirSync(XLSX, { recursive: true });

  // partições municipio_ibge=XXXXXX (DuckDB Hive partition)
  const parts = readdirSync(PRIO).filter((d) => d.startsWith('municipio_ibge='));
  console.log(`Gerando ${parts.length} XLSX (1/município) → ${XLSX}`);
  let n = 0;
  for (const part of parts) {
    const ibge = part.split('=')[1];
    // list() é agregado → ordenar DENTRO (list(... ORDER BY)), não fora
    const rowsJson = duck(
      `SELECT to_json(list(struct_pack(`
      + COLS.map(([c]) => `${c} := ${c}`).join(', ')
      + `) ORDER BY score_total DESC)) `
      + `FROM read_parquet('${PRIO}/${part}/*.parquet');`,
    );
    // duckdb -csv-ish: a saída vem como uma linha JSON; parse robusto
    const m = rowsJson.match(/\[.*\]/s);
    const rows = m ? JSON.parse(m[0]) : [];
    if (!rows.length) continue;

    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: `${XLSX}/${ibge}.xlsx` });
    const ws = wb.addWorksheet('Priorizados');
    ws.addRow(COLS.map(([, h]) => h)).commit();
    for (const r of rows) ws.addRow(COLS.map(([c]) => (r as any)[c])).commit();
    ws.commit();
    await wb.commit();
    n++;
    if (n % 200 === 0) console.log(`  ${n}/${parts.length}...`);
  }
  console.log(`[OK] ${n} XLSX gerados → ${XLSX}. Próximo: Stage 6 (17_load_supabase.ts)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
