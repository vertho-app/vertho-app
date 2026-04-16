# Backup & Restore Runbook

## Objetivos (SLA interno)

- **RPO (Recovery Point Objective)**: perda máxima aceitável de dados = **1 hora** em produção
- **RTO (Recovery Time Objective)**: tempo máximo pra retomar operação = **4 horas**
- **Restore validado**: teste **trimestral** obrigatório

Sem atingir esses alvos, não liberamos cliente enterprise.

## Backups em camadas

### 1. Supabase automático (base)

**Plano Free**: backup diário, retenção 7 dias.
**Plano Pro** (recomendado a partir de 50 colabs em produção): point-in-time recovery, retenção 30 dias, granularidade de 2 minutos.

Visualizar: [Supabase Dashboard → Database → Backups](https://supabase.com/dashboard/project/xwuqrgrvakxtphbmudwj/database/backups)

### 2. Dump lógico semanal (extra)

Script `scripts/backup-weekly.sh` (TODO criar) roda toda segunda 03:00 BRT via cron:

```bash
#!/usr/bin/env bash
TS=$(date +%Y%m%d-%H%M)
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner --no-acl \
  --file="backups/vertho-$TS.dump"
# Envia pro S3 ou Supabase Storage bucket privado 'backups'
aws s3 cp "backups/vertho-$TS.dump" "s3://vertho-backups/"
# Retém 12 semanas
aws s3 ls s3://vertho-backups/ | sort | head -n -12 | awk '{print $4}' | xargs -I {} aws s3 rm s3://vertho-backups/{}
```

### 3. Storage (vídeos/áudios/PDFs)

- Bucket **`conteudos`**: micro-conteúdos curados. Recriáveis via re-import do Bunny Stream.
- Bucket **`logos`**: logos de empresas. Backup trimestral manual.
- Bucket **`backups`** (planejado): dumps semanais do item 2.
- **Bunny Stream**: hospeda vídeos; não é parte do nosso backup (é source of truth).

## Procedimento de restore — completo

### Quando usar
- Corrupção de schema (migration com erro grave)
- Perda de dados por action com bug
- Ataque (ransomware, sabotagem)
- Acidente de operação (DROP manual em produção)

### Passos

**1. Avaliar escopo** (15 min)

- Quando o incidente começou? Ponto exato no tempo.
- Quais tabelas foram afetadas? Só uma ou tudo?
- Dados sem backup recente? (ex: registros criados na última hora entre backup e incidente)

**2. Decidir estratégia** (10 min)

| Cenário | Estratégia |
|---|---|
| Corrupção em 1 tabela, <24h | Point-in-time restore seletivo |
| Corrupção ampla, <7d | Restaurar backup Supabase completo |
| Desastre total, plano Pro | Ponto antes do incidente + reaplicar migrations |
| Bug em migration | Rollback manual + re-aplicar versão corrigida |

**3. Comunicar stakeholders** (20 min)

- Abrir manutenção no UI: colocar página em modo readonly via `NEXT_PUBLIC_MAINTENANCE_MODE=true` no Vercel env.
- Avisar clientes ativos via email + WhatsApp se downtime > 30 min.
- Abrir canal #incident no Slack interno (se existir).

**4. Restaurar**

**Point-in-time** (Supabase Pro):
```
Dashboard → Database → Backups → "Restore from point in time"
Escolher timestamp 10 min antes do incidente
Confirmar (cria novo DB; atualizar connection string no Vercel)
```

**Dump completo**:
```bash
# Baixa último dump válido
aws s3 cp s3://vertho-backups/vertho-20260410-030000.dump ./
# Restaura em DB novo (staging primeiro!)
pg_restore --clean --if-exists -d "$NOVO_DB_URL" vertho-20260410-030000.dump
```

**5. Validar** (30 min)

Rodar smoke test:
```bash
cd nextjs-app
npm run smoke
```

Checklist manual:
- [ ] Login de colab teste funciona
- [ ] `/dashboard/temporada` carrega
- [ ] `/admin/dashboard` lista empresas
- [ ] Dados de colab teste presentes
- [ ] Sem erros no Sentry nos últimos 5 min

**6. Reapontar produção** (10 min)

Se criou novo DB: atualizar `NEXT_PUBLIC_SUPABASE_URL` e keys no Vercel. Re-deploy.

**7. Tirar manutenção** (5 min)

`NEXT_PUBLIC_MAINTENANCE_MODE=false` + redeploy.

**8. Postmortem** (1 semana depois)

Documento obrigatório em `docs/incidents/YYYY-MM-DD-titulo.md`:
- Timeline
- Causa-raiz
- Impacto (colabs afetados, downtime)
- Por que não detectamos antes
- Ações pra prevenir

## Procedimento de restore — ponto específico

### Cenário: uma trilha foi corrompida

Não precisa restore completo. Extrair só ela do backup:

```bash
# 1. Baixar dump recente
aws s3 cp s3://vertho-backups/vertho-latest.dump ./

# 2. Restaurar em DB temporário local (Docker)
docker run -d --name tmprestore -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:15
pg_restore -d "postgresql://postgres:x@localhost:5433/postgres" vertho-latest.dump

# 3. Extrair dados da trilha específica
psql postgresql://postgres:x@localhost:5433/postgres <<EOF
COPY (SELECT * FROM trilhas WHERE id = 'UUID') TO STDOUT WITH CSV HEADER;
EOF > trilha-recuperada.csv

# 4. Inserir no produção via script cuidadoso (revisar antes)
```

## Teste trimestral (obrigatório)

- [ ] Restaurar último dump em DB de staging
- [ ] Validar com smoke test
- [ ] Documentar tempo total + issues em `docs/restore-tests/YYYY-QN.md`

Se o teste falha: **incident** — corrigir antes de marcar como concluído.

## Script de manutenção (TODO)

`scripts/manutencao.sh`:
```bash
#!/usr/bin/env bash
# Ativa/desativa modo manutenção via Vercel CLI
vercel env add NEXT_PUBLIC_MAINTENANCE_MODE production <<<"true"
vercel --prod deploy
```

## Contatos de emergência

- **Supabase Support** (Pro/Team plan): <support@supabase.com> — resposta <2h
- **Vercel Support**: via dashboard — Pro plan resposta <24h
- **DPO Vertho**: `dpo@vertho.ai` — obrigatório notificar em vazamento

## TODO curto prazo

- [ ] Subir plano Supabase pra Pro antes de go-live com 50+ colabs
- [ ] Criar script `scripts/backup-weekly.sh` + cron Vercel
- [ ] Criar bucket `backups` privado no Supabase Storage
- [ ] Testar restore em ambiente staging (quando criar staging)
- [ ] Script `scripts/manutencao.sh`
- [ ] Página HTML estática `/maintenance.html` bonita
