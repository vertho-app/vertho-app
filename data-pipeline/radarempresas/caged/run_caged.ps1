# Radar Empresas — orquestrador CAGED (só CAGEDMOV, MVP)
#
# Uso: .\run_caged.ps1 -CagedRoot "C:\Users\rdnav"
#   (raiz onde estão as pastas 202510..202603)
#
# 1. Extrai CAGEDMOV*.7z dos 6 meses → out/caged/*.txt (idempotente)
# 2. DuckDB agrega → out/caged_*.parquet (6 agregados)
# CAGED é UTF-8/;/header — DuckDB lê direto (sem Python).

param([Parameter(Mandatory=$true)][string]$CagedRoot)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path   # .../caged
$root = Split-Path -Parent $here                          # .../radarempresas
Set-Location $here

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") `
  + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$z = @("C:\Program Files\7-Zip\7z.exe","C:\Program Files (x86)\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $z) { Write-Error "7-Zip não encontrado"; exit 1 }

$meses = @("202510","202511","202512","202601","202602","202603")
$txtDir = Join-Path $root "out\caged"
New-Item -ItemType Directory -Force -Path $txtDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root "out") | Out-Null

# ── 1. Extração (pula se o .txt já existe) ───────────────────────────────
foreach ($m in $meses) {
  $sevenz = Join-Path $CagedRoot "$m\CAGEDMOV$m.7z"
  $txt    = Join-Path $txtDir   "CAGEDMOV$m.txt"
  if (Test-Path $txt) { Write-Output "[skip] $m já extraído"; continue }
  if (-not (Test-Path $sevenz)) { Write-Warning "[falta] $sevenz"; continue }
  Write-Output "[extract] $m ..."
  & $z e $sevenz "-o$txtDir" -y | Out-Null
}
$qt = (Get-ChildItem $txtDir -Filter "CAGEDMOV*.txt" -ErrorAction SilentlyContinue).Count
Write-Output "CAGEDMOV .txt disponíveis: $qt/6"
if ($qt -eq 0) { Write-Error "Nenhum CAGEDMOV extraído"; exit 1 }

# ── 2. Agregação DuckDB ──────────────────────────────────────────────────
Set-Location $root          # out/ relativo à pasta radarempresas
$env:CAGED_TXT_DIR = ($txtDir -replace '\\','/')
Write-Output ""
Write-Output "[agg] DuckDB agregando $qt mes(es)..."
$t0 = Get-Date
duckdb ":memory:" ".read caged/caged_agg.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Agregação DuckDB falhou"; exit 1 }

$dt = [int]((Get-Date) - $t0).TotalSeconds
Write-Output ""
Write-Output "OK em ${dt}s. Parquets em out/:"
Get-ChildItem (Join-Path $root "out") -Filter "caged_*.parquet" |
  ForEach-Object { "  {0} | {1} MB" -f $_.Name, [math]::Round($_.Length/1MB,2) }
Write-Output "Próximo: migration 100 + carga recorte (Jundiaí + benchmarks nacionais)"
