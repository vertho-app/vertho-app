# Vertho — Backup ZIP do projeto
# Uso: .\scripts\backup-project.ps1
# Gera: C:\Backups\Vertho\vertho_YYYY-MM-DD_HHMM.zip

$BackupDir = "C:\Backups\Vertho"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$ZipName = "vertho_$Timestamp.zip"
$ZipPath = Join-Path $BackupDir $ZipName

# Criar pasta de backup se não existir
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "`n=== Vertho Backup ===" -ForegroundColor Cyan
Write-Host "Projeto: $ProjectDir"
Write-Host "Destino: $ZipPath"

# Criar pasta temporária sem pastas pesadas
$TempDir = Join-Path $env:TEMP "vertho_backup_$Timestamp"
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }

Write-Host "Copiando arquivos..." -ForegroundColor Yellow

# Copiar excluindo pastas pesadas
$Excludes = @("node_modules", ".next", ".git", "test-results", "playwright-report")
robocopy $ProjectDir $TempDir /E /XD $Excludes /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

Write-Host "Compactando..." -ForegroundColor Yellow
Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -Force

# Limpar temp
Remove-Item $TempDir -Recurse -Force

$Size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "`n✅ Backup criado: $ZipPath ($Size MB)" -ForegroundColor Green
Write-Host ""
