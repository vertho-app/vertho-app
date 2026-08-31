[CmdletBinding()]
param([switch]$NaoIniciar)

$ErrorActionPreference = 'Stop'
$raizProjeto = Split-Path -Parent $PSScriptRoot
$fonte = Join-Path $raizProjeto 'tools\copiloto-whisper'
$destino = Join-Path $env:LOCALAPPDATA 'Vertho\Whisper'
$protocolo = 'HKCU:\Software\Classes\vertho-whisper'

if (-not (Test-Path -LiteralPath (Join-Path $fonte 'server.py'))) {
  throw "Arquivos do Whisper não encontrados em $fonte"
}

New-Item -ItemType Directory -Path $destino -Force | Out-Null
foreach ($arquivo in @('server.py', 'pyproject.toml', 'launcher.ps1')) {
  Copy-Item -LiteralPath (Join-Path $fonte $arquivo) -Destination (Join-Path $destino $arquivo) -Force
}

$uvPadrao = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
$uv = if (Test-Path -LiteralPath $uvPadrao) {
  $uvPadrao
} else {
  (Get-Command uv.exe -ErrorAction Stop).Source
}

Push-Location $destino
try {
  & $uv sync --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências do Whisper.' }
} finally {
  Pop-Location
}

$pwsh = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell.exe -ErrorAction Stop).Source }
$launcher = Join-Path $destino 'launcher.ps1'
$comando = '"' + $pwsh + '" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -Silencioso "%1"'

New-Item -Path $protocolo -Force | Out-Null
Set-Item -Path $protocolo -Value 'URL:Vertho Whisper Local'
New-ItemProperty -Path $protocolo -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$protocolo\DefaultIcon" -Force | Out-Null
Set-Item -Path "$protocolo\DefaultIcon" -Value $pwsh
New-Item -Path "$protocolo\shell\open\command" -Force | Out-Null
Set-Item -Path "$protocolo\shell\open\command" -Value $comando

if (-not $NaoIniciar) {
  & $launcher -Silencioso
}

Write-Host "Whisper local instalado em $destino"
Write-Host 'Protocolo vertho-whisper:// registrado para este usuário.'
