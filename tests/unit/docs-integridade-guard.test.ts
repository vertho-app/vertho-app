import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Guard: integridade dos `.md` versionados e do frontmatter de skills e agents.
 *
 * Dois defeitos medidos pelo /doctor de 26/09/2026, os dois CALADOS:
 *
 * 1) Caractere de controle em `.md`. Script que escreve texto com escape (heredoc, `node -e`,
 *    string JSON) troca a barra-b de uma regex pelo backspace (0x08). O `CLAUDE.md` carregou três
 *    deles desde `519c821f` (02/09/2026), por 24 dias, e o item "NÃO validar texto em PORTUGUÊS"
 *    ensinava uma regex que não existia. Nada acusa: o Markdown renderiza, e o diff mostra um `^H`
 *    que ninguém lê.
 *
 * 2) Frontmatter com `: ` dentro de um valor SEM aspas. Em YAML, `: ` abre um mapeamento, então
 *    `description: ... as quatro provas: qual ...` é erro de parse, não texto. O Claude Code 2.1.283
 *    descartou o subagent `guard-auditor` inteiro por isso, sem aviso nenhum (em 30/08 ele rodava com
 *    o mesmo texto; a versão nova ficou mais rígida). A skill `vertho-design` tinha o mesmo defeito e
 *    só carregava por tolerância do leitor de skills, que pode sumir na próxima versão. ` #` num valor
 *    sem aspas é o primo silencioso: vira comentário e CORTA a descrição.
 *    Regra: valor com `: ` ou ` #` vai entre aspas (simples, se o texto tiver aspas duplas).
 *
 * Varre só o VERSIONADO (`git ls-files`), como os outros guards, e é fail-closed: listagem vazia
 * reprova, porque zero arquivos varridos é exatamente o que uma listagem quebrada devolve.
 */

function versionados(padroes: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...padroes], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.split('\0').filter(Boolean);
}

const TAB = 9;
const LF = 10;
const CR = 13;

function controles(texto: string): { linha: number; codigo: number }[] {
  const achados: { linha: number; codigo: number }[] = [];
  let linha = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c === LF) linha++;
    else if (c < 32 && c !== TAB && c !== CR) achados.push({ linha, codigo: c });
  }
  return achados;
}

const BOM = String.fromCharCode(0xfeff);
const CHAVE = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;

/** Linhas de chave de nível 0 do bloco entre os `---` iniciais; `null` se não há frontmatter. */
function chavesDoFrontmatter(texto: string): { chave: string; valor: string; linha: number }[] | null {
  const linhas = texto.split(String.fromCharCode(LF)).map((l) => (l.endsWith(String.fromCharCode(CR)) ? l.slice(0, -1) : l));
  if (linhas[0]?.startsWith(BOM)) linhas[0] = linhas[0].slice(1);
  if (linhas[0] !== '---') return null;
  const fim = linhas.indexOf('---', 1);
  if (fim < 0) return null;
  const out: { chave: string; valor: string; linha: number }[] = [];
  for (let i = 1; i < fim; i++) {
    const m = CHAVE.exec(linhas[i]);
    if (m) out.push({ chave: m[1], valor: m[2].trim(), linha: i + 1 });
  }
  return out;
}

/** Valor que o YAML lê como texto puro (sem aspas, sem bloco, sem lista/mapa em fluxo). */
function semAspas(valor: string): boolean {
  return valor !== '' && !`'"|>[{`.includes(valor[0]);
}

describe('Guard: .md versionado sem caractere de controle', () => {
  it('nenhum .md versionado tem caractere de controle (0x00-0x1F, salvo tab, LF e CR)', () => {
    const mds = versionados(['*.md']);
    expect(mds.length, 'git ls-files não devolveu nenhum .md: a varredura não rodou').toBeGreaterThan(0);
    expect(mds).toContain('CLAUDE.md');

    const ruins = mds.flatMap((f) =>
      controles(readFileSync(f, 'utf-8')).map((a) => `  ❌ ${f}:${a.linha} tem o caractere 0x${a.codigo.toString(16).padStart(2, '0')}`),
    );
    if (ruins.length > 0) {
      throw new Error(
        `${ruins.length} caractere(s) de controle em .md versionado (quase sempre um escape que um script gravou cru, como a barra-b de uma regex virando backspace):\n`
          + ruins.join('\n'),
      );
    }
  });
});

describe('Guard: frontmatter de skill e agent é YAML que carrega', () => {
  const arquivos = versionados(['.claude/skills/*/SKILL.md', '.claude/agents/*.md']);
  const skills = arquivos.filter((f) => f.startsWith('.claude/skills/'));
  const agents = arquivos.filter((f) => f.startsWith('.claude/agents/'));

  it('achou skills e agents para conferir (0 varridos = listagem quebrada)', () => {
    expect(skills.length).toBeGreaterThan(0);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('nenhum valor sem aspas contém ": " ou " #", nem termina em ":"', () => {
    const ruins: string[] = [];
    for (const f of arquivos) {
      const chaves = chavesDoFrontmatter(readFileSync(f, 'utf-8')) ?? [];
      for (const { chave, valor, linha } of chaves) {
        if (!semAspas(valor)) continue;
        if (valor.includes(': ') || valor.includes(' #') || valor.endsWith(':')) {
          ruins.push(`  ❌ ${f}:${linha} \`${chave}:\` tem ": ", " #" ou ":" final sem aspas`);
        }
      }
    }
    if (ruins.length > 0) {
      throw new Error(
        `${ruins.length} valor(es) de frontmatter que o YAML não lê como texto. O Claude Code descarta o agent sem aviso. Ponha o valor entre aspas simples:\n`
          + ruins.join('\n'),
      );
    }
  });

  it('todo agent tem name e description; toda skill tem description', () => {
    const faltas: string[] = [];
    for (const f of arquivos) {
      const chaves = chavesDoFrontmatter(readFileSync(f, 'utf-8'));
      const tem = new Set((chaves ?? []).map((c) => c.chave));
      const exigidas = f.startsWith('.claude/agents/') ? ['name', 'description'] : ['description'];
      const falta = exigidas.filter((k) => !tem.has(k));
      if (chaves === null || falta.length > 0) faltas.push(`  ❌ ${f}: ${chaves === null ? 'sem frontmatter' : 'falta ' + falta.join(', ')}`);
    }
    if (faltas.length > 0) throw new Error(`frontmatter incompleto:\n${faltas.join('\n')}`);
  });
});
