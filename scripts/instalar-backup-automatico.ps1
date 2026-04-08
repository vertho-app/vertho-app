# Vertho — Instala backup automático diário no Task Scheduler
# Rode UMA VEZ como administrador: .\scripts\instalar-backup-automatico.ps1

$TaskName = "Vertho-Backup-Diario"
$ScriptPath = "C:\GAS\Vertho App\nextjs-app\scripts\auto-backup-diario.ps1"

# Remover tarefa anterior se existir
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Criar ação
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger: todo dia às 20h
$Trigger = New-ScheduledTaskTrigger -Daily -At "20:00"

# Configurações
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Registrar
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Backup diario do projeto Vertho (ZIP + git push)" -RunLevel Highest

Write-Host "`n✅ Tarefa '$TaskName' instalada no Task Scheduler!" -ForegroundColor Green
Write-Host "   Horário: todo dia às 20:00" -ForegroundColor Cyan
Write-Host "   Ação: ZIP para C:\Backups\Vertho\ + git push" -ForegroundColor Cyan
Write-Host "   Log: C:\Backups\Vertho\backup-log.txt" -ForegroundColor Cyan
Write-Host "`n   Para desinstalar: Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
Write-Host ""
