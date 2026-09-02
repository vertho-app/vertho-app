/**
 * A lista de P&D do relatório de custo tem que continuar verdadeira.
 *
 * 🔴 POR QUE ESTE GUARD (02/09/2026): o relatório semanal tira o P&D do bloco do
 * cliente, e o bloco do cliente é o número que vira preço. Uma frente que entra
 * em produção e continua na lista some do custo do tenant para sempre — o modo
 * de falha é um cliente cujo custo real é maior do que o relatório diz, sem
 * nenhum sintoma. O inverso (frente nova de P&D sem entrar na lista) só infla o
 * custo do tenant, o que alguém percebe.
 *
 * A régua tem duas portas (ver `lib/custo-ia/classificacao.ts`) e só uma delas é
 * verificável estaticamente: a do `source` é declarada em runtime por quem
 * dispara. Esta é a da FEATURE, que afirma "este motor não tem consumidor de
 * produção" — e é exatamente a afirmação que envelhece.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { describe, it, expect } from 'vitest';
import {
  FEATURES_DE_PD, MODULOS_DE_PD, SOURCES_DE_MEDICAO, frenteDePD, naturezaDaLinha,
} from '@/lib/custo-ia/classificacao';

const RAIZ = process.cwd();
const DIRS = ['app', 'actions', 'lib', 'trigger', 'components'];

/** Todo `.ts`/`.tsx` de produção, com o conteúdo. Scripts e testes ficam fora de propósito. */
function arquivosDeProducao(): Map<string, string> {
  const out = new Map<string, string>();
  const varrer = (dir: string) => {
    let entradas: string[];
    try { entradas = readdirSync(dir); } catch { return; }
    for (const nome of entradas) {
      if (nome === 'node_modules' || nome.startsWith('.')) continue;
      const p = join(dir, nome);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) varrer(p);
      else if (/\.(ts|tsx)$/.test(nome)) {
        const rel = p.slice(RAIZ.length + 1).replace(/\\/g, '/');
        try { out.set(rel, readFileSync(p, 'utf-8')); } catch { /* ignora ilegível */ }
      }
    }
  };
  for (const d of DIRS) varrer(join(RAIZ, d));
  return out;
}

const producao = arquivosDeProducao();

function resolverImport(deQuem: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) {
    base = resolve(dirname(join(RAIZ, deQuem)), spec).slice(RAIZ.length + 1).replace(/\\/g, '/');
  } else return null;
  for (const suf of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
    if (producao.has(base + suf)) return base + suf;
  }
  return null;
}

/** alvo → quem o importa (só dentro de produção). */
function grafoInverso(): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const [arq, src] of producao) {
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const alvo = resolverImport(arq, m[1]);
      if (!alvo) continue;
      if (!g.has(alvo)) g.set(alvo, new Set());
      g.get(alvo)!.add(arq);
    }
  }
  return g;
}

const importadoPor = grafoInverso();

function ehPontoDeEntrada(f: string): string | null {
  if (f.startsWith('trigger/')) return 'task';
  if (f.startsWith('actions/')) return 'action';
  if (f.startsWith('app/') && /\/route\.tsx?$/.test(f)) return 'rota';
  if (f.startsWith('app/') && /\/(page|layout)\.tsx?$/.test(f)) return 'tela';
  if (f.startsWith('app/') && /actions\.tsx?$/.test(f)) return 'action';
  return null;
}

/** Pontos de entrada de produção que alcançam `arquivo`, subindo os imports. */
function entradasQueAlcancam(arquivo: string): string[] {
  const visto = new Set([arquivo]);
  const fila = [arquivo];
  const achados: string[] = [];
  while (fila.length) {
    const at = fila.shift()!;
    const tipo = ehPontoDeEntrada(at);
    // O próprio relatório de custo importa `classificacao.ts`, e ele É alcançável
    // por produção (o cron). Isso não torna a FRENTE alcançável — por isso a
    // varredura parte do módulo do motor, não da lista.
    if (tipo && at !== arquivo) { achados.push(`${tipo}:${at}`); continue; }
    for (const pai of importadoPor.get(at) || []) {
      if (!visto.has(pai)) { visto.add(pai); fila.push(pai); }
    }
  }
  return achados;
}

describe('Guard: a lista de P&D do relatório de custo', () => {
  it('o inventário de produção foi lido (senão este guard não prova nada)', () => {
    // Sem esta asserção, uma varredura que devolvesse zero arquivo faria todo
    // módulo parecer inalcançável e o guard passaria verde sem olhar nada.
    expect(producao.size).toBeGreaterThan(500);
    expect(importadoPor.size).toBeGreaterThan(200);
    expect(MODULOS_DE_PD.length).toBeGreaterThan(0);
  });

  it('🔴 nenhum módulo de P&D é alcançável por rota, action ou task', () => {
    const violacoes: string[] = [];
    for (const modulo of MODULOS_DE_PD) {
      const arquivos = [...producao.keys()].filter((f) => f.startsWith(modulo));
      // Alvo morto reporta verde: se o módulo sumiu ou mudou de lugar, a
      // afirmação "não tem consumidor" deixou de ser sobre alguma coisa.
      expect(arquivos.length, `MODULOS_DE_PD aponta para "${modulo}", que não existe mais`).toBeGreaterThan(0);
      for (const arq of arquivos) {
        const entradas = entradasQueAlcancam(arq);
        if (entradas.length) violacoes.push(`${arq} ← ${entradas.slice(0, 3).join(', ')}`);
      }
    }
    expect(
      violacoes,
      'Estes módulos estão classificados como P&D no relatório de custo, mas JÁ têm consumidor de '
      + 'produção. Enquanto seguirem na lista, o custo deles some do bloco do cliente e o número '
      + 'que vira preço fica menor que a realidade:\n  ' + violacoes.join('\n  '),
    ).toEqual([]);
  });

  it('toda feature da lista pertence a um módulo declarado ou é do simulador', () => {
    // Impede que alguém acrescente uma feature à lista sem dizer onde ela mora —
    // que é como a lista deixaria de ser verificável.
    const semModulo = Object.keys(FEATURES_DE_PD).filter((f) => {
      const donos = [...producao].filter(([, s]) => s.includes(`'${f}'`)).map(([a]) => a);
      if (!donos.length) return false; // só existe em script: fora do alcance deste guard
      return !donos.some((d) => MODULOS_DE_PD.some((m) => d.startsWith(m)) || d.includes('simulador'));
    });
    expect(
      semModulo,
      `features em FEATURES_DE_PD cujo call-site de produção não está em MODULOS_DE_PD: ${semModulo.join(', ')}`,
    ).toEqual([]);
  });
});

describe('a régua em si', () => {
  it('o source de medição vence, e a feature cobre o source default', () => {
    expect(naturezaDaLinha('ia3_check', 'simulator')).toBe('pd');
    expect(naturezaDaLinha('cena_turno', 'wrapper')).toBe('pd');
    expect(naturezaDaLinha('ia3_check', 'wrapper')).toBe('operacao');
  });

  it('🔴 `cenarios_b` é operação, não P&D', () => {
    // Em SQL o `_` do LIKE é curinga: `cena_%` casa `cenarios_b` e
    // `cenarios_b_check`, que são o fechamento da trilha. A régua é lista
    // explícita justamente por isso — o erro custou US$ 2,78 de P&D inflado
    // numa medição de 02/09 antes de eu conferir feature a feature.
    expect(naturezaDaLinha('cenarios_b', 'wrapper')).toBe('operacao');
    expect(naturezaDaLinha('cenarios_b_check', 'wrapper')).toBe('operacao');
    expect(naturezaDaLinha('cena_extracao', 'wrapper')).toBe('pd');
  });

  it('a frente prefere a feature ao source, que é mais genérico', () => {
    expect(frenteDePD('cena_turno', 'wrapper')).toBe('Modo Cena');
    expect(frenteDePD('pdi_experimento', 'experimento')).toBe('PDI (experimento)');
    expect(frenteDePD('qualquer_coisa', 'eval')).toBe(SOURCES_DE_MEDICAO.eval);
  });
});
