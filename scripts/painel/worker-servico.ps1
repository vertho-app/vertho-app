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
  [switch]$Iniciar,
  [switch]$Forcar
)

$ErrorActionPreference = 'Stop'

$Tarefa  = 'Vertho - Board worker'
$Repo    = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Log     = Join-Path $env:LOCALAPPDATA 'vertho-board-worker.log'
$Node    = (Get-Command node -ErrorAction SilentlyContinue).Source

function Escrever($msg) { Write-Host $msg }

<#
Lê o log SEM disputar o arquivo com o worker.

`Get-Content` abre em modo exclusivo e falha com "being used by another process"
exatamente enquanto o worker escreve — ou seja, o diagnóstico quebrava no único
momento em que ele importa. Abrir com FileShare ReadWrite resolve.
#>
function LerLog([string]$caminho, [int]$ultimas = 12) {
  if (-not (Test-Path $caminho)) { return @() }
  try {
    $fs = [System.IO.File]::Open($caminho, 'Open', 'Read', 'ReadWrite')
    $sr = New-Object System.IO.StreamReader($fs)
    $texto = $sr.ReadToEnd()
    $sr.Close(); $fs.Close()
    $linhas = $texto -split "`r?`n" | Where-Object { $_ -ne '' }
    return $linhas | Select-Object -Last $ultimas
  } catch {
    return @("(nao consegui ler o log: $($_.Exception.Message))")
  }
}

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
    LerLog $Log 12 | ForEach-Object { Escrever $_ }
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

  # Reinstalar substitui a definição da tarefa e pode encerrar a instância em
  # execução — junto com o painel que ela estiver rodando (são ~16 min de
  # trabalho e cota de quatro assinaturas). Se há painel em andamento, pare aqui.
  $emAndamento = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'painel[\\/]worker\.mjs' }
  if ($emAndamento -and -not $Forcar) {
    $ultima = (LerLog $Log 1) -join ''
    Escrever "worker em execucao (pid $($emAndamento.ProcessId -join ', ')) — pode estar no meio de um painel."
    Escrever "ultima linha do log: $ultima"
    Escrever "`nrode de novo com -Forcar para instalar mesmo assim, ou espere o painel terminar."
    return
  }
  if (-not (Test-Path (Join-Path $Repo '.env.local'))) {
    throw "nao achei $Repo\.env.local — o worker precisa da service-role key"
  }

  # O que a tarefa roda vive em worker-tarefa.ps1, NÃO numa string aqui.
  #
  # Isto já foi um `-Command "..."` montado por concatenação, e a linha de comando
  # do powershell.exe COMIA as aspas duplas internas: o filtro chegava como
  # `-Filter Name='node.exe'`, o WQL era inválido e a trava de instância única
  # nunca travou nada (4 workers em 70 min, medido no log de 28/07). Com `-File`
  # não há camada de quoting entre o arquivo e o que executa.
  #
  # -WindowStyle Hidden: sem isso uma janela de console fica aberta o dia inteiro.
  # O log vai para arquivo, que é como se acompanha.
  $tarefaPs1 = Join-Path $PSScriptRoot 'worker-tarefa.ps1'
  if (-not (Test-Path $tarefaPs1)) { throw "nao achei $tarefaPs1" }
  $acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tarefaPs1`""

  # DOIS gatilhos. Só o de logon não bastava: em 28/07 o worker subiu, rodou um
  # painel inteiro e morreu horas depois (código 0xC000013A — provavelmente a
  # máquina suspendendo). Ninguém o trazia de volta, e o pedido seguinte ficou
  # parado na fila esperando alguém perceber.
  #
  # O segundo gatilho re-tenta a cada 5 min, para sempre; a trava de instância
  # única no comando faz cada disparo ser inofensivo quando já há worker vivo.
  $gatilhos = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
    # 3650 dias em vez de TimeSpan::MaxValue: o agendador REJEITA a duração
    # gerada por MaxValue ("P99999999DT23H59M59S ... fora do intervalo") e o
    # Register falha — sem abortar o script, então a tarefa fica com a definição
    # antiga e tudo PARECE instalado.
    (New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
      -RepetitionInterval (New-TimeSpan -Minutes 5) `
      -RepetitionDuration (New-TimeSpan -Days 3650))
  )

  # Sem limite de duração (o padrão mata em 3 dias) e reinício se cair.
  $config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

  # Sessão interativa do próprio usuário: os CLIs usam as credenciais do perfil.
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilhos `
    -Settings $config -Principal $principal -Force `
    -Description 'Executa os paineis multi-modelo enfileirados em /admin/vertho/board. Os CLIs rodam por assinatura nesta maquina.' | Out-Null

  Escrever "tarefa '$Tarefa' instalada (logon + verificacao a cada 5 min)"
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
