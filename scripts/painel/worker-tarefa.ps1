<#
.SYNOPSIS
  O que a tarefa agendada executa. Sobe o worker do /board se ele nao estiver vivo.

.DESCRIPTION
  Existe como ARQUIVO de proposito. Antes isto era uma string montada em
  `worker-servico.ps1 -Instalar` e passada em `powershell.exe -Command "..."`.
  A linha de comando COME as aspas duplas internas: o filtro WQL chegava no
  processo como `-Filter Name='node.exe'` (sem aspas), o Get-CimInstance falhava
  com "Consulta invalida" (0x80041017) e, como o erro nao e terminante, a
  variavel ficava nula.

  Ou seja: a TRAVA DE INSTANCIA UNICA nunca travou nada. Medido no log de 28/07,
  quatro workers subiram em 70 minutos (22:30, 23:15, 23:20, 23:40), cada um
  disputando a mesma fila, e a janela do console piscava a cada 5 min.

  Com o comando num arquivo nao ha nenhuma camada de quoting entre o que se le
  aqui e o que roda. A acao registrada e apenas `-File <este arquivo>`.

  Nao recebe parametros de proposito: repo e log sao derivados daqui mesmo, para
  que nao sobre nenhuma string interpolada na definicao da tarefa.

  ESTE ARQUIVO E ASCII PURO, e nao por descuido. O powershell.exe (5.1), que e
  quem a tarefa invoca, le .ps1 sem BOM como ANSI: um travessao num COMENTARIO
  vira dois bytes, a aspa de fechamento se perde e o script inteiro morre em
  ParserError antes da primeira linha. Salvar com BOM resolveria hoje e voltaria
  a quebrar no primeiro editor que gravasse sem ele. ASCII nao depende de nada.
#>

# UTF-8 explicito na SAIDA: sem isso o log grava mojibake no lugar dos acentos e
# fica ilegivel justamente no que se le quando algo deu errado.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

$Repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Log  = Join-Path $env:LOCALAPPDATA 'vertho-board-worker.log'

# TRAVA de instancia unica. A tarefa dispara a cada 5 min para ressuscitar o
# worker se ele morrer (28/07: morreu de madrugada e a fila ficou parada). Sem
# esta checagem isso viraria um worker novo a cada 5 min.
$vivo = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'painel[\\/]worker\.mjs' }
if ($vivo) { exit 0 }

if (-not (Test-Path (Join-Path $Repo '.env.local'))) {
  Add-Content -LiteralPath $Log -Encoding utf8 `
    -Value "$(Get-Date -Format 'HH:mm:ss') tarefa abortou: nao achei $Repo\.env.local"
  exit 1
}

Set-Location $Repo
node --env-file=.env.local scripts/painel/worker.mjs 2>&1 |
  ForEach-Object { Add-Content -LiteralPath $Log -Value $_ -Encoding utf8 }

# O worker so chega aqui quando morre. Registrar a saida: em 28/07 ele caiu com
# 0xC000013A e o log terminava no meio de uma frase, sem dizer que tinha acabado
# - dava pra confundir com worker vivo e travado.
Add-Content -LiteralPath $Log -Encoding utf8 `
  -Value "$(Get-Date -Format 'HH:mm:ss') worker encerrado (exit $LASTEXITCODE); a tarefa o religa em ate 5 min"
