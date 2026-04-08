# Checklist — Antes de Deploy

```
1. [ ] Branch correta (master)      → git branch
2. [ ] Build local passa            → npm run build
3. [ ] Smoke test passa             → npm run smoke
4. [ ] Envs na Vercel               → Vercel Dashboard > Environment Variables
5. [ ] Migrations rodadas           → Supabase SQL Editor
6. [ ] Domínio OK                   → vertho.com.br → Cloudflare → Vercel
7. [ ] Push                         → git push origin master (deploy automático)
8. [ ] Verificar deploy             → https://vertho.com.br/login
```
