# Vertho — Checkpoint rápido antes de mudanças grandes
# Uso: .\scripts\checkpoint.ps1 "mensagem do checkpoint"

param(
    [string]$Mensagem = "checkpoint antes de mudanca"
)

Write-Host "`n=== Vertho Checkpoint ===" -ForegroundColor Cyan

# 1. Status
Write-Host "`n--- Git Status ---" -ForegroundColor Yellow
git status --short

# 2. Add all
Write-Host "`n--- Adicionando arquivos ---" -ForegroundColor Yellow
git add -A

# 3. Commit
$CommitMsg = "checkpoint: $Mensagem"
Write-Host "Commit: $CommitMsg" -ForegroundColor Yellow
git commit -m $CommitMsg

# 4. Push
Write-Host "`n--- Push para GitHub ---" -ForegroundColor Yellow
git push

Write-Host "`n✅ Checkpoint concluído!" -ForegroundColor Green
Write-Host "GitHub atualizado. Código seguro.`n"
