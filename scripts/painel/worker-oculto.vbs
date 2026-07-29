' Lançador do worker do /board SEM janela nenhuma.
'
' Por que existe: no Windows 11 o host de console padrão é o Windows Terminal, e
' `powershell.exe -WindowStyle Hidden` NÃO o esconde — esse parâmetro age sobre o
' console clássico (conhost). Resultado medido em 29/07: a tarefa agendada abria
' uma janela do Windows Terminal que FICAVA aberta e VAZIA (toda a saída do worker
' vai para o arquivo de log, então nada é impresso nela). O Rodrigo fechava a
' janela, isso matava o worker, e 5 minutos depois a tarefa subia outro — o ciclo
' que parecia "terminal abrindo sozinho".
'
' `WshShell.Run(cmd, 0, True)` passa SW_HIDE no CreateProcess: a janela nunca
' chega a existir, independentemente de qual host o Windows use.
'
' O `True` (esperar) é deliberado: mantém o wscript vivo enquanto o worker roda,
' então a instância da TAREFA continua em execução e o `MultipleInstances:
' IgnoreNew` do agendador barra os disparos de 5 em 5 minutos. É a segunda linha
' de defesa — a primeira é a trava de instância única dentro do .ps1.

Option Explicit

Dim shell, fso, pasta, ps1, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(pasta, "worker-tarefa.ps1")

If Not fso.FileExists(ps1) Then
  ' Sem console para reclamar: registra no log de eventos e sai com código != 0.
  shell.LogEvent 1, "Vertho board worker: nao achei " & ps1
  WScript.Quit 2
End If

' Aspas no caminho: "C:\GAS\Vertho App\..." tem espaço.
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """"

WScript.Quit shell.Run(cmd, 0, True)
