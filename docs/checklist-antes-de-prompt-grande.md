# Checklist — Antes de Prompt Grande

Rode antes de pedir mudanças estruturais ao Claude.

```
1. [ ] git status              → tudo commitado?
2. [ ] git push                → código no GitHub?
3. [ ] criar branch se grande  → git checkout -b nome-da-mudanca
4. [ ] commit de checkpoint    → git add -A && git commit -m "checkpoint antes de X"
5. [ ] push da branch          → git push -u origin nome-da-mudanca
6. [ ] snapshot ZIP (opcional) → PowerShell: .\scripts\backup-project.ps1
```

## Regra de ouro
**GitHub é a fonte de verdade.** Se não está no GitHub, não existe.
