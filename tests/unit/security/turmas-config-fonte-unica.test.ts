import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CHAVES_DE_TURMA } from '@/lib/turmas/chaves';

/**
 * Guard: chave de nível TURMA não se lê de `empresas.sys_config`.
 *
 * POR QUE EXISTE. A dor que as turmas resolvem é uma decisão de etapa alcançar
 * gente que não devia — Macaé tem 127 diretores com o diagnóstico fechado e 156
 * professores começando, e `mapeamento_cenarios_liberado` vale para os dois
 * porque mora na empresa. Um resolvedor de config efetiva só serve se TODO
 * consumidor passar por ele: um único `empresa.sys_config.mapeamento_...`
 * esquecido recria o bug inteiro, e em silêncio — a tela abre, ninguém erra.
 *
 * O precedente é caro e recente: `nivelDaNota` estava reimplementada em NOVE
 * pontos, e a divergência não ficou no código — vazou para o documento do
 * cliente (42 de 288 descritores com nível contraditório, teto de 60 do
 * auditor). Fonte única sem guard dura até o próximo commit distraído.
 *
 * DOIS CHECKS, porque há duas formas de errar:
 *   1. passar a config da empresa para um gate de etapa;
 *   2. ler a chave direto do `sys_config`, sem gate nenhum.
 */

const ARQUIVOS = () =>
  execSync('git ls-files "*.ts" "*.tsx"', { encoding: 'utf8' })
    .split('\n').map((f) => f.trim()).filter(Boolean)
    .filter((f) => !f.startsWith('tests/'))
    .filter((f) => !f.startsWith('lib/turmas/'));   // a fonte única, obviamente

/** Comentário e JSDoc citam as chaves legitimamente — não são leitura. */
const ehComentario = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

/**
 * DÍVIDA DECLARADA — só pode ENCOLHER. Entrada nova aqui é exatamente o bug que
 * este guard existe para pegar.
 *
 * `cadencia` (cron/health/trigger): o envio ainda é por empresa. Migrar exige a
 * fila por remetente (docs/TURMAS.md §7), que é projeto à parte de propósito —
 * cadência por turma como unidade de fan-out MULTIPLICARIA o problema que
 * derrubou o número em 11/08, porque duas turmas da mesma empresa passariam a
 * somar taxa no mesmo remetente.
 *
 * `actions/temporadas.ts`: a chave aparece dentro da MENSAGEM de erro que
 * explica ao operador de onde veio o default — texto, não decisão.
 */
const ALLOWLIST: Record<string, string> = {
  'actions/cron-jobs.ts': 'cadencia — envio por empresa até a fila por remetente (§7)',
  'lib/fase4/trigger-diario-empresa.ts': 'cadencia — idem',
  'lib/pipeline-health/coleta.ts': 'cadencia — o health espelha o que o cron faz hoje',
  'lib/pipeline-health/core.ts': 'cadencia — idem',
  'actions/temporadas.ts': 'texto da mensagem de erro, não decisão',
};

describe('Guard: config de turma tem fonte única', () => {
  it('nenhum gate de etapa recebe `sys_config` da empresa', () => {
    const GATES = [
      'canAccessMapeamentoCenarios',
      'canAccessPerfilComportamental',
      'isMapeamentoCenariosLiberado',
      'isPerfilComportamentalLiberado',
    ];
    const padrao = new RegExp(`(${GATES.join('|')})\\s*\\([^)]*sys_config`);

    const violacoes: string[] = [];
    for (const arq of ARQUIVOS()) {
      let txt: string;
      try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
      if (!GATES.some((g) => txt.includes(g))) continue;
      txt.split('\n').forEach((l, i) => {
        if (!ehComentario(l) && padrao.test(l)) violacoes.push(`${arq}:${i + 1} ${l.trim().slice(0, 100)}`);
      });
    }

    if (violacoes.length) {
      throw new Error(
        `${violacoes.length} gate(s) de etapa decidindo pela config da EMPRESA:\n` +
        violacoes.map((v) => `  ❌ ${v}`).join('\n') +
        `\n\nUse \`configEfetivaDoColaborador(sb, empresaId, colabId)\` (lib/turmas). ` +
        `A config da empresa ignora o override da turma — e é exatamente assim que ` +
        `a turma que ainda não abriu herda a liberação da que já abriu.`,
      );
    }
    expect(violacoes).toEqual([]);
  });

  it('nenhum arquivo NOVO lê chave de turma direto do `sys_config`', () => {
    const padrao = new RegExp(`sys_config[^\\n]*\\b(${CHAVES_DE_TURMA.join('|')})\\b`);

    const violacoes: Record<string, string[]> = {};
    for (const arq of ARQUIVOS()) {
      let txt: string;
      try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
      if (!txt.includes('sys_config')) continue;
      const linhas = txt.split('\n')
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => !ehComentario(l) && padrao.test(l));
      if (linhas.length) violacoes[arq] = linhas.map(({ l, n }) => `:${n} ${l.trim().slice(0, 90)}`);
    }

    const fora = Object.keys(violacoes).filter((f) => !(f in ALLOWLIST));
    if (fora.length) {
      throw new Error(
        `${fora.length} arquivo(s) leem chave de TURMA da config da empresa:\n` +
        fora.map((f) => `  ❌ ${f}\n${violacoes[f].map((l) => `       ${l}`).join('\n')}`).join('\n') +
        `\n\nResolva por \`resolverConfigEfetiva\` / \`configEfetivaDoColaborador\` ` +
        `(lib/turmas). Se a leitura for institucional mesmo, mova a chave para ` +
        `escopo 'empresa' em lib/turmas/chaves.ts — com o porquê.`,
      );
    }
    expect(fora).toEqual([]);
  });

  it('a allowlist não guarda arquivo que já foi corrigido', () => {
    const padrao = new RegExp(`sys_config[^\\n]*\\b(${CHAVES_DE_TURMA.join('|')})\\b`);
    const obsoletos = Object.keys(ALLOWLIST).filter((arq) => {
      let txt: string;
      try { txt = readFileSync(arq, 'utf8'); } catch { return true; }
      return !txt.split('\n').some((l) => !ehComentario(l) && padrao.test(l));
    });
    // Allowlist que não encolhe deixa de ser dívida e vira decoração.
    expect(obsoletos, `remova de ALLOWLIST: ${obsoletos.join(', ')}`).toEqual([]);
  });
});
