// Guard: descritor mostrado ao COLABORADOR passa por `descritorParaHumano`.
//
// 🔴 Por que existe (medido 16/08/2026, Ibipeba): parte dos descritores traz o
// código da matriz colado no texto — `COO03_D6 — Busca de apoio` — enquanto os
// de outro cargo, na MESMA competência, não. São 79 de 648 itens de plano. O
// campo é o assunto da semana, então ele aparece no título da tela, no PDF e na
// mensagem do WhatsApp. Nenhuma dessas superfícies tem revisão antes de chegar
// na pessoa.
//
// 🔑 A RÉGUA QUE ESTE GUARD CODIFICA: limpar na EXIBIÇÃO, nunca no dado nem em
// quem CASA. O `descritor` cru é a chave que resolve kit e vídeo
// (`resolverVideoDaSemana`) — por isso `descritor={entrega.descritor}` como
// ATRIBUTO é correto e não é violação, e `>{entrega.descritor}<` como TEXTO é.
// A diferença entre as duas formas é o que o guard mede.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { descritorParaHumano, descritoresParaHumano } from '@/lib/descritor-humano';

const RAIZ = process.cwd();

/** Superfícies que o COLABORADOR vê. Admin fica fora: lá o código desambigua. */
const AREAS = ['app/dashboard/', 'components/pdf/'];

/**
 * Reduz a linha ao que é RENDERIZADO, e devolve `''` quando não há JSX.
 *
 * Quatro formas contêm `{…descritor…}` e **não** são exibição — todas apareceram
 * na primeira execução deste guard, e cada uma justifica um passo:
 *   `{/* comentário *​/}`                        → comentário
 *   `descritor={entrega.descritor}`             → passa o valor CRU adiante, que
 *                                                 é o certo (casa vídeo/kit)
 *   `{ …, descritor: semana.descritor, … }`     → literal de objeto
 *   `function X({ competencia, descritor })`    → destructuring de parâmetro
 *
 * As duas últimas caem pela ausência de tag JSX na linha; as duas primeiras são
 * removidas antes.
 */
function jsxRenderizado(linha: string): string {
  const semComentario = linha.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\/.*$/, '');
  const semAtributo = semComentario.replace(/[\w-]+=\{[^{}]*\}/g, '');
  return /<[a-zA-Z]/.test(semAtributo) ? semAtributo : '';
}

const TEXTO_JSX = /\{[^{}]*\bdescritor\b[^{}]*\}/;

function arquivos(): string[] {
  return execSync('git ls-files "app/dashboard/**/*.tsx" "components/pdf/**/*.tsx"', {
    cwd: RAIZ, encoding: 'utf8',
  }).split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('descritor que o colaborador lê', () => {
  it('🔴 nenhuma tela do colaborador renderiza o descritor CRU', () => {
    const violacoes: string[] = [];

    for (const arq of arquivos()) {
      if (!AREAS.some((a) => arq.startsWith(a))) continue;
      const linhas = readFileSync(join(RAIZ, arq), 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        const codigo = jsxRenderizado(linha);
        if (!codigo || !TEXTO_JSX.test(codigo)) return;
        if (/descritor(es)?ParaHumano/.test(codigo)) return;
        violacoes.push(`${arq}:${i + 1}  ${linha.trim().slice(0, 110)}`);
      });
    }

    expect(violacoes, `Renderize com descritorParaHumano() — o valor CRU só serve para casar kit/vídeo:\n${violacoes.join('\n')}`)
      .toEqual([]);
  });

  it('o guard OLHA alguma coisa — senão passaria com o diretório vazio', () => {
    // A classe nº 1 de guard inútil: varrer zero arquivo e reportar verde.
    const lista = arquivos().filter((a) => AREAS.some((x) => a.startsWith(x)));
    expect(lista.length).toBeGreaterThan(10);
    const comDescritor = lista.filter((a) => readFileSync(join(RAIZ, a), 'utf8').includes('descritor'));
    expect(comDescritor.length).toBeGreaterThan(0);
  });

  it('🔴 a régua separa EXIBIÇÃO das quatro formas que só carregam o valor', () => {
    const exibe = (l: string) => {
      const c = jsxRenderizado(l);
      return !!c && TEXTO_JSX.test(c);
    };
    // Exibe → tem que pegar
    expect(exibe('<p className="x">{d.descritor}</p>')).toBe(true);
    expect(exibe('<div className="x">{conv.icon} {d.descritor}</div>')).toBe(true);
    // Não exibe → não pode pegar (os quatro falsos positivos da 1ª execução)
    expect(exibe('{/* Bloco 1 — Comparativo por descritor */}')).toBe(false);
    expect(exibe('<ConteudoViewer descritor={entrega.descritor} semana={5} />')).toBe(false);
    expect(exibe("  : (conteudo ? [{ dia: 'semana', descritor: semana.descritor, conteudo }] : []);")).toBe(false);
    expect(exibe('function ConteudoViewer({ conteudo, competencia, descritor, pilula }) {')).toBe(false);
  });
});

describe('lista de descritores (semanas DUO)', () => {
  it('limpa item a item e preserva a ordem', () => {
    expect(descritoresParaHumano(['COO03_D1 — Consciência de limites', 'Busca de apoio e rede']))
      .toEqual(['Consciência de limites', 'Busca de apoio e rede']);
  });

  it('entrada que não é lista devolve lista vazia, não quebra a tela', () => {
    expect(descritoresParaHumano(null)).toEqual([]);
    expect(descritoresParaHumano('COO03_D1 — x')).toEqual([]);
  });

  it('nulo e vazio não viram "null" na tela', () => {
    expect(descritorParaHumano(null)).toBe('');
    expect(descritorParaHumano(undefined)).toBe('');
  });
});
