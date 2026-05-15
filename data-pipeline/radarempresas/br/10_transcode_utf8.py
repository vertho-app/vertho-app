"""
Stage 1 (BR) — transcode Receita cp1252 → utf-8. ZERO lógica.

Por que existe: o DuckDB 1.5 não lê cp1252 (extensão `encodings` sem
build pra Windows). O pipeline antigo (01_pipeline_jundiai.py) resolvia
lendo em Python E fazendo o join/derivação acumulando tudo em RAM
("cabe em memória — recorte pequeno"). Na base BR (~20M ativos) isso
estoura. Aqui o Python só transcodifica streaming (memória constante,
1 linha por vez) — o join/filtro/derivação passam pro DuckDB
out-of-core no Stage 2.

errors='replace': bytes inválidos em cp1252 (0x81/0x8D/0x8F/0x90/0x9D,
raros e "sujos" na Receita) viram U+FFFD — preserva a linha, só
corrompe 1 char ocasional numa razão social. Não perde empresa.

Idempotente: pula arquivo cujo .utf8 já existe e é mais novo que o
bruto. Uso:
    python 10_transcode_utf8.py "<RECEITA_DIR>" "<OUT_DIR>"
"""
import sys, os, glob, time

# stdout do PowerShell é cp1252 — força utf-8 pra não quebrar em logs
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

RECEITA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("RECEITA_DIR", "")
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "out", "utf8")

if not RECEITA_DIR or not os.path.isdir(RECEITA_DIR):
    print(f"RECEITA_DIR inválido: {RECEITA_DIR}", file=sys.stderr)
    sys.exit(1)
os.makedirs(OUT_DIR, exist_ok=True)

# só os layouts que o Stage 2 usa (sócios fora do escopo — LGPD/volume)
PATTERNS = ["*.EMPRECSV", "*.ESTABELE", "*.CNAECSV", "*.MUNICCSV"]
CHUNK = 1 << 20  # 1 MiB — transcode por bloco, não por linha (mais rápido)


def find(pat):
    return sorted(glob.glob(os.path.join(RECEITA_DIR, "**", pat), recursive=True))


def out_path(src):
    # achata: <basename>.utf8.csv (basenames Receita são únicos por tipo)
    return os.path.join(OUT_DIR, os.path.basename(src) + ".utf8.csv")


def fresh(src, dst):
    return os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)


def transcode(src, dst):
    # decode incremental por bloco; um byte multibyte nunca parte aqui
    # porque cp1252 é single-byte (1 byte = 1 char). Seguro por chunk.
    with open(src, "rb") as fin, open(dst, "w", encoding="utf-8",
                                      errors="replace", newline="") as fout:
        while True:
            blk = fin.read(CHUNK)
            if not blk:
                break
            fout.write(blk.decode("cp1252", errors="replace"))


def main():
    files = []
    for p in PATTERNS:
        files += find(p)
    if not files:
        print(f"Nenhum arquivo Receita em {RECEITA_DIR} "
              f"({', '.join(PATTERNS)})", file=sys.stderr)
        sys.exit(1)

    print(f"Transcode cp1252→utf8: {len(files)} arquivo(s) → {OUT_DIR}",
          flush=True)
    total = 0
    for i, src in enumerate(files, 1):
        dst = out_path(src)
        sz = os.path.getsize(src) / (1 << 20)
        if fresh(src, dst):
            print(f"  [{i}/{len(files)}] {os.path.basename(src)} "
                  f"({sz:.0f} MB) — cache OK, pulado", flush=True)
            continue
        t0 = time.time()
        transcode(src, dst)
        total += 1
        print(f"  [{i}/{len(files)}] {os.path.basename(src)} "
              f"({sz:.0f} MB) — {time.time() - t0:.0f}s", flush=True)
    print(f"\n✓ Transcode concluído: {total} novo(s), "
          f"{len(files) - total} em cache. Próximo: Stage 2 (11_ingest.sql)",
          flush=True)


if __name__ == "__main__":
    main()
