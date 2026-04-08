# Vertho — Backup + Push automático diário
# Configurado via Task Scheduler do Windows
# Roda silenciosamente — gera ZIP + push para GitHub

$ProjectDir = "C:\GAS\Vertho App\nextjs-app"
$BackupDir = "C:\Backups\Vertho"
$LogFile = "$BackupDir\backup-log.txt"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"

# Criar pasta de backup
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# Log
Add-Content $LogFile "[$Timestamp] Iniciando backup automatico..."

# 1. ZIP
$TempDir = Join-Path $env:TEMP "vertho_auto_$Timestamp"
$ZipPath = Join-Path $BackupDir "vertho_$Timestamp.zip"
$Excludes = @("node_modules", ".next", ".git", "test-results", "playwright-report")
robocopy $ProjectDir $TempDir /E /XD $Excludes /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -Force
Remove-Item $TempDir -Recurse -Force
$Size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Add-Content $LogFile "[$Timestamp] ZIP criado: $ZipPath ($Size MB)"

# 2. Git push (se houver mudanças)
Set-Location $ProjectDir
$status = git status --porcelain
if ($status) {
    git add -A
    git commit -m "auto: backup diario $Timestamp"
    git push origin master 2>&1 | Out-Null
    Add-Content $LogFile "[$Timestamp] Git push concluido"
} else {
    Add-Content $LogFile "[$Timestamp] Sem mudancas para push"
}

# 3. Limpar backups antigos (manter últimos 7)
$backups = Get-ChildItem "$BackupDir\vertho_*.zip" | Sort-Object LastWriteTime -Descending
if ($backups.Count -gt 7) {
    $backups | Select-Object -Skip 7 | Remove-Item -Force
    Add-Content $LogFile "[$Timestamp] Backups antigos removidos (manteve 7)"
}

Add-Content $LogFile "[$Timestamp] Backup concluido com sucesso"
