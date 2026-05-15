# Radar Empresas — orquestrador do pipeline (recorte Jundiaí/SP)
#
# Uso:
#   .\run.ps1 -ReceitaDir "I:\...\Receita"
#
# Etapa A: Python faz o staging (lê CSV cp1252 da Receita em streaming,
#          filtra Jundiaí/SP ativo, junta empresas/cnae/municipio) →
#          out/empresas_jundiai.csv (utf-8).
# Etapa B: DuckDB converte o CSV utf-8 → out/empresas_jundiai.parquet.
#
# Python no staging porque DuckDB 1.5 não lê cp1252 (extensão `encodings`
# sem build pra Windows). Não altera os arquivos originais.

param(
  [Parameter(Mandatory = $true)]
  [string]$ReceitaDir
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Test-Path $ReceitaDir)) {
  Write-Error "Diretório da Receita não encontrado: $ReceitaDir"
  exit 1
}

# PATH do DuckDB (winget altera só sessões novas)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") `
  + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

$emp = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.EMPRECSV -ErrorAction SilentlyContinue).Count
$est = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.ESTABELE -ErrorAction SilentlyContinue).Count
$cna = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.CNAECSV  -ErrorAction SilentlyContinue).Count
$mun = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.MUNICCSV -ErrorAction SilentlyContinue).Count
Write-Output "Arquivos em ${ReceitaDir}: EMPRECSV=$emp ESTABELE=$est CNAECSV=$cna MUNICCSV=$mun"
if ($mun -eq 0) { Write-Warning "Sem .MUNICCSV — não resolve Jundiaí." }
if ($est -eq 0) { Write-Warning "Sem .ESTABELE — recorte vazio." }

New-Item -ItemType Directory -Force -Path "out" | Out-Null

# ── Etapa A: staging Python ──────────────────────────────────────────────
Write-Output ""
Write-Output "[A] Staging Python (varre os CSV brutos — pode demorar)..."
$t0 = Get-Date
python "01_pipeline_jundiai.py" "$ReceitaDir"
if ($LASTEXITCODE -ne 0) { Write-Error "Staging Python falhou."; exit 1 }

if (-not (Test-Path "out/empresas_jundiai.csv")) {
  Write-Error "CSV não gerado."
  exit 1
}

# ── Etapa B: CSV utf-8 → Parquet (DuckDB) ────────────────────────────────
Write-Output ""
Write-Output "[B] Convertendo CSV → Parquet (DuckDB)..."
duckdb ":memory:" -c "COPY (SELECT * FROM read_csv('out/empresas_jundiai.csv', header=true, delim=',', quote='""', all_varchar=true)) TO 'out/empresas_jundiai.parquet' (FORMAT PARQUET);"
if ($LASTEXITCODE -ne 0) { Write-Error "Conversão Parquet falhou."; exit 1 }

$dt = [int]((Get-Date) - $t0).TotalSeconds
$sz = [math]::Round((Get-Item "out/empresas_jundiai.parquet").Length / 1MB, 2)
Write-Output ""
Write-Output "OK em ${dt}s -> out/empresas_jundiai.parquet ($sz MB)"
Write-Output "Próximo: node 04_load_to_postgres.mjs"
