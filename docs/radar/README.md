# Radar Vertho — README operacional

Plataforma pública (`radar.vertho.ai`) que organiza indicadores oficiais
do INEP por escola e município, com leitura contextualizada e CTA de
captação de leads via PDF.

Spec: `Vertho_Radar_Spec_v2_2.docx` · Decisões: `decisions.md`.

---

## Como subir os dados de um piloto novo

Tudo é feito via `/admin/radar` (rota protegida pelo admin do dashboard). Você precisa:

1. **XLSX de Saeb** gerado pelo `saeb_pipeline` Python (extração de boletins INEP)
2. **CSV de ICA** dos microdados públicos do INEP (Indicador Criança Alfabetizada)

### Passo a passo

1. Rode o `saeb_pipeline` localmente em `C:\Users\rdnav\Downloads\saeb_pipeline`:
   ```
   # No Escolas.txt liste os códigos INEP (8 dígitos) das escolas alvo
   # Depois:
   python pipeline.py
   ```
   Isso gera um XLSX (ex: `saeb_ibipeba_<data>.xlsx`) com 3 abas: `escolas`,
   `distribuicoes`, `falhas`.

2. Acesse `https://app.vertho.ai/admin/radar` (precisa estar logado como admin).

3. Mantenha **"Restringir piloto à microrregião de Irecê"** ligado no V1.

4. Clique **"Selecionar XLSX Saeb"** → escolha o arquivo gerado.
   O parser:
   - Faz upsert em `diag_escolas` por `codigo_inep`
   - Cria snapshots em `diag_saeb_snapshots` por (INEP, ano, etapa, disciplina)
   - Linhas fora de Irecê são **skipped** (com a flag ligada)
   - Cada upload gera uma linha em `diag_ingest_runs` com sucessos/falhas/skips

5. Para ICA, baixe o CSV dos microdados públicos do INEP, depois clique
   **"Selecionar CSV ICA"**. Aceita variações de nome de coluna comum
   (`CO_MUNICIPIO`, `TX_ALFABETIZACAO`, etc.).

6. Confira a aba "Runs recentes" — deve mostrar status `sucesso` ou `parcial`.

7. Acesse `https://radar.vertho.ai` — a busca já encontra escolas/municípios.

---

## Como o lead → PDF funciona

```
Visitante clica "Receba diagnóstico Vertho em PDF"
   ↓
Modal LGPD coleta: nome, email, cargo, organização
   ↓
capturarLead() insere em diag_leads (status: pendente)
   ↓
QStash publish → /api/radar/lead-pdf (assíncrono)
   ↓
Worker:
  1. Lê lead
  2. Monta payload (escola/município + IA proposta com cache)
  3. Renderiza PDF via @react-pdf/renderer (RadarPropostaPDF, 7 páginas)
  4. Upload pro bucket diag-relatorios em {scope_type}/{scope_id}/{leadId}.pdf
  5. Cria signed URL (30 dias)
  6. Atualiza lead (status: pronto)
  7. Envia email Resend com PDF anexado + botão de download
```

Custo IA por lead: ~$0.06 (cache hit ~80% em municípios populares cai
pra ~$0.012).

---

## Tabelas (migration 054)

| Tabela | O que guarda |
|---|---|
| `diag_escolas` | Cadastro de escolas (INEP, nome, município, INSE, etapas) |
| `diag_saeb_snapshots` | Saeb por (INEP, ano, etapa, disciplina) com distribuição cumulativa + comparativos similares/UF/BR |
| `diag_ica_snapshots` | ICA por (município, rede, ano) com benchmarks UF/BR |
| `diag_censo_infra` | Censo Escolar — 213 indicadores IN_* + 32 QT_* + 4 scores agregados (infra básica, pedagógica, acessibilidade, conectividade) |
| `diag_analises_ia` | Cache de narrativas IA por (scope, prompt_version, dados_hash) |
| `diag_leads` | Captação com consentimento LGPD + status do PDF + dados de origem |
| `diag_ingest_runs` | Observabilidade de cada upload (sucesso/falha/skipped + erros) |

Bucket: `diag-relatorios` (público, MIME pdf-only, 10MB max).

---

## Rotas

### Públicas (radar.vertho.ai)

- `/` — home com busca + stats
- `/escola/[inep]` — dados Saeb da escola, leitura IA, CTA lead
- `/municipio/[ibge]` — ICA municipal, lista de escolas, CTA lead
- `/metodologia` — fontes, regras de comparação, escala de níveis
- `/sitemap.xml`, `/robots.txt` — SEO

### Admin (app.vertho.ai)

- `/admin/radar` — UI de ingestão (upload XLSX Saeb, CSV ICA, runs recentes)

### API

- `/api/radar/lead-pdf` — webhook QStash que gera + envia PDF

---

## Customização do prompt de IA

Os prompts vivem em:
- `lib/radar/ia-narrativa.ts` (narrativa pública das páginas)
- `lib/radar/proposta-pdf-data.ts` (proposta do PDF)

Cada um tem um `PROMPT_VERSION_*` que faz parte da chave de cache. Pra
forçar regeneração de TODAS as análises após mudar o prompt:

1. Bump a versão (ex: `radar-narrativa-v1` → `radar-narrativa-v2`)
2. Deploy
3. Próximas visitas regeram com o prompt novo, salvam em cache nova chave

A versão antiga fica em `diag_analises_ia` como histórico (não é apagada).

---

## Importar Censo Escolar (infraestrutura)

O CSV completo do Censo Escolar tem ~165MB e não cabe em server action.
Use o helper local pra filtrar pela microrregião antes:

```bash
cd nextjs-app
node scripts/filter-censo-irece.mjs "C:/Users/.../microdados_censo_escolar_2025/dados/Tabela_Escola_2025.csv"
# gera Tabela_Escola_2025_irece.csv (~5MB) ao lado do input
```

Depois, em `/admin/radar` → "Selecionar CSV Censo" → escolhe o filtrado.

O parser:
- Insere em `diag_censo_infra` (1 linha por escola+ano)
- Calcula 4 scores 0–100 agregados via `lib/radar/censo-scores.ts`
- Salva 213 indicadores `IN_*` + 32 quantidades `QT_*` em JSONB pra consultas ad-hoc
- Preenche lat/long, zona, situação de funcionamento

A página da escola passa a exibir cards de infra logo após o hero.

## Adicionar mais municípios

Para expandir além de Irecê:

1. Edite `lib/radar/microrregiao-irece.ts` para incluir nova microrregião,
   ou crie `lib/radar/microrregiao-<x>.ts` com a mesma estrutura
2. Atualize a flag/UI em `/admin/radar` (label e regra `restringirIrece`)
3. Atualize `IRECE_IBGE` em `scripts/filter-censo-irece.mjs` (ou clone o script)
4. Rode o saeb_pipeline com a nova `Escolas.txt`
5. Suba os XLSX/CSVs

Para abrir cobertura nacional (V2): desligar a flag de restrição faz com
que o importador aceite qualquer município.

---

## Observabilidade

- **Runs**: `SELECT * FROM diag_ingest_runs ORDER BY iniciado_em DESC LIMIT 20`
- **Leads pendentes**: `SELECT * FROM diag_leads WHERE pdf_status IN ('pendente','processando','erro')`
- **Custo IA**: `SELECT modelo, COUNT(*), SUM(custo_usd) FROM diag_analises_ia GROUP BY modelo`
- **Logs do worker**: Vercel → Functions → `/api/radar/lead-pdf` → Logs

Sentry captura erros automaticamente (provider já configurado no projeto).

---

## Features da V1 (estado atual)

- ✅ Páginas de escola, município e UF (`/escola/[inep]`, `/municipio/[ibge]`,
  `/estado/[uf]`)
- ✅ Comparativo lado a lado de até 4 escolas (`/comparar?escolas=A,B`)
- ✅ Censo Escolar — 4 scores agregados + 213 IN_* + 32 QT_* em JSONB
- ✅ Saeb por escola + ICA municipal
- ✅ IA narrativa em escola e município (com cache + bot-aware)
- ✅ Lead → PDF assíncrono via QStash + Resend (com validação, rate limit,
  dedup 24h)
- ✅ "Citar este Radar" (ABNT/APA/BibTeX)
- ✅ Sitemap dinâmico, robots.txt, schema.org
- ✅ Cobertura: microrregião de Irecê/BA (19 municípios)

## Adiamentos conhecidos

- Auto-fetch INEP (scraper integrado) — V1.5+
- Funil dashboard interno — V1.5
- Materialized views pra rankings UF — V1.5
- Sitemap index pra >50k URLs — quando aplicável
- pg_trgm na busca — quando volume justificar
- Follow-up D+1/D+7 do lead — após validar conversão

V1 é deliberadamente enxuto pra **provar conversão** (3+ leads/mês virando
conversa comercial) antes de escalar.

## Migrations a aplicar (em ordem)

```
054-diag-schema.sql                    # tabelas + bucket público
055-diag-municipio-ibge-nullable.sql   # FK opcional pra escolas sem IBGE
056-diag-censo-infra.sql               # tabela do Censo
057-diag-censo-latlong-double.sql      # lat/long como DOUBLE PRECISION
058-diag-relatorios-private.sql        # bucket privado + drop policy
```

## Segurança operacional

- **Worker `/api/radar/lead-pdf`**: fail-closed em produção se signing keys
  QStash ausentes (segue tolerante em dev/preview)
- **Bucket `diag-relatorios`**: privado, acesso via signed URL 30d
- **IA bot-aware**: User-Agent de crawler nunca dispara IA — só lê cache
- **`capturarLead`**: valida escopo, rate limit 10/h por IP, dedup
  idempotente por (email × scope) em 24h
