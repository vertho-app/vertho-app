"""Lê as 20 fontes do Project em origin/master (blob, nunca o disco), normaliza CRLF e grava a cópia para subir.
Imprime kB (len do texto / 1000, a régua do card) e sha1 de cada uma, e grava _mapa.json."""
import hashlib
import io
import json
import os
import subprocess
import sys

REPO = r'C:\GAS\Vertho App\nextjs-app'
OUT = sys.argv[1]
REF = 'origin/master'
FONTES = [
    'CLAUDE.md', 'docs/ARQUITETURA.md', 'docs/PIPELINE-TRILHA.md', 'docs/FMEA-PIPELINE.md',
    'docs/PASSO-A-PASSO-VERTHO.md', 'docs/CUSTO-QUALIDADE.md', 'docs/SECURITY-STATUS.md',
    'docs/CATALOGO-PROMPTS-IA.md', 'docs/MODULOS-BASE-CONTEUDO.md', 'docs/PORTAL-REPRESENTANTE.md',
    'docs/GERADOR-VIDEO-MODULO.md', 'docs/DESIGN-SYSTEM.md', 'docs/RESUMO.md',
    'docs/FEATURES-E-BENEFICIOS.md', 'docs/SIMULADOR-VENDAS.md', 'docs/SIMULADOR-LIDERANCA.md',
    'docs/simuladores-validacao.md', 'docs/recepcao-medica.md', 'docs/ORCAMENTO.md',
    'docs/FLUXO-DE-DADOS-PESSOAIS.md',
]

os.makedirs(OUT, exist_ok=True)
sha_ref = subprocess.run(['git', '-C', REPO, 'rev-parse', REF], capture_output=True, text=True).stdout.strip()
mapa = {}
for f in FONTES:
    r = subprocess.run(['git', '-C', REPO, 'show', f'{REF}:{f}'], capture_output=True)
    if r.returncode != 0:
        sys.exit(f'ERRO: {f} não existe em {REF}: {r.stderr.decode("utf-8", "replace")[:200]}')
    texto = r.stdout.decode('utf-8').replace('\r\n', '\n')
    nome = os.path.basename(f)
    with io.open(os.path.join(OUT, nome), 'w', encoding='utf-8', newline='') as fh:
        fh.write(texto)
    mapa[nome] = {'kb': round(len(texto) / 1000, 1), 'sha1': hashlib.sha1(texto.encode('utf-8')).hexdigest(), 'n': len(texto)}

with io.open(os.path.join(OUT, '_mapa.json'), 'w', encoding='utf-8') as fh:
    json.dump({'ref': sha_ref, 'fontes': mapa}, fh, ensure_ascii=False, indent=1)
print(f'ref {REF} = {sha_ref[:8]} | {len(mapa)} fontes')
for k, v in mapa.items():
    print(f'{k:32s} {v["kb"]:8.1f} kB  {v["sha1"][:10]}')
