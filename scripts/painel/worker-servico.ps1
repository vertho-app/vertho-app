<#
.SYNOPSIS
  Liga o worker do /board sozinho, toda vez que o Rodrigo faz logon.

.DESCRIPTION
  Os quatro modelos do painel rodam por ASSINATURA, como processos desta máquina
  — a Vercel não os alcança. Então a web enfileira e alguém aqui tem de executar.
  Sem isso, o pedido fica esperando e a tela acusa "worker desligado".

  Registra uma tarefa agendada DO USUÁRIO (não do SYSTEM): não pede senha, não
  precisa de elevação e roda escondida, com o log em arquivo.

  Deliberadamente NÃO é serviço do Windows: serviço roda sem sessão de usuário, e
  os CLIs (claude, codex, kimi, agy) dependem das credenciais de assinatura do
  perfil logado. Um serviço subiria e falharia em toda chamada.

.EXAMPLE
  .\scripts\painel\worker-servico.ps1 -Instalar
  .\scripts\painel\worker-servico.ps1 -Status
  .\scripts\painel\worker-servico.ps1 -Parar
  .\scripts\painel\worker-servico.ps1 -Remover
#>
[CmdletBinding()]
param(
  [switch]$Instalar,
  [switch]$Remover,
  [switch]$Status,
  [switch]$Parar,
  [switch]$Iniciar
)

$ErrorActionPreference = 'Stop'

$Tarefa  = 'Vertho - Board worker'
$Repo    = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Log     = Join-Path $env:LOCALAPPDATA 'vertho-board-worker.log'
$Node    = (Get-Command node -ErrorAction SilentlyContinue).Source

function Escrever($msg) { Write-Host $msg }

if ($Status) {
  $t = Get-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  if (-not $t) { Escrever "tarefa NAO instalada"; }
  else {
    $info = Get-ScheduledTaskInfo -TaskName $Tarefa
    Escrever "tarefa: $($t.State) · ultima execucao: $($info.LastRunTime) · resultado: $($info.LastTaskResult)"
  }
  $proc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'painel[\\/]worker\.mjs' }
  if ($proc) { Escrever "worker RODANDO (pid $($proc.ProcessId -join ', '))" } else { Escrever "worker parado" }
  if (Test-Path $Log) {
    Escrever "`n--- ultimas linhas do log ($Log) ---"
    Get-Content $Log -Tail 12
  }
  return
}

if ($Parar) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'painel[\\/]worker\.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Escrever "worker parado (pid $($_.ProcessId))" }
  return
}

if ($Remover) {
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Escrever "tarefa removida (o processo em execucao segue vivo ate o proximo logoff; use -Parar)"
  return
}

if ($Iniciar) {
  Start-ScheduledTask -TaskName $Tarefa
  Escrever "worker iniciado pela tarefa agendada"
  return
}

if ($Instalar) {
  if (-not $Node) { throw "node nao encontrado no PATH" }
  if (-not (Test-Path (Join-Path $Repo '.env.local'))) {
    throw "nao achei $Repo\.env.local — o worker precisa da service-role key"
  }

  # -WindowStyle Hidden no wrapper: sem isso uma janela de console fica aberta
  # o dia inteiro. O log vai para arquivo, que é como se acompanha.
  # UTF-8 explícito: sem isso o log grava "ÔÇö" no lugar de "—" e fica ilegível
  # justamente no que se lê quando algo dá errado.
  $comando = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
             "`$OutputEncoding=[Text.Encoding]::UTF8; " +
             "Set-Location '$Repo'; " +
             "node --env-file=.env.local scripts/painel/worker.mjs 2>&1 | " +
             "ForEach-Object { Add-Content -LiteralPath '$Log' -Value `$_ -Encoding utf8 }"
  $acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$comando`""

  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

  # Sem limite de duração (o padrão mata em 3 dias) e reinício se cair.
  $config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

  # Sessão interativa do próprio usuário: os CLIs usam as credenciais do perfil.
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho `
    -Settings $config -Principal $principal -Force `
    -Description 'Executa os paineis multi-modelo enfileirados em /admin/vertho/board. Os CLIs rodam por assinatura nesta maquina.' | Out-Null

  Escrever "tarefa '$Tarefa' instalada (inicia no logon)"
  Escrever "log: $Log"
  Escrever "`npara ligar agora sem deslogar:  .\scripts\painel\worker-servico.ps1 -Iniciar"
  return
}

Escrever @"
uso:
  -Instalar   registra a tarefa que sobe o worker no logon
  -Iniciar    liga agora, sem esperar o proximo logon
  -Status     diz se a tarefa existe, se o processo esta vivo e mostra o log
  -Parar      mata o worker em execucao
  -Remover    remove a tarefa agendada
"@
