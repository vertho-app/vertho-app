# Radar Empresas — orquestrador RAIS_ESTAB
#
# Uso: .\run_rais.ps1 -RaisZip "C:\Users\rdnav\2025\RAIS_ESTAB_PUB.7z"
#
# 1. Extrai RAIS_ESTAB_PUB.7z → out/rais/*.COMT (idempotente)
# 2. DuckDB agrega → out/rais_estab_*.parquet (4 agregados)
# RAIS_ESTAB é latin-1/vírgula/header — DuckDB lê direto (só códigos).

param([Parameter(Mandatory=$true)][string]$RaisZip)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path   # .../rais
$root = Split-Path -Parent $here                          # .../radarempresas
Set-Location $here

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") `
  + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$z = @("C:\Program Files\7-Zip\7z.exe","C:\Program Files (x86)\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $z) { Write-Error "7-Zip não encontrado"; exit 1 }

$raisDir = Join-Path $root "out\rais"
New-Item -ItemType Directory -Force -Path $raisDir | Out-Null
$comt = Join-Path $raisDir "RAIS_ESTAB_PUB.COMT"

if (Test-Path $comt) {
  Write-Output "[skip] RAIS_ESTAB já extraído"
} else {
  if (-not (Test-Path $RaisZip)) { Write-Error "Não achei $RaisZip"; exit 1 }
  Write-Output "[extract] RAIS_ESTAB ..."
  & $z e $RaisZip "-o$raisDir" -y | Out-Null
}
if (-not (Test-Path $comt)) { Write-Error "RAIS_ESTAB_PUB.COMT ausente"; exit 1 }

Set-Location $root
$env:RAIS_ESTAB_FILE = (($comt) -replace '\\','/')
Write-Output ""
Write-Output "[agg] DuckDB agregando RAIS_ESTAB..."
$t0 = Get-Date
duckdb ":memory:" ".read rais/rais_estab_agg.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "Agregação RAIS falhou"; exit 1 }

$dt = [int]((Get-Date) - $t0).TotalSeconds
Write-Output ""
Write-Output "OK em ${dt}s. Parquets em out/:"
Get-ChildItem (Join-Path $root "out") -Filter "rais_estab_*.parquet" |
  ForEach-Object { "  {0} | {1} MB" -f $_.Name, [math]::Round($_.Length/1MB,2) }
