# Checklist — Antes de Deploy

```
1. [ ] Branch correta (master)      → git branch
2. [ ] Build local passa            → npm run build
2b.[ ] Typecheck limpo              → npx tsc --noEmit
2c.[ ] Lint (opcional, não bloqueia)→ npx eslint .   (Next 16 removeu `next lint`; flat config em eslint.config.mjs)
3. [ ] Smoke test passa             → npm run smoke
4. [ ] Envs na Vercel               → Vercel Dashboard > Environment Variables
5. [ ] Migrations rodadas           → Supabase SQL Editor
6. [ ] Domínio OK                   → vertho.ai → Cloudflare → Vercel
7. [ ] Push                         → git push origin master (deploy automático)
8. [ ] Verificar deploy             → https://vertho.ai/login
```
