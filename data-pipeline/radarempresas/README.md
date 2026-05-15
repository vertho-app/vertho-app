# Radar Empresas — Pipeline de dados (Receita Federal)

Pipeline offline: CSV bruto da Receita (~7GB) → DuckDB → Parquet tratado
(recorte Jundiaí/SP) → Postgres (Supabase).

**Dado bruto nunca entra no Supabase.** DuckDB processa local, exporta só o
recorte filtrado.

## Pré-requisitos

- DuckDB CLI (instalado via `winget install DuckDB.cli`)
- Node 24+ (para o load no Postgres — etapa 04)
- Base da Receita descompactada localmente (referência 2026-05)

## Estrutura esperada dos arquivos da Receita

A Receita publica CSV `;`-delimitado, encoding **cp1252 (windows-1252)**,
**sem header**, datas `AAAAMMDD`, decimais com vírgula. Extensões:

| Conjunto | Extensão | Partes | Uso no MVP |
|---|---|---|---|
| Empresas | `.EMPRECSV` | 0–9 | sim (razão social, capital, porte) |
| Estabelecimentos | `.ESTABELE` | 0–9 | sim (endereço, CNAE, situação, contato) |
| Cnaes | `.CNAECSV` | única | sim (catálogo) |
| Municipios | `.MUNICCSV` | única | sim (de-para código Receita↔nome) |
| Socios | `.SOCIOCSV` | 0–9 | **NÃO** (fora do MVP) |
| Simples | `.SIMPLES` | única | não (MVP) |

O download do Drive coloca cada conjunto numa subpasta
(`Empresas0/`, `Estabelecimentos0/`, `Cnaes/`, ...). O script varre
recursivamente, então não importa se está em subpastas.

## Como rodar

```powershell
# 1. Apontar o diretório raiz onde a Receita foi baixada/descompactada
$env:RECEITA_DIR = "D:\receita-2026-05"   # ajuste pro seu caminho

# 2. Rodar o pipeline (staging + filtro Jundiaí + export parquet)
cd "C:\GAS\Vertho App\nextjs-app\data-pipeline\radarempresas"
.\run.ps1 -ReceitaDir $env:RECEITA_DIR

# Saída: ./out/empresas_jundiai.parquet  (recorte tratado, pronto pra carga)
```

O `run.ps1` chama o DuckDB com `01_pipeline_jundiai.sql`, que:
1. Lê os CSVs com schema explícito (encoding cp1252, sem header)
2. Descobre o código Receita de Jundiaí pelo arquivo Municipios (não hardcoded)
3. Filtra estabelecimentos **ativos** (situacao_cadastral='02') de **Jundiaí/SP**
4. Junta Empresas + Estabelecimentos + Cnae + Municipio
5. Gera `cnpj_completo`, flags (is_matriz, has_email, has_phone...),
   `company_age_years`, `capital_social_num`
6. Exporta Parquet único: `out/empresas_jundiai.parquet`

Não modifica os arquivos originais. Idempotente — pode rodar quantas vezes.

## Próxima etapa (após Parquet gerado)

`04_load_to_postgres.mjs` lê o Parquet e faz INSERT batched nas tabelas
`radarempresas_*` do Supabase (criadas pela migration 099). Documentado
quando o Parquet estiver validado.

## Notas

- Pode rodar **antes do download terminar** — só processa o que existir.
  Reexecute quando baixar mais partes (Estabelecimentos tem 10 partes).
- Jundiaí/SP: o código de município da Receita NÃO é o código IBGE.
  O script resolve sozinho lendo o `.MUNICCSV` (filtra `UF='SP'` no
  estabelecimento + nome de município contendo 'JUNDIAI').
