# Checklists operacionais

> Documento único dos checklists do projeto. Consolidado em 27/07/2026 a partir de
> `checklist-antes-de-deploy.md`, `checklist-antes-de-prompt-grande.md`, `rotina-antifalha.md`,
> `GO-LIVE-CHECKLIST.md` e `CHECKLIST-VALIDACAO.md` (453 linhas somadas, com sobreposição grande e
> **dois conselhos que hoje estão errados** — ver "Corrigido nesta consolidação" no fim).
>
> O checklist de **validação funcional passo a passo** (validar cada etapa do pipeline num tenant
> novo) não foi duplicado aqui: ele espelha o `PASSO-A-PASSO-VERTHO.md`, que é a fonte. O que vale
> como checklist está na seção 4.

---

## 1. Antes de deploy

```
1. [ ] Branch correta (master)        → git branch
2. [ ] Build local passa              → npm run build > log 2>&1     ⚠️ NUNCA `| tail`
3. [ ] Typecheck limpo                → npx tsc --noEmit
4. [ ] Testes                         → npm run test:unit             (roda no CI de qualquer forma)
5. [ ] git add SELETIVO dos arquivos que EU editei                    ⚠️ NUNCA `git add -A` / `.`
6. [ ] Push                           → git push origin master        (JÁ deploya; nunca `vercel --prod`)
7. [ ] Task Trigger.dev mudou?        → `npx trigger.dev deploy` MANUAL (não sai no push)
8. [ ] Migration nova?                → node --env-file=.env.local scripts/apply-migration.mjs …
9. [ ] Verificar deploy               → abrir a rota afetada em produção
```

⚠️ `npm run lint` **está quebrado** desde o Next 16 (o comando `next lint` foi removido). A
verificação estática é `tsc --noEmit`.
⚠️ `npm run build | tail` deixa um `next build` órfão segurando o lock ("Another next build process
is already running", `.next` sem `BUILD_ID`). Redirecionar para arquivo.

## 2. Antes de uma mudança grande

```
1. [ ] git status                → o que está pendente é meu ou do dono do repo?
2. [ ] commit/push do que já está pronto
3. [ ] branch se a mudança for estrutural  → git checkout -b nome-da-mudanca
4. [ ] ler o doc canônico da área ANTES de mexer:
       motor da trilha  → docs/PIPELINE-TRILHA.md + docs/FMEA-PIPELINE.md
       kit/conteúdo     → docs/KIT-SEMANAL.md + `docs/FMEA-PIPELINE.md` §7
       multi-tenant     → CLAUDE.md + ARQUITETURA.md §11.0
       prompts de IA    → docs/CATALOGO-PROMPTS-IA.md
```

**Regra de ouro:** o repositório remoto é a fonte de verdade. Código local é código em risco.

## 3. Go-live de um tenant novo

**Infraestrutura**
- [ ] Envs na Vercel (ver `docs/envs-importantes.md` — a lista canônica vive lá, não aqui)
- [ ] Migrations aplicadas em ordem
- [ ] Buckets de Storage: `avatars`, `relatorios-pdf`, `conteudos`, `backups`, `sales-materials`
- [ ] Subdomínio `{slug}.vertho.ai` **registrado no Vercel** (botão em Branding — o auto-registro foi removido)
- [ ] SMTP do Supabase configurado

**Fluxos críticos** (roteiro mínimo antes de liberar acesso)
- [ ] Login (magic link, senha e OTP WhatsApp se o tenant usar)
- [ ] Redirect para `/login` quando não autenticado — e **sem laço** `/rota` ↔ `/login`
- [ ] Dashboard do colaborador carrega; DISC abre; PDI gera PDF
- [ ] Temporada carrega a timeline e a semana 1 abre no dia certo
- [ ] Chat socrático, Tira-Dúvidas e missão respondem
- [ ] Admin: pipeline Fase 1→5, relatórios e PDFs
- [ ] Envio real (WhatsApp/e-mail) — **conferir antes que o tenant não é `is_demo`**

**Acesso da turma importada** (medido em Macaé 06/08 — importar pessoa NÃO dá acesso a ninguém)
- [ ] `auth.users` existe para cada e-mail — `select count(*) from colaboradores c left join auth.users u on lower(u.email)=lower(c.email) where c.empresa_id=… and u.id is null` tem que dar **0**. O import criou 156 colaboradores e **0 contas**; `/api/auth/magic-link` chama `generateLink` **sem** `createUser` e devolve "Falha ao gerar link".
- [ ] `login_por_whatsapp = true` para quem tem telefone — as 3 rotas de telefone filtram `.eq('login_por_whatsapp', true)` e são **anti-enumeração**: com `false` respondem sucesso e **não enviam nada** (falha silenciosa, ninguém reclama do erro certo).
- [ ] Vínculo de gestor preenche o PAR `gestor_email` (régua do servidor) **e** `gestor_nome` (coluna da tela) — e `role='gestor'` no gestor, senão ele não vê equipe.
- [ ] Duplicata de pessoa conferida por **e-mail E telefone** — cada chave sozinha deixa passar (mesma pessoa com domínio `macae.gov.br` e `macae.rj.gov.br` só apareceu no índice de telefone).
> Sinal de que isso importa: dos 126 diretores de Macaé, **os 89 com conta são exatamente os 89 que fizeram o mapeamento**. Conta ausente parece desengajamento.

**Produto (o que costuma faltar e só aparece com o cliente dentro)**
- [ ] Competências e descritores cadastrados com a régua N1-N4 completa
- [ ] Top 10 / Top 5 validados por cargo
- [ ] Cenário B do cargo existe (senão o fechamento quebra)
- [ ] Conteúdo com formato-core para os descritores selecionados
- [ ] Em degustação: rodar a **Prontidão do piloto** em `/admin/temporadas` — ela cobre os dois itens acima e devolve bloqueadores explícitos

## 4. Validação funcional do pipeline

Para validar um tenant etapa por etapa, siga o `PASSO-A-PASSO-VERTHO.md` marcando cada passo. Os
pontos onde a validação costuma pegar erro, em ordem de frequência:

| Etapa | O que conferir | Por que falha |
|---|---|---|
| Competências | régua N1-N4 preenchida em todos os descritores | avaliação final ancora na régua; descritor sem N3 gera nota errada |
| IA1 → Top 5 | match cargo↔colaborador (case/acento-insensível) | cargo grafado diferente = colaborador sem trilha |
| Assessment de descritores | notas lançadas | vazio → default 1.5 para todo mundo, e o gap fica falso |
| Geração de temporada | modo carimbado em `trilhas.programa_modo` | mudar o default depois **não** afeta trilha em andamento (por desenho) |
| Semana 1 | `data_inicio` definida | sem ela o gate de calendário não abre |
| Conteúdo entregue | ler o **consumidor**, não o campo gravado | desafio e conteúdo de kit entram no overlay, na leitura |
| Fechamento | Cenário B do cargo + acumulada `done` | é o bloqueador mais comum da degustação |

## Corrigido nesta consolidação

Dois conselhos dos documentos antigos **contradiziam regras vigentes** e foram removidos:

1. **`git add -A && git commit`** aparecia em dois deles como rotina diária. É proibido neste
   projeto: o dono edita o repositório em paralelo, e `-A` varre trabalho dele para dentro do meu
   commit. O `add` é sempre seletivo.
2. **`npx eslint .`** como passo de pré-deploy. O lint está quebrado desde o Next 16; manter o passo
   só produz ruído ou, pior, a impressão de que a verificação rodou.
