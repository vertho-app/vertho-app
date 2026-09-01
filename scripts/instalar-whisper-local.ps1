[CmdletBinding()]
param([switch]$Validar)

$ErrorActionPreference = 'Stop'
$raizProjeto = Split-Path -Parent $PSScriptRoot
$fonte = Join-Path $raizProjeto 'tools\copiloto-whisper'
$destino = Join-Path $env:LOCALAPPDATA 'Vertho\Whisper'
$fonteExtensao = Join-Path $fonte 'extension'
$destinoExtensao = Join-Path $destino 'extension'
$idExtensao = 'eigabofjjdigicbphdgdolhelcaiebfo'

if (-not (Test-Path -LiteralPath (Join-Path $fonte 'server.py'))) {
  throw "Arquivos do Whisper não encontrados em $fonte"
}

New-Item -ItemType Directory -Path $destino -Force | Out-Null
New-Item -ItemType Directory -Path $destinoExtensao -Force | Out-Null
foreach ($arquivo in @('server.py', 'pyproject.toml', 'launcher.ps1', 'native-host.cs')) {
  Copy-Item -LiteralPath (Join-Path $fonte $arquivo) -Destination (Join-Path $destino $arquivo) -Force
}
foreach ($arquivo in @('manifest.json', 'service-worker.js')) {
  Copy-Item -LiteralPath (Join-Path $fonteExtensao $arquivo) -Destination (Join-Path $destinoExtensao $arquivo) -Force
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

$csc = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw 'Compilador nativo do Windows não encontrado.' }

$hostNativo = Join-Path $destino 'native-host.exe'
$hostTemporario = Join-Path $destino 'native-host.new.exe'
Remove-Item -LiteralPath $hostTemporario -Force -ErrorAction SilentlyContinue
& $csc /nologo /target:exe /platform:anycpu /optimize+ "/out:$hostTemporario" (Join-Path $destino 'native-host.cs')
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível compilar o host nativo do Whisper.' }
Move-Item -LiteralPath $hostTemporario -Destination $hostNativo -Force

$manifestoHost = Join-Path $destino 'native-host-manifest.json'
[ordered]@{
  name = 'ai.vertho.whisper'
  description = 'Acionador local do Whisper Vertho'
  path = $hostNativo
  type = 'stdio'
  allowed_origins = @("chrome-extension://$idExtensao/")
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestoHost -Encoding utf8

$chaveHost = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\ai.vertho.whisper'
New-Item -Path $chaveHost -Force | Out-Null
Set-Item -Path $chaveHost -Value $manifestoHost

# Remove as duas estratégias antigas. Nenhum processo fica registrado no login.
$chaveRun = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -Path $chaveRun -Name 'VerthoWhisperBootstrap' -ErrorAction SilentlyContinue
$protocoloAntigo = 'HKCU:\Software\Classes\vertho-whisper'
Remove-Item -LiteralPath $protocoloAntigo -Recurse -Force -ErrorAction SilentlyContinue
foreach ($arquivoAntigo in @('bootstrap.py', 'bootstrap-launcher.ps1')) {
  Remove-Item -LiteralPath (Join-Path $destino $arquivoAntigo) -Force -ErrorAction SilentlyContinue
}

if ($Validar) {
  & (Join-Path $destino 'launcher.ps1') -Silencioso
}

Write-Host "Whisper local instalado em $destino"
Write-Host 'Nenhum processo foi registrado no login do Windows.'
Write-Host 'No Chrome, abra chrome://extensions, ative o modo do desenvolvedor e use "Carregar sem compactação".'
Write-Host "Selecione esta pasta: $destinoExtensao"
