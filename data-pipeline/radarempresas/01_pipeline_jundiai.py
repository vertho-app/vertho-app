"""
Radar Empresas — staging Receita → recorte Jundiaí/SP (CSV utf-8).

Por que Python e não DuckDB puro: os CSV da Receita são cp1252
(Windows-1252) e o DuckDB 1.5 só suporta utf-8/latin-1/utf-16 — a
extensão `encodings` não tem build pra Windows nessa versão. Python lê
cp1252 nativamente. Streaming linha-a-linha (memória mínima).

Saída: out/empresas_jundiai.csv (utf-8, com header). O run.ps1 converte
pra Parquet com DuckDB depois (CSV utf-8 = sem problema de encoding).

Uso:
    python 01_pipeline_jundiai.py "<RECEITA_DIR>"
"""
import csv, sys, os, glob, datetime

csv.field_size_limit(10_000_000)

RECEITA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("RECEITA_DIR", "")
if not RECEITA_DIR or not os.path.isdir(RECEITA_DIR):
    print(f"RECEITA_DIR inválido: {RECEITA_DIR}", file=sys.stderr)
    sys.exit(1)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT_DIR, exist_ok=True)
OUT_CSV = os.path.join(OUT_DIR, "empresas_jundiai.csv")
HOJE = datetime.date(2026, 5, 15)
FONTE = "receita-2026-05"


def find(ext):
    return sorted(glob.glob(os.path.join(RECEITA_DIR, "**", ext), recursive=True))


def reader(path):
    # errors='replace': bytes inválidos em cp1252 (0x81/0x8D/0x8F/0x90/0x9D,
    # raros e "sujos" nos dados da Receita) viram U+FFFD — preserva a linha,
    # só corrompe 1 caractere ocasional numa razão social. Não perde empresa.
    with open(path, encoding="cp1252", errors="replace", newline="") as f:
        yield from csv.reader(f, delimiter=";", quotechar='"')


# ── 1. Municípios → código de Jundiaí ────────────────────────────────────
def norm(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").strip().upper())
                    if unicodedata.category(c) != "Mn")


jundiai_cods = set()
mun_nome = {}
for p in find("*.MUNICCSV"):
    for row in reader(p):
        if len(row) < 2:
            continue
        cod, nome = row[0].strip(), row[1].strip()
        mun_nome[cod] = nome
        if norm(nome) == "JUNDIAI":
            jundiai_cods.add(cod)
print(f"Municípios lidos: {len(mun_nome)} | Jundiaí cód: {sorted(jundiai_cods)}", flush=True)
if not jundiai_cods:
    print("ERRO: município Jundiaí não encontrado.", file=sys.stderr)
    sys.exit(1)

# ── 2. CNAEs → descrição ─────────────────────────────────────────────────
cnae_desc = {}
for p in find("*.CNAECSV"):
    for row in reader(p):
        if len(row) >= 2:
            cnae_desc[row[0].strip()] = row[1].strip()
print(f"CNAEs lidos: {len(cnae_desc)}", flush=True)

# ── 3. Estabelecimentos: filtra Jundiaí/SP ativo (streaming) ─────────────
estabs = []           # linhas filtradas (cabe em memória — recorte pequeno)
basicos = set()
arqs_est = find("*.ESTABELE")
print(f"Estabelecimentos: {len(arqs_est)} arquivo(s) — varrendo...", flush=True)
lidos = 0
for idx, p in enumerate(arqs_est, 1):
    for row in reader(p):
        lidos += 1
        if len(row) < 21:
            continue
        if row[19].strip() != "SP":            # uf
            continue
        if row[5].strip() != "02":             # situacao_cadastral = ativa
            continue
        if row[20].strip() not in jundiai_cods:  # municipio
            continue
        estabs.append(row)
        basicos.add(row[0].strip())
    print(f"  [{idx}/{len(arqs_est)}] {os.path.basename(p)} — "
          f"acumulado: {len(estabs)} estab (lidas {lidos:,})", flush=True)
print(f"Estabelecimentos Jundiaí/SP ativos: {len(estabs)}", flush=True)

# ── 4. Empresas: só os cnpj_basico do recorte (streaming) ───────────────
emp = {}
for p in find("*.EMPRECSV"):
    for row in reader(p):
        if len(row) >= 6 and row[0].strip() in basicos:
            emp[row[0].strip()] = row
print(f"Empresas casadas: {len(emp)}/{len(basicos)}", flush=True)


# ── 5. Join + derivações → CSV utf-8 ─────────────────────────────────────
def age_years(d):
    d = (d or "").strip()
    if len(d) != 8 or not d.isdigit():
        return ""
    try:
        dt = datetime.date(int(d[:4]), int(d[4:6]), int(d[6:8]))
        return str((HOJE - dt).days // 365)
    except ValueError:
        return ""


def to_num(s):
    s = (s or "").strip().replace(",", ".")
    try:
        return str(float(s))
    except ValueError:
        return ""


HEADER = [
    "cnpj_basico", "cnpj_ordem", "cnpj_dv", "cnpj_completo", "razao_social",
    "nome_fantasia", "natureza_juridica", "porte_empresa", "capital_social_num",
    "identificador_matriz_filial", "is_matriz", "situacao_cadastral",
    "cnae_fiscal_principal", "cnae_principal_desc", "cnae_fiscal_secundaria",
    "uf", "municipio_cod", "municipio_nome", "bairro", "cep", "email",
    "telefone_1", "telefone_2", "has_email", "has_phone", "has_fantasia",
    "data_inicio_atividade", "company_age_years", "is_active", "fonte_version",
]

n = 0
with open(OUT_CSV, "w", encoding="utf-8", newline="") as fout:
    w = csv.writer(fout)
    w.writerow(HEADER)
    for r in estabs:
        b = r[0].strip()
        e = emp.get(b)
        if not e:
            continue
        email = r[27].strip() if len(r) > 27 else ""
        tel1 = (r[21].strip() + r[22].strip()) if len(r) > 22 else ""
        tel2 = (r[23].strip() + r[24].strip()) if len(r) > 24 else ""
        fant = r[4].strip()
        w.writerow([
            b, r[1].strip(), r[2].strip(),
            f"{b.zfill(8)}{r[1].strip().zfill(4)}{r[2].strip().zfill(2)}",
            e[1].strip(), fant, e[2].strip(), e[5].strip(), to_num(e[4]),
            r[3].strip(), "true" if r[3].strip() == "1" else "false",
            r[5].strip(), r[11].strip(), cnae_desc.get(r[11].strip(), ""),
            r[12].strip(), r[19].strip(), r[20].strip(),
            mun_nome.get(r[20].strip(), ""), r[17].strip(), r[18].strip(),
            email, tel1, tel2,
            "true" if email else "false",
            "true" if tel1 else "false",
            "true" if fant else "false",
            r[10].strip(), age_years(r[10]), "true", FONTE,
        ])
        n += 1

print(f"\n✓ Recorte gravado: {OUT_CSV} ({n} linhas)", flush=True)
