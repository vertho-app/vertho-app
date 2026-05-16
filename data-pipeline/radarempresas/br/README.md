# Radar Empresas — Pipeline BR

Escala nacional (~20M estab ativos). Princípio: **todo cálculo pesado roda
local** (DuckDB/Parquet); o Supabase só serve **agregados** (cidades_agg +
redes + funil_agg, <100 MB → cabe nos 8 GB grátis do Pro). O lead-a-lead
vira **1 XLSX por município no Supabase Storage** (bucket separado, 100 GB
grátis). A tela mostra consolidado por cidade; o detalhe é exportável.

## Pré-requisitos (do Rodrigo)

- **Base Receita BR** extraída localmente: `.EMPRECSV .ESTABELE .CNAECSV
  .MUNICCSV` (do Google Drive, ref 2026-05). Sócios fora (LGPD).
- **CAGED** nacional 6m: `<CagedRoot>\<YYYYMM>\CAGEDMOV<YYYYMM>.7z`
  pros 6 meses (ex. 202510..202603). O pipeline extrai e agrega
  (janela 6m = a da calibração validada). Meses faltando = aviso +
  contexto mais fraco.
- **RAIS_VINC** nacional: os `RAIS_VINC_PUB_*.7z` regionais num diretório
  (SP, MG_ES_RJ, Sul, Nordeste, Norte, Centro-Oeste). O pipeline extrai
  e agrega VINC→município×CNAE (estoque=vínculos ativos 31/12, porte=
  Tamanho Estabelecimento) — mesmo schema do antigo RAIS_ESTAB.
  Arquivos .7z vazios/corrompidos são pulados com aviso.
- DuckDB CLI no PATH (winget `DuckDB.cli`), Python 3, Node/npx.
- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (a carga usa supabase-js — **não precisa de connection string**: o DB
  só recebe agregados, COPY virou desnecessário).
- Migration `110-radarempresas-cidades-agg.sql` aplicada no SQL Editor.

## Rodar (snapshot mensal, full rebuild idempotente)

```powershell
.\run_br.ps1 -ReceitaDir "X:\Receita" -CagedRoot "C:\Users\rdnav" `
             -RaisVincDir "C:\Users\rdnav\2025" -RefDate 2026-05-15
```

Resume por estágio: `-FromStage 4`. Pular CEMPRE: `-SkipCempre`
(corroboração vira no-op; não quebra).

## Estágios

| # | Arquivo | O quê | Validado |
|---|---|---|---|
| 1 | `10_transcode_utf8.py` | cp1252→utf8 streaming | fixtures |
| 2 | `11_ingest.sql` | join+filtro+derive, **is_matriz corrigido**, particiona UF | layout Receita |
| 3a | `../caged/run_caged_br.ps1` + `../rais/run_rais_vinc.ps1` | agregados nacionais (CAGED 6m + RAIS via VINC, extraem .7z) | CAGED 6m + RAIS Norte reais ✓ |
| 2.5 | `15_cempre_sidra.ts` | CEMPRE via SIDRA (corroboração), cache | API live |
| 3 | `14_contexto.sql` | contexto bayesiano/percentil por município + corrobora CEMPRE | Jundiaí 1:1 |
| ref | `19_dump_ref.ts` | allowlist/denylist/tetos → out/ref | — |
| 4 | `12_score.ts` | score (motor TS compartilhado, **zero drift**) | Jundiaí 1:1 |
| 5 | `13_rank_redes.sql` | priority_rank nacional + redes + agregados | Jundiaí 1:1 |
| 5b | `16_export_xlsx.ts` | 1 XLSX/município | — |
| 6 | `17_load_supabase.ts` | agregados→DB + XLSX→Storage | — |

## Garantia de zero-drift

O score reutiliza `lib/radarempresas/score-resolve.ts` (`scoreEstab`) —
o mesmo motor do Supabase. Validado: pipeline BR sobre Parquet reproduz
Jundiaí **exatamente** (distribuição 606/22386/64037/6681, redes 264,
priorizados 5143). Sem cópia da fórmula.

## Decisões (memória do projeto)

Validação Jundiaí ≥60% A/B liberou a escala BR. priority_rank =
percentil **nacional**. CEMPRE = **corroboração** (não eixo; emite
`cempre_corrobora` p/ reavaliar com evidência BR). Tela = painel por
cidade; lead-a-lead só XLSX. Bruto nunca sobe ao Supabase.
