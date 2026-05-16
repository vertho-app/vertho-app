/**
 * Crosswalk Receita ↔ IBGE. A base Receita traz municipio_cod (TOM,
 * código próprio da Receita — ex. Jundiaí=6619) + municipio_nome + uf.
 * CAGED/RAIS/contexto usam municipio_ibge 6-díg (ex. 352590). Sem ponte
 * o join base↔contexto quebra (Stage 4/5).
 *
 * Fonte autoritativa: API IBGE localidades (5.571 municípios, id 7-díg
 * = 6-díg + dígito verificador). A ponte é por (UF, nome normalizado) —
 * Receita não publica TOM↔IBGE; nome+UF casa ~99% (resto = NULL →
 * sem contexto p/ aquele município, degrada confiança, não quebra).
 *
 * Saída: out/crosswalk_ibge.parquet (uf, nome_norm, municipio_ibge).
 * O nome_norm é calculado em SQL com a MESMA expressão do 11_ingest
 * (canônica abaixo) — zero divergência de normalização.
 *
 * npx tsx data-pipeline/radarempresas/br/18_crosswalk_ibge.ts
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';
const duck = (sql: string) =>
  execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });

async function main() {
  const r = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios',
    { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`IBGE localidades HTTP ${r.status}`);
  const mun = await r.json() as any[];
  const rows = mun.map((m) => {
    const uf = m?.microrregiao?.mesorregiao?.UF?.sigla
      ?? m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ?? '';
    return JSON.stringify({
      uf,
      nome: m.nome,
      municipio_ibge: String(m.id).slice(0, 6), // 7-díg → 6-díg (= CAGED/RAIS)
    });
  });
  writeFileSync(`${OUT}/_ibge_mun.ndjson`, rows.join('\n') + '\n');

  // nome_norm = MESMA expressão canônica usada no 11_ingest (e no redes):
  // upper + strip_accents + não-alfanum→espaço + colapsa + trim
  duck(`COPY (
    SELECT uf,
      trim(regexp_replace(regexp_replace(
        upper(strip_accents(coalesce(nome,''))),
        '[^A-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g')) AS nome_norm,
      municipio_ibge
    FROM read_json('${OUT}/_ibge_mun.ndjson', format='newline_delimited',
      columns={uf:'VARCHAR', nome:'VARCHAR', municipio_ibge:'VARCHAR'})
    WHERE uf <> '' AND municipio_ibge <> ''
  ) TO '${OUT}/crosswalk_ibge.parquet' (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);`);

  const out = duck(`SELECT COUNT(*) AS n FROM read_parquet('${OUT}/crosswalk_ibge.parquet');`);
  const n = out.replace(/[^\d]/g, ' ').trim().split(/\s+/).filter(Boolean).pop();
  console.log(`crosswalk_ibge: ${n} municípios (uf, nome_norm → ibge6) → ${OUT}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
