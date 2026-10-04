/**
 * Guard: o app não define senha de conta do Auth fora dos poucos lugares que
 * têm motivo, e nunca com valor literal fora do botão de demonstração.
 *
 * Decisão do dono em 04/10/2026 (senha para clientes, opção A): o cliente entra
 * por link de uso único e não tem senha. Senha existe só nos ambientes de
 * demonstração e para a equipe. Um escritor de senha novo, em qualquer outra
 * parte do app, recria o problema de uma senha que ninguém escolheu (e, com
 * valor literal, de uma senha conhecida por todos).
 *
 * O guard varre o código versionado (fora de tests/) atrás de chamadas
 * `auth.admin.createUser` / `updateUserById` / `signUp` / `updateUser` que
 * carregam `password`. Cada arquivo permitido declara o porquê. Lista que só
 * encolhe: arquivo novo exige decisão, não entrada de allowlist por conveniência.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { semComentarios } from '../../helpers/fonte';

const PERMITIDOS: Record<string, string> = {
  'app/admin/empresas/[empresaId]/actions.ts':
    'botão "Definir senha teste123", recusado fora de empresa de demonstração e para quem tem cadastro em empresa real (R-19, com auditoria)',
  'lib/demo/reset-acme-demo.ts':
    'personas de demonstração do tenant ACME, que entram por senha de propósito',
  'scripts/criar-smoke-e2e.ts':
    'conta de verificação do E2E (`smoke-e2e.demo@vertho.ai`), no tenant de demonstração',
};

/** Só o botão de demonstração pode ter senha com valor literal. */
const PERMITIDOS_COM_LITERAL = new Set(['app/admin/empresas/[empresaId]/actions.ts']);

const CHAMADA_AUTH = /\b(?:admin\.createUser|admin\.updateUserById|auth\.signUp|auth\.updateUser)\s*\(/;
const CAMPO_SENHA = /\bpassword\b\s*(?::|,|\})/;
const LITERAL = /\bpassword\s*:\s*(['"`])[^'"`]+\1/;

function arquivosDeCodigo(): string[] {
  const saida = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  return saida
    .split('\0')
    .filter((f) => /\.(?:tsx?|mjs|js)$/.test(f) && !f.startsWith('tests/') && !f.includes('/tests/') && !f.startsWith('node_modules/'));
}

const achados = arquivosDeCodigo()
  .map((arquivo) => {
    let fonte = '';
    try {
      fonte = semComentarios(readFileSync(arquivo, 'utf-8'));
    } catch {
      return null;
    }
    if (!CHAMADA_AUTH.test(fonte)) return null;
    // A senha tem de aparecer na vizinhança de uma chamada, não em qualquer ponto do arquivo.
    const trechos = [...fonte.matchAll(new RegExp(CHAMADA_AUTH.source, 'g'))].map((m) => fonte.slice(m.index!, m.index! + 400));
    const defineSenha = trechos.some((t) => CAMPO_SENHA.test(t));
    if (!defineSenha) return null;
    return { arquivo, literal: trechos.some((t) => LITERAL.test(t)) };
  })
  .filter(Boolean) as Array<{ arquivo: string; literal: boolean }>;

describe('senha de conta do Auth só onde há motivo (senha para clientes, opção A)', () => {
  it('a varredura enxerga os escritores conhecidos (o guard não está cego)', () => {
    const nomes = achados.map((a) => a.arquivo);
    for (const esperado of Object.keys(PERMITIDOS)) expect(nomes, esperado).toContain(esperado);
  });

  it('nenhum arquivo novo define senha de conta do Auth', () => {
    const novos = achados.filter((a) => !(a.arquivo in PERMITIDOS)).map((a) => a.arquivo);
    expect(
      novos,
      `Escritor de senha novo: ${novos.join(', ')}. O cliente não tem senha (entra por link). Se for demonstração ou equipe, declare em PERMITIDOS com o motivo.`,
    ).toEqual([]);
  });

  it('senha com valor literal só no botão de demonstração', () => {
    const literais = achados.filter((a) => a.literal && !PERMITIDOS_COM_LITERAL.has(a.arquivo)).map((a) => a.arquivo);
    expect(literais, `Senha literal fora do botão de demonstração: ${literais.join(', ')}`).toEqual([]);
  });

  it('todo arquivo permitido ainda define senha (entrada que sobrou sai da lista)', () => {
    const nomes = new Set(achados.map((a) => a.arquivo));
    const orfaos = Object.keys(PERMITIDOS).filter((f) => !nomes.has(f));
    expect(orfaos, `Permitidos que não definem mais senha: ${orfaos.join(', ')}`).toEqual([]);
  });
});
