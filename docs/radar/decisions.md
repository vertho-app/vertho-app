# Radar Vertho — Decisões de implementação

Documento vivo das decisões tomadas durante a construção do Radar (v1).
Contexto: spec `Vertho_Radar_Spec_v2_2.docx`, decisões alinhadas com Rodrigo em 2026-04-28.

---

## 0. Stack reaproveitada (sem mudança)

- **Domínio**: `radar.vertho.ai` (subdomínio público sem auth) + `*.vertho.ai` continua atendendo tenants
- **Middleware**: `radar` adicionado a `RESERVED_SUBDOMAINS` + rewrite pra `/radar/*`
- **Banco**: 6 tabelas `diag_*` no Supabase existente (migration `054_diag_schema.sql`)
- **Storage**: bucket `diag-relatorios` (público pra download de PDFs)
- **PDF**: `@react-pdf/renderer` reaproveita styles + `PdfCover` da Vertho (paleta navy/cyan brand)
- **IA**: `actions/ai-client.ts` (Claude Sonnet 4.6) com versionamento via `lib/versioning.ts`
- **Email**: Resend
- **Async**: QStash
- **Observabilidade**: Sentry

## 1. Escopo piloto (V1)

| Decisão | Valor | Motivo |
|---|---|---|
| Estado piloto | Bahia (BA) | Spec indica como default operacional |
| Microrregião | **Irecê** (IBGE 2902) — ~20 municípios incl. Ibipeba | Já temos pipeline Saeb funcional pra Ibipeba; Irecê é cluster geográfico natural |
| Cobertura V1 | Saeb por escola + Ideb (quando confiável) + ICA municipal | Spec |
| Censo Escolar | Adiado pra V2 | Volume (302 cols × 1M linhas) não justifica no piloto |

## 2. Fontes de dados V1

Spec lista 4 fontes oficiais. Decisão por fonte:

| Fonte | Como ingere | Frequência | V1? |
|---|---|---|---|
| **Saeb por escola** | XLSX gerado pelo `saeb_pipeline` Python (boletins INEP scraping) | Bienal (2019/21/23/25) | ✅ |
| **ICA — Indicador Criança Alfabetizada** | Microdados ZIP/CSV INEP | Anual | ✅ |
| **Ideb por escola** | XLSX INEP "Resultados Ideb" | Bienal | ⚠️ best-effort (calcular se Saeb+Taxa Rendimento disponíveis; senão omitir) |
| **Taxas de Rendimento** | XLSX INEP (Censo Escolar deriva) | Anual | ⚠️ só se necessário pra Ideb |

**ICA = Indicador Criança Alfabetizada** (não confundir com "Indicador de Complexidade Acadêmica" — pesquisa inicial confundiu).

## 3. Mecânica de ingestão

**Decisão:** ingestão via **admin upload UI** (não auto-fetch INEP).

- Admin loga em `/admin/radar` (rota nova, protegida)
- Upload do XLSX/CSV → server action processa em batch
- Cada upload gera linha em `diag_ingest_runs` (status, contagens, erros, fonte)
- Não roda como request crítico; usa server action síncrona com timeout estendido

**Por quê:** o `saeb_pipeline` Python local já funciona, evita reescrever scraping em TS, mantém o controle de qualidade humano (admin valida amostra antes de subir).

V1.5+: portar pra Vercel Cron + auto-fetch.

## 4. Geração de IA (custo controlado)

**Decisão:** IA **sob demanda** + **cache agressivo**.

- Cache key: `(scope_type, scope_id, prompt_version, dados_hash)`
- Primeira visita à página gera narrativa, salva em `diag_analises_ia`
- Visitas seguintes servem cache (~80% hit rate esperado)
- Modelo: Sonnet 4.6 default; fallback Haiku 4.5 se custo passar de $200/mês
- PDF da proposta: sempre regera (precisa contextualizar pro lead específico)

Custos estimados (do Apêndice A da spec):
- Narrativa município: ~$0.018
- Narrativa escola: ~$0.012
- PDF proposta: ~$0.060
- Embedding (V1.5+): ~$0.00006

## 5. Lead + LGPD

**Decisão:**
- Modal abre só ao clicar "Receba diagnóstico Vertho em PDF"
- Coleta: `nome`, `email`, `cargo`, `organizacao`, `consentimento_lgpd: true`
- Sem follow-up automático na V1 (D+1, D+7 vem depois de validar conversão)
- PDF fica salvo em `diag-relatorios` bucket; URL signed válida 30 dias
- Sem cookies/tracking 3rd party na V1

## 6. SEO técnico (S2 — desde o início)

| Item | Quando | Como |
|---|---|---|
| Sitemap dinâmico | S2 | `app/radar/sitemap.ts` lista todas as escolas/municípios indexados |
| robots.txt | S2 | Permite tudo em `/radar/*`, bloqueia `/admin`, `/dashboard` |
| Schema.org | S4 | `EducationalOrganization` por escola, `Place` por município |
| Meta tags únicos | S4 | Title + description determinísticos por página |
| Canonical | S4 | URL canônica = `https://radar.vertho.ai/escola/{inep}` |

## 7. Identidade visual

**Decisão:** mesma paleta navy/cyan brand do app principal (`#0F2B54` / `#34C5CC`).

- Sem persona BETO no público (tom institucional)
- Componentes reaproveitam tokens de `globals.css`
- Logo: versão clara horizontal sobre header navy
- Tipografia: Plus Jakarta Sans (fonte do dashboard) + Instrument Serif para nomes próprios

## 8. PDF (7 páginas, curto)

| Página | Conteúdo |
|---|---|
| 1 | Capa: nome escola/município + UF + período |
| 2 | Resumo executivo (3-4 parágrafos com dados citados) |
| 3 | Saeb LP/Mat por etapa (tabela + leitura) |
| 4 | Contexto municipal (ICA, Ideb se disponível) |
| 5 | Pontos de atenção + perguntas pedagógicas |
| 6 | Como a Vertho pode ajudar (CTA Mentor IA) |
| 7 | Metodologia, fontes oficiais, próximos passos |

Disclaimer fixo: "Análise gerada a partir de dados públicos do INEP. Valores oficiais devem ser consultados em portais governamentais."

## 9. Adiamentos explícitos (fora da V1)

- Censo Escolar full (302 cols × 1M linhas) → V2
- Páginas de UF + comparativos → V1.5
- Backlinks/PR → após M5
- RAG grounding em fontes oficiais → V1.5+
- Auto-fetch INEP → V1.5+
- Follow-up D+1 / D+7 → após validar conversão

## 10. Observações operacionais

- **Migration 054**: `054_diag_schema.sql` (053 é votação, último merge)
- **Bucket `diag-relatorios`**: público read, signed write (criado via SQL na 054)
- **Domínio `radar.vertho.ai`**: adicionado ao Vercel via CLI em 2026-04-28
- **Env vars novas**: nenhuma (reaproveita `RESEND_API_KEY`, `QSTASH_TOKEN`, `ANTHROPIC_API_KEY` existentes)
- **Custo do tempo**: 4-5h de implementação ativa (vs 111-164h estimado pela spec)
- **Microrregião Irecê municípios** (validado IBGE):
  América Dourada, Barra do Mendes, Barro Alto, Cafarnaum, Canarana,
  Central, Gentio do Ouro, Ibipeba, Ibititá, Ipupiara, Irecê, Itaguaçu da Bahia,
  João Dourado, Jussara, Lapão, Mulungu do Morro, Presidente Dutra,
  São Gabriel, Uibaí, Xique-Xique
