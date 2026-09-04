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

<#
  Cria o servidor FORA da árvore de processos do navegador.

  Medido em 04/09/2026: com o Whisper nascendo como neto do Chrome
  (chrome -> native-host -> powershell -> python), o Bitdefender aplicava a
  política de processo vindo de navegador, redirecionava o acesso a arquivo para
  o "Bitdefender Virtual Disk" e o modelo morria em `Permission denied:
  \\?\Volume{...}\virtual_file.log` — nas TRÊS tentativas (cuda, cpu e small), o
  que já mostrava que não era CUDA. O mesmo Python, lançado fora dessa cadeia,
  carregava de primeira.

  O WMI cria o processo com o provider como pai, então a cadeia se quebra e a
  heurística deixa de casar. Não é substituto para a exceção no antivírus, é a
  defesa que não depende de cada cliente configurar o dele.
#>
function Iniciar-Desacoplado {
  param([string]$Python, [string]$Saida, [string]$Erro)

  # Um .cmd em vez de linha única: o ambiente NÃO é herdado pelo WMI (o processo
  # nasce do provider, não deste PowerShell), então as variáveis precisam ser
  # escritas onde o servidor vai lê-las.
  $script = Join-Path $pastaRuntime 'iniciar.cmd'
  @(
    '@echo off',
    'set "ASR_IDLE_EXIT_SECONDS=300"',
    ('cd /d "{0}"' -f $PSScriptRoot),
    ('"{0}" server.py > "{1}" 2> "{2}"' -f $Python, $Saida, $Erro)
  ) -join "`r`n" | Set-Content -LiteralPath $script -Encoding ascii

  $inicio = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{
    ShowWindow = [uint16]0
  }
  $resultado = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = ('cmd.exe /c "{0}"' -f $script)
    CurrentDirectory = $PSScriptRoot
    ProcessStartupInformation = $inicio
  }
  if ($resultado.ReturnValue -ne 0) {
    throw ('WMI recusou criar o processo (codigo {0})' -f $resultado.ReturnValue)
  }
  return [int]$resultado.ProcessId
}

function Iniciar-Herdado {
  param([string]$Python, [string]$Saida, [string]$Erro)

  $env:ASR_IDLE_EXIT_SECONDS = '300'
  $processo = Start-Process -FilePath $Python -ArgumentList @('server.py') `
    -WorkingDirectory $PSScriptRoot -WindowStyle Hidden `
    -RedirectStandardOutput $Saida -RedirectStandardError $Erro -PassThru
  return [int]$processo.Id
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
    # O pid pode ser do python (modo herdado) ou do cmd que o segura (desacoplado).
    if ($processoAnterior -and ($processoAnterior.Path -eq $python -or $processoAnterior.ProcessName -eq 'cmd')) { exit 0 }
  }

  $saida = Join-Path $pastaRuntime 'whisper.out.log'
  $erro = Join-Path $pastaRuntime 'whisper.err.log'
  # O log de erro é lido pelo host para explicar a falha na tela: começar limpo
  # evita apresentar o erro da tentativa anterior como se fosse o desta.
  Remove-Item -LiteralPath $erro -Force -ErrorAction SilentlyContinue

  $metodo = 'desacoplado'
  try {
    $processoId = Iniciar-Desacoplado -Python $python -Saida $saida -Erro $erro
  } catch {
    # Política de grupo pode bloquear o WMI. O modo antigo continua funcionando
    # onde o antivírus não interfere, então cair para ele é melhor que não subir.
    ('WMI indisponivel, usando modo herdado: ' + $_.Exception.Message) |
      Set-Content -LiteralPath $arquivoErro -Encoding utf8
    $metodo = 'herdado'
    $processoId = Iniciar-Herdado -Python $python -Saida $saida -Erro $erro
  }

  [ordered]@{
    iniciado_em = (Get-Date).ToString('o')
    pid = $processoId
    porta = $porta
    metodo = $metodo
  } | ConvertTo-Json | Set-Content -LiteralPath $arquivoEstado -Encoding utf8
} catch {
  $_.Exception.ToString() | Set-Content -LiteralPath $arquivoErro -Encoding utf8
  if (-not $Silencioso) { throw }
  exit 1
} finally {
  if ($possuiMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
