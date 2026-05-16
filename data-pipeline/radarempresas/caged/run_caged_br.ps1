# Radar Empresas BR — CAGED: extrai os 6 CAGEDMOV*.7z e agrega.
# Saída drop-in pro Stage 3 do pipeline BR (caged_municipio_cnae_6m.parquet
# no OutDir). Análogo ao run_rais_vinc.ps1.
#
# Estrutura esperada: <CagedRoot>\<YYYYMM>\CAGEDMOV<YYYYMM>.7z
# Janela de 6 meses = a mesma da calibração validada (rotatividade 6m).
#
# Uso (via run_br.ps1, ou avulso):
#   .\run_caged_br.ps1 -CagedRoot "C:\Users\rdnav" -OutDir "<abs out>"
param(
  [Parameter(Mandatory=$true)][string]$CagedRoot,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [string[]]$Meses = @("202510","202511","202512","202601","202602","202603"),
  [switch]$KeepTxt
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path     # .../caged
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$z = @("C:\Program Files\7-Zip\7z.exe","C:\Program Files (x86)\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $z) { Write-Error "7-Zip não encontrado (winget 7zip.7zip)"; exit 1 }

$work = Join-Path $OutDir "_caged"
New-Item -ItemType Directory -Force -Path $work | Out-Null

$ok = 0
foreach ($m in $Meses) {
  $sevenz = Join-Path $CagedRoot "$m\CAGEDMOV$m.7z"
  $txt    = Join-Path $work     "CAGEDMOV$m.txt"
  if (Test-Path $txt) { Write-Output "[skip] $m já extraído"; $ok++; continue }
  if (-not (Test-Path $sevenz)) { Write-Warning "[falta] $sevenz — mês fora da janela 6m"; continue }
  if ((Get-Item $sevenz).Length -lt 1024) { Write-Warning "[skip] $m vazio/corrompido"; continue }
  Write-Output "[extract] $m ..."
  & $z e $sevenz "-o$work" -y -bso0 -bsp0
  if ($LASTEXITCODE -eq 0) { $ok++ } else { Write-Warning "falha extraindo $m" }
}
if ($ok -eq 0) { Write-Error "Nenhum CAGEDMOV extraído"; exit 1 }
if ($ok -lt $Meses.Count) {
  Write-Warning "Só $ok/$($Meses.Count) meses — contexto de rotatividade mais fraco que a calibração validada (6m)."
}

# caged_agg.sql escreve hardcoded 'out/...'. Em vez de truque de cwd,
# patch explícito do destino → temp SQL apontando pro OutDir absoluto.
$outFwd = ($OutDir -replace '\\','/')
$sql = (Get-Content "$here\caged_agg.sql" -Raw) -replace "TO 'out/", "TO '$outFwd/"
$tmpSql = Join-Path $work "_caged_agg_br.sql"
Set-Content -Path $tmpSql -Value $sql -Encoding UTF8

$env:CAGED_TXT_DIR = ($work -replace '\\','/')
# .read quebra em caminhos com espaço ("Vertho App") — passa via stdin
Get-Content $tmpSql -Raw | duckdb ":memory:"
if ($LASTEXITCODE -ne 0) { Write-Error "caged_agg falhou"; exit 1 }

if (-not $KeepTxt) {
  Write-Output "Limpando .txt extraídos (use -KeepTxt p/ manter)..."
  Remove-Item "$work\CAGEDMOV*.txt" -Force -ErrorAction SilentlyContinue
}
Write-Output "OK -> $OutDir\caged_municipio_cnae_6m.parquet"
