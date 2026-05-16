# Radar Empresas — RAIS_VINC: extrai os .7z regionais e agrega
# (município×CNAE). Saída drop-in pro Stage 3 do pipeline BR.
#
# Uso (chamado pelo run_br.ps1, ou avulso):
#   .\run_rais_vinc.ps1 -RaisVincDir "C:\Users\rdnav\2025" -OutDir "<out>"
#
# Os .COMT descompactados são ENORMES (~10-15 GB BR todo). Extrai pra
# um work dir, agrega, e (por padrão) apaga os .COMT no fim. Pula
# arquivos .7z vazios/corrompidos (ex.: o RAIS_VINC_PUB_NI.7z de 0 byte).
param(
  [Parameter(Mandatory=$true)][string]$RaisVincDir,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [switch]$KeepComt
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path "$here\..\..\..").Path
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$sevenZip = @("C:\Program Files\7-Zip\7z.exe","C:\Program Files (x86)\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sevenZip) { Write-Error "7-Zip não encontrado (winget 7zip.7zip)"; exit 1 }

$work = Join-Path $OutDir "_rais_vinc"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$arcs = Get-ChildItem -Path $RaisVincDir -Filter "RAIS_VINC_PUB_*.7z" -ErrorAction SilentlyContinue
if (-not $arcs) { Write-Error "Nenhum RAIS_VINC_PUB_*.7z em $RaisVincDir"; exit 1 }

foreach ($a in $arcs) {
  if ($a.Length -lt 1024) {
    Write-Warning "Pulando $($a.Name) — $($a.Length) bytes (vazio/corrompido)"
    continue
  }
  $sz = [math]::Round($a.Length / 1MB, 0)
  Write-Output "Extraindo $($a.Name) ($sz MB)..."
  & $sevenZip e $a.FullName "-o$work" -y -bso0 -bsp0
  if ($LASTEXITCODE -ne 0) { Write-Warning "Falha ao extrair $($a.Name) — pulando" }
}

$comt = Get-ChildItem -Path $work -Filter "*.COMT" -ErrorAction SilentlyContinue
if (-not $comt) { Write-Error "Nenhum .COMT extraído"; exit 1 }
Write-Output "Extraídos: $($comt.Count) .COMT ($([math]::Round((($comt | Measure-Object Length -Sum).Sum)/1GB,1)) GB). Agregando..."

Set-Location $repo
$env:RAIS_VINC_DIR = $work
$env:OUT_DIR = $OutDir
duckdb ":memory:" -c ".read $here\rais_vinc_agg.sql"
if ($LASTEXITCODE -ne 0) { Write-Error "rais_vinc_agg.sql falhou"; exit 1 }

if (-not $KeepComt) {
  Write-Output "Limpando .COMT (use -KeepComt p/ manter)..."
  Remove-Item "$work\*.COMT" -Force -ErrorAction SilentlyContinue
}
Write-Output "OK -> $OutDir\rais_estab_municipio_cnae.parquet"
