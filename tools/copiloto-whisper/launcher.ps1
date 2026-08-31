[CmdletBinding()]
param(
  [switch]$Silencioso,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Uri
)

$ErrorActionPreference = 'Stop'
$porta = 8765
$pastaRuntime = Join-Path $PSScriptRoot '.runtime'
$arquivoErro = Join-Path $pastaRuntime 'launcher.err.log'
$arquivoEstado = Join-Path $pastaRuntime 'processo.json'
$mutex = [System.Threading.Mutex]::new($false, 'Local\VerthoWhisperLauncher')
$possuiMutex = $false

function Testar-Porta {
  $cliente = [System.Net.Sockets.TcpClient]::new()
  try {
    $conexao = $cliente.ConnectAsync('127.0.0.1', $porta)
    if (-not $conexao.Wait(500)) { return $false }
    return $cliente.Connected
  } catch {
    return $false
  } finally {
    $cliente.Dispose()
  }
}

try {
  New-Item -ItemType Directory -Path $pastaRuntime -Force | Out-Null
  $possuiMutex = $mutex.WaitOne(0)
  if (-not $possuiMutex -or (Testar-Porta)) { exit 0 }

  $python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $python)) {
    throw 'O Whisper local não está instalado. Execute novamente o instalador da Vertho.'
  }

  if (Test-Path -LiteralPath $arquivoEstado) {
    $estadoAnterior = Get-Content -LiteralPath $arquivoEstado -Raw | ConvertFrom-Json
    $processoAnterior = Get-Process -Id ([int]$estadoAnterior.pid) -ErrorAction SilentlyContinue
    if ($processoAnterior -and $processoAnterior.Path -eq $python) { exit 0 }
  }

  $env:ASR_IDLE_EXIT_SECONDS = '300'
  $parametros = @{
    FilePath = $python
    ArgumentList = @('server.py')
    WorkingDirectory = $PSScriptRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = Join-Path $pastaRuntime 'whisper.out.log'
    RedirectStandardError = Join-Path $pastaRuntime 'whisper.err.log'
    PassThru = $true
  }
  $processo = Start-Process @parametros
  [ordered]@{
    iniciado_em = (Get-Date).ToString('o')
    pid = $processo.Id
    porta = $porta
  } | ConvertTo-Json | Set-Content -LiteralPath $arquivoEstado -Encoding utf8
} catch {
  $_.Exception.ToString() | Set-Content -LiteralPath $arquivoErro -Encoding utf8
  if (-not $Silencioso) { throw }
  exit 1
} finally {
  if ($possuiMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
