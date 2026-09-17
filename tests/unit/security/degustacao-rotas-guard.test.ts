import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semComentarios } from '../../helpers/fonte';

/**
 * Rotas de escrita da degustação: origem conferida e limite aplicado.
 *
 * `routes-require-auth` varre só `app/api`, e as rotas da degustação moram em
 * `app/auth/degustacao` (junto do GET do passe, que sempre morou lá). Sem este
 * guard, um POST novo nessa pasta nasceria fora de qualquer varredura: é a porta
 * pública onde a sessão do convidado nasce.
 *
 * A régua é por CHAMADA (comentário não conta) e as rotas são DESCOBERTAS no
 * git, não listadas aqui: uma lista escrita envelheceria no primeiro arquivo novo.
 */

const HELPER = 'lib/demo/degustacao-acesso.ts';

function rotasDaDegustacao(): string[] {
  return execFileSync('git', ['ls-files', 'app/auth/degustacao'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((arquivo) => /route\.ts$/.test(arquivo));
}

describe('guard: escrita nas rotas da degustação', () => {
  it('o denominador não é zero (guard cego passaria sempre)', () => {
    const comPost = rotasDaDegustacao().filter((arquivo) => /export\s+async\s+function\s+POST\b/.test(readFileSync(arquivo, 'utf8')));
    expect(comPost.length).toBeGreaterThanOrEqual(2);
  });

  it('todo POST confere a origem e aplica limite antes de trabalhar', () => {
    const faltas: string[] = [];
    for (const arquivo of rotasDaDegustacao()) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
      if (!/export\s+async\s+function\s+POST\b/.test(fonte)) continue;
      if (!/\b(escritaDeOutraOrigem|csrfCheck)\s*\(/.test(fonte)) faltas.push(`${arquivo}: sem checagem de origem`);
      if (!/\bauthLimiter\s*\.\s*check\s*\(/.test(fonte)) faltas.push(`${arquivo}: sem limite`);
    }
    expect(faltas).toEqual([]);
  });

  it('o helper de origem chama csrfCheck E compara com o host (o csrfCheck sozinho aceita qualquer *.vertho.ai)', () => {
    const fonte = semComentarios(readFileSync(HELPER, 'utf8'));
    const corpo = fonte.slice(fonte.indexOf('export function escritaDeOutraOrigem'));
    expect(corpo).toMatch(/\bcsrfCheck\s*\(/);
    expect(corpo).toMatch(/\bmesmaOrigemDoHost\s*\(/);
  });
});
