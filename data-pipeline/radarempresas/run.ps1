# Radar Empresas — orquestrador do pipeline DuckDB (recorte Jundiaí/SP)
#
# Uso:
#   .\run.ps1 -ReceitaDir "D:\receita-2026-05"
#
# Lê os CSVs brutos da Receita em -ReceitaDir, filtra Jundiaí/SP ativo,
# e gera out/empresas_jundiai.parquet. Não altera os originais.

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

# Garante PATH do DuckDB nesta sessão (winget altera só sessões novas)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") `
  + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Conta o que existe (pode rodar antes do download terminar)
$emp = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.EMPRECSV -ErrorAction SilentlyContinue).Count
$est = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.ESTABELE -ErrorAction SilentlyContinue).Count
$cna = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.CNAECSV  -ErrorAction SilentlyContinue).Count
$mun = (Get-ChildItem -Path $ReceitaDir -Recurse -Filter *.MUNICCSV -ErrorAction SilentlyContinue).Count

Write-Output "Arquivos encontrados em ${ReceitaDir}:"
Write-Output "  Empresas (.EMPRECSV):        $emp"
Write-Output "  Estabelecimentos (.ESTABELE): $est"
Write-Output "  Cnaes (.CNAECSV):            $cna"
Write-Output "  Municipios (.MUNICCSV):      $mun"

if ($mun -eq 0) {
  Write-Warning "Sem .MUNICCSV — necessário pra resolver o código de Jundiaí. Baixe a tabela Municipios antes de rodar."
}
if ($est -eq 0) {
  Write-Warning "Sem .ESTABELE — recorte sairá vazio. Aguarde o download de Estabelecimentos."
}

New-Item -ItemType Directory -Force -Path "out" | Out-Null
New-Item -ItemType Directory -Force -Path "tmp_duck" | Out-Null

$env:RECEITA_DIR = (Resolve-Path $ReceitaDir).Path -replace '\\','/'

Write-Output ""
Write-Output "Rodando DuckDB (pode demorar — varre os CSVs brutos)..."
$t0 = Get-Date

duckdb ":memory:" ".read 01_pipeline_jundiai.sql"

$dt = [int]((Get-Date) - $t0).TotalSeconds
Write-Output ""
if (Test-Path "out/empresas_jundiai.parquet") {
  $sz = [math]::Round((Get-Item "out/empresas_jundiai.parquet").Length / 1MB, 2)
  Write-Output "OK em ${dt}s -> out/empresas_jundiai.parquet ($sz MB)"
} else {
  Write-Error "Parquet não gerado. Veja o output do DuckDB acima."
  exit 1
}
