# Radar Empresas — orquestrador do pipeline BR (snapshot mensal, full
# rebuild idempotente). Todo cálculo pesado roda LOCAL (DuckDB/Parquet);
# Supabase recebe só agregados. Resume por estágio com -FromStage.
#
# Uso:
#   .\run_br.ps1 -ReceitaDir "X:\Receita" -CagedDir "X:\CAGED" `
#                -RaisFile "X:\RAIS\RAIS_ESTAB_PUB.COMT" `
#                [-RefDate 2026-05-15] [-FromStage 1] [-SkipCempre]
#
# Estágios: 1 transcode · 2 ingest · 3a aggs CAGED/RAIS · 2.5 CEMPRE ·
#   3 contexto · ref dump · 4 score · 5 rank/redes · 5b xlsx · 6 load.
param(
  [Parameter(Mandatory=$true)][string]$ReceitaDir,
  # raiz com <YYYYMM>\CAGEDMOV<YYYYMM>.7z dos 6 meses (extrai+agrega)
  [Parameter(Mandatory=$true)][string]$CagedRoot,
  # diretório com os RAIS_VINC_PUB_*.7z regionais (extrai+agrega)
  [Parameter(Mandatory=$true)][string]$RaisVincDir,
  [string]$RefDate = "2026-05-15",
  [int]$FromStage = 1,
  [switch]$SkipCempre
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path "$here\..\..\..").Path
Set-Location $repo
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

$OUT = "data-pipeline/radarempresas/br/out"
$env:OUT_DIR = $OUT
$env:REF_DATE = $RefDate
New-Item -ItemType Directory -Force -Path $OUT | Out-Null
New-Item -ItemType Directory -Force -Path "$OUT/utf8" | Out-Null
function Step($n,$msg){ Write-Output ""; Write-Output "===== [$n] $msg =====" }
function Die($m){ Write-Error $m; exit 1 }

if ($FromStage -le 1) {
  Step "1" "Transcode cp1252->utf8"
  python "$here\10_transcode_utf8.py" "$ReceitaDir" "$OUT/utf8"
  if ($LASTEXITCODE -ne 0) { Die "Stage 1 falhou" }
}
if ($FromStage -le 2) {
  Step "2" "Ingest Receita -> base parquet (particionado por UF)"
  $env:UTF8_DIR = "$OUT/utf8"
  Get-Content "$here\11_ingest.sql" -Raw | duckdb ":memory:"
  if ($LASTEXITCODE -ne 0) { Die "Stage 2 falhou" }
}
if ($FromStage -le 3) {
  $outAbs = (Join-Path $repo $OUT)
  Step "3a-CAGED" "Agregado CAGED nacional (extrai 6 meses .7z + agrega)"
  & "$here\..\caged\run_caged_br.ps1" -CagedRoot $CagedRoot -OutDir $outAbs
  if ($LASTEXITCODE -ne 0) { Die "CAGED agg falhou" }

  Step "3a-RAIS" "Agregado RAIS_VINC nacional (extrai .7z + agrega)"
  & "$here\..\rais\run_rais_vinc.ps1" -RaisVincDir $RaisVincDir -OutDir $outAbs
  if ($LASTEXITCODE -ne 0) { Die "RAIS_VINC agg falhou" }
  # Saídas: caged_municipio_cnae_6m.parquet + rais_estab_municipio_cnae
  # .parquet (nome mantido p/ Stage 3 dropar direto).
}
if ($FromStage -le 4) {
  if (-not $SkipCempre) {
    Step "2.5" "CEMPRE via SIDRA (corroboração)"
    npx tsx "$here\15_cempre_sidra.ts"
    if ($LASTEXITCODE -ne 0) { Write-Warning "CEMPRE falhou — seguindo sem (corroboração no-op)" }
  }
  # guard: Stage 3 lê cempre_sidra.parquet; se ausente, stub vazio
  if (-not (Test-Path "$OUT/cempre_sidra.parquet")) {
    duckdb ":memory:" -c "COPY (SELECT ''::VARCHAR municipio_ibge, ''::VARCHAR cnae, 0.0::DOUBLE cempre_n_empresas, 0.0::DOUBLE cempre_pessoal_assal WHERE 1=0) TO '$OUT/cempre_sidra.parquet' (FORMAT PARQUET);"
  }
  Step "3" "Contexto setorial (bayesiano por município + corroboração)"
  Get-Content "$here\14_contexto.sql" -Raw | duckdb ":memory:"
  if ($LASTEXITCODE -ne 0) { Die "Stage 3 falhou" }
}
if ($FromStage -le 4) {
  Step "ref" "Dump ref tables (allowlist/denylist/tetos)"
  npx tsx "$here\19_dump_ref.ts"
  Step "4" "Score (motor TS sobre Parquet)"
  npx tsx "$here\12_score.ts"
  if ($LASTEXITCODE -ne 0) { Die "Stage 4 falhou" }
}
if ($FromStage -le 5) {
  Step "5" "priority_rank nacional + redes + agregados"
  Get-Content "$here\13_rank_redes.sql" -Raw | duckdb ":memory:"
  if ($LASTEXITCODE -ne 0) { Die "Stage 5 falhou" }
  Step "5b" "XLSX por município"
  npx tsx "$here\16_export_xlsx.ts"
  if ($LASTEXITCODE -ne 0) { Die "Stage 5b falhou" }
}
if ($FromStage -le 6) {
  Step "6" "Carga Supabase (agregados) + Storage (XLSX)"
  npx tsx "$here\17_load_supabase.ts"
  if ($LASTEXITCODE -ne 0) { Die "Stage 6 falhou" }
}
Write-Output ""
Write-Output "OK — snapshot BR completo. DB = agregados (custo zero); leads no Storage."
