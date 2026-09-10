/**
 * A Prontidão está OCULTA (decisão do dono, 10/09/2026) — e ocultar tem dois
 * pontos, porque tela sumida não desliga endpoint: `'use server'` faz de todo
 * export uma rota HTTP chamável sem a aba existir.
 *
 * Este guard congela os dois pontos enquanto a flag estiver desligada. Religar
 * é trocar a constante em `prontidao-flag.ts` — aí a primeira asserção falha de
 * propósito e força remover este arquivo junto, em vez de deixá-lo travando o
 * retorno em silêncio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PRONTIDAO_VISIVEL } from '@/lib/adequacao-cargo/prontidao-flag';

const RAIZ = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

describe('prontidão oculta', () => {
  it('a flag está desligada — se você a religou, apague este arquivo na mesma rodada', () => {
    expect(PRONTIDAO_VISIVEL).toBe(false);
  });

  it('as DUAS telas decidem pela flag, não por conta própria', () => {
    // Tela oculta por outra condição qualquer voltaria sozinha no próximo
    // refactor; pela flag, o retorno é um flip declarado.
    for (const arquivo of ['app/dashboard/gestor/ranking/ranking-tabs.tsx', 'app/admin/fit/_components/ranking-tab.tsx']) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).toContain("from '@/lib/adequacao-cargo/prontidao-flag'");
      expect(fonte, arquivo).toContain('PRONTIDAO_VISIVEL');
    }
  });

  it('cada um dos 4 endpoints recusa ANTES de qualquer leitura', () => {
    const fonte = ler('actions/prontidao-cargo.ts');
    const exports = [...fonte.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exports.sort()).toEqual(['compararCargos', 'compararCargosAdmin', 'listarCargosParaProntidao', 'listarCargosParaProntidaoAdmin']);
    for (const nome of exports) {
      const corpo = fonte.slice(fonte.indexOf(`function ${nome}`));
      const recusa = corpo.indexOf('if (!PRONTIDAO_VISIVEL) return');
      const primeiroAwait = corpo.indexOf('await');
      // A recusa vem antes do primeiro await: endpoint oculto não deve nem
      // tocar sessão ou banco.
      expect(recusa, nome).toBeGreaterThan(-1);
      expect(recusa, nome).toBeLessThan(primeiroAwait);
    }
  });
});
