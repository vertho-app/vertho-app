# Rotina Antifalha — Vertho

## 5 regras de ouro

1. **GitHub é a fonte de verdade.** Se não está lá, não existe.
2. **Commit antes de mudar.** Sempre faça checkpoint antes de pedir mudanças grandes.
3. **Branch para mudanças grandes.** Não trabalhe direto na master se a mudança for estrutural.
4. **ZIP antes de aventuras.** Um snapshot local leva 5 segundos e pode salvar horas.
5. **Push todo dia.** Código local é código em risco.

---

## Rotina diária
```
git status
git add -A
git commit -m "progresso do dia"
git push
```

## Antes de prompt grande ao Claude
```
git add -A && git commit -m "checkpoint antes de X"
git push
# Opcional: .\scripts\backup-project.ps1
```

## Antes de deploy
```
npm run build
npm run smoke
git push origin master
# Verificar: https://vertho.com.br/login
```

## Snapshot local (emergência)
```powershell
.\scripts\backup-project.ps1
# Gera: C:\Backups\Vertho\vertho_2026-04-08_1430.zip
```

## Branches
- `master` — estável, deploy automático
- `feature/nome` — mudanças grandes, merge quando pronto
- `hotfix/nome` — correções urgentes

## Convenção de commits
```
feat: nova funcionalidade
fix: correção de bug
refactor: refatoração sem mudar comportamento
docs: documentação
test: testes
chore: manutenção/config
```
