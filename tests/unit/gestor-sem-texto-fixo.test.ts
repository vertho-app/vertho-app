/**
 * R-67 (04/10/2026): nas telas e ações do gestor e do RH, texto visível mora no catálogo (`messages/*.json`,
 * 4 idiomas) e erro de action é um CÓDIGO. Este guard varre a FONTE (sem comentários) e falha se voltar:
 *
 *  1. literal de string ou texto de JSX em português (letra acentuada ou palavra típica) nos arquivos de tela;
 *  2. `error: '<texto>'` em português nas actions, que a tela mostraria como veio;
 *  3. `console.*` fica de fora: o log é do time, em português de propósito.
 *
 * Os arquivos entram na lista quando migram; a lista só cresce. Dado do banco (nome, cargo, competência)
 * não é literal no código, então não aparece aqui.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { semComentarios } from '../helpers/fonte';

const TELAS = [
  'app/dashboard/gestor/page.tsx',
  'app/dashboard/gestor/equipe-evolucao/page.tsx',
  'app/dashboard/gestor/engajamento/team-engagement.tsx',
  'components/engajamento/signal-journey.tsx',
  'components/engajamento/qualidade-evidencia.tsx',
];

const ACOES = [
  'app/dashboard/gestor/actions.ts',
  'app/dashboard/gestor/equipe-evolucao/actions.ts',
];

const ACENTO = /[àáâãçéêíóôõúüÀÁÂÃÇÉÊÍÓÔÕÚ]/;
const PALAVRA = /\b(não|nao|você|jornada|equipe|liderados?|colaboradores?|semanas?|pessoas?|entreg\w+|evidência|sinais|etapa|nenhum\w*|ainda|carregando|tente)\b/i;
/** Palavra de ligação do português: texto de JSX (que não deve ter texto fixo nenhum) com uma delas é frase. */
const LIGACAO = /\b(de|do|da|dos|das|em|no|na|ao|ou|que|um|uma|com|sem|para|por)\b/i;

/** Os textos em português que o código escreve: literais de string e texto de JSX, sem `console.*`. */
function textosEmPortugues(fonte: string): string[] {
  const codigo = semComentarios(fonte)
    .split('\n')
    .filter((l) => !/console\.(error|warn|log|info)/.test(l))
    .join('\n');
  const achados: string[] = [];
  for (const m of codigo.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    // `${...}` é expressão, não texto: só o que sobra é frase.
    const t = m[2].replace(/\$\{[^}]*\}/g, ' ').trim();
    if (t.length < 3 || /^[\w./:@#-]+$/.test(t)) continue;
    if (ACENTO.test(t) || (/\s/.test(t) && PALAVRA.test(t))) achados.push(t.slice(0, 80));
  }
  // `(?<![=\-])>`: o `>` de `=>` e de `->` não abre texto de JSX; e texto de JSX não tem `;`, `(` nem `)`.
  for (const m of codigo.matchAll(/(?<![=\-])>([^<>{}=;\n][^<>{}]*)(?=[<{])/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (/[;()]/.test(t)) continue;
    if (t.length >= 2 && (ACENTO.test(t) || PALAVRA.test(t) || LIGACAO.test(t))) achados.push(`JSX: ${t.slice(0, 80)}`);
  }
  return achados;
}

describe('telas do gestor e do RH: nenhum texto fixo em português', () => {
  it.each(TELAS)('%s', (arquivo) => {
    expect(textosEmPortugues(readFileSync(arquivo, 'utf8'))).toEqual([]);
  });

  it('o detector enxerga um literal e um texto de JSX em português (não passa por estar cego)', () => {
    expect(textosEmPortugues("const t = 'Jornada concluída';")).toEqual(['Jornada concluída']);
    expect(textosEmPortugues('const x = <p className="a">Nenhuma pessoa encontrada</p>;')).toEqual(['JSX: Nenhuma pessoa encontrada']);
    // comentário e log ficam de fora de propósito
    expect(textosEmPortugues("// Não autenticado\nconsole.error('[gestor] não leu:', e);")).toEqual([]);
  });
});

describe('actions do gestor: erro é código, nunca frase em português', () => {
  it.each(ACOES)('%s', (arquivo) => {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    // `error: 'texto'`, `error: \`texto\``, ou `{ error: error.message }` devolvido à tela
    const frases = [...fonte.matchAll(/\berror:\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
    expect(frases).toEqual([]);
    expect(fonte).not.toMatch(/return\s*\{[^}]*\berror:\s*\w+\??\.message/);
    expect(fonte).not.toContain('MENSAGEM_INDISPONIVEL');
  });
});
