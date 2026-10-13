"""Lê as fontes do Project em origin/master (blob, nunca o disco), normaliza CRLF e grava a cópia para subir.
São 21: 20 ESPELHADAS (um arquivo do repo cada) e 1 DERIVADA, `VERTHO-DESIGN.md`, que junta a skill
`.claude/skills/vertho-design/` num arquivo de texto (o Project não aceita as fontes .otf, e a pasta inteira
viraria dezenas de fontes). Imprime kB (len do texto / 1000, a régua do card) e sha1 de cada uma, e grava _mapa.json."""
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
SKILL_DIR = '.claude/skills/vertho-design/'
NOME_DERIVADA = 'VERTHO-DESIGN.md'


def git(*args):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True)
    if r.returncode != 0:
        sys.exit(f'ERRO: git {" ".join(args)}: {r.stderr.decode("utf-8", "replace")[:200]}')
    return r.stdout


def blob(caminho):
    return git('show', f'{REF}:{caminho}').decode('utf-8').replace('\r\n', '\n')


def consolidar_vertho_design():
    """Junta a skill vertho-design num texto só, SEM reescrever: os .md entram como estão, os .css dentro de cercas.

    O cabeçalho cita o último commit que tocou a SKILL (não o do master), para o hash só mudar quando a skill muda.
    Fora ficam o que o Project não lê como texto (fontes .otf, imagens .png, cartões .card.html), contado na hora."""
    todos = [a[len(SKILL_DIR):] for a in git('ls-tree', '-r', '--name-only', REF, '--', SKILL_DIR).decode('utf-8').splitlines()
             if a.startswith(SKILL_DIR)]
    if 'SKILL.md' not in todos:
        sys.exit(f'ERRO: {SKILL_DIR}SKILL.md não existe em {REF}')
    mds = sorted((a for a in todos if a.endswith('.md') and '/' not in a), key=lambda a: (a != 'SKILL.md', a))
    csss = sorted(a for a in todos if a.endswith('.css') and ('/' not in a or a.startswith('tokens/')))
    fora = [
        f'{len([a for a in todos if a.endswith(ext)])} {rotulo}'
        for ext, rotulo in (('.otf', 'fontes .otf'), ('.png', 'imagens .png'), ('.card.html', 'cartões de especimen .card.html'))
    ]
    commit_skill = git('log', '-1', '--format=%H', REF, '--', SKILL_DIR).decode().strip()[:8]
    partes = [
        '# vertho.ai: skill de design (consolidada para o Project)\n',
        f'> Gerado a partir de `{SKILL_DIR}` (último commit da skill: `{commit_skill}`). O texto dos arquivos abaixo entra INTEGRAL, sem reescrever.',
        '> Ficam de fora, porque não cabem como texto: ' + '; '.join(fora) + '.',
        '> Os caminhos citados (`assets/...`, `components/...`, `app/globals.css`) são do repositório, não do Project.',
        '> Fonte da verdade: a skill `vertho-design` no repositório. Se este arquivo divergir dela, vale a skill.\n',
        '---\n',
    ]
    n = 0
    for f in mds:
        n += 1
        partes += [f'## Arquivo {n}: {f}\n', blob(SKILL_DIR + f).rstrip('\n'), '\n---\n']
    for f in csss:
        n += 1
        partes += [f'## Arquivo {n}: {f}\n', '```css', blob(SKILL_DIR + f).rstrip('\n'), '```\n', '---\n']
    return '\n'.join(partes).rstrip('\n') + '\n'


def gravar(nome, texto):
    with io.open(os.path.join(OUT, nome), 'w', encoding='utf-8', newline='') as fh:
        fh.write(texto)
    return {'kb': round(len(texto) / 1000, 1), 'sha1': hashlib.sha1(texto.encode('utf-8')).hexdigest(), 'n': len(texto)}


os.makedirs(OUT, exist_ok=True)
sha_ref = git('rev-parse', REF).decode().strip()
mapa = {}
for f in FONTES:
    mapa[os.path.basename(f)] = gravar(os.path.basename(f), blob(f))
mapa[NOME_DERIVADA] = {**gravar(NOME_DERIVADA, consolidar_vertho_design()), 'derivada': True}

with io.open(os.path.join(OUT, '_mapa.json'), 'w', encoding='utf-8') as fh:
    json.dump({'ref': sha_ref, 'fontes': mapa}, fh, ensure_ascii=False, indent=1)
print(f'ref {REF} = {sha_ref[:8]} | {len(mapa)} fontes ({len(FONTES)} espelhadas + 1 derivada)')
for k, v in mapa.items():
    print(f'{k:32s} {v["kb"]:8.1f} kB  {v["sha1"][:10]}{"  (derivada)" if v.get("derivada") else ""}')
