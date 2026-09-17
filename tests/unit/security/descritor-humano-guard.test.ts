// Guard: descritor mostrado ao COLABORADOR passa por `descritorParaHumano`.
//
// 🔴 Por que existe (medido 16/08/2026, Ibipeba): parte dos descritores traz o
// código da matriz colado no texto — `COO03_D6 — Busca de apoio` — enquanto os
// de outro cargo, na MESMA competência, não. São 79 de 648 itens de plano. O
// campo é o assunto da semana, então ele aparece no título da tela, no PDF e na
// mensagem do WhatsApp. Nenhuma dessas superfícies tem revisão antes de chegar
// na pessoa.
//
// 🔴 E O GUARD TINHA TRÊS BURACOS (17/09/2026): o dono achou
// "COO03_D1 — Consciência de limites" no PDF da temporada concluída, código que
// "nunca pode aparecer". O PDF mora em `lib/`, fora das áreas varridas; o padrão
// `app/dashboard/**/*.tsx` do git não casa arquivo na RAIZ da pasta (a home,
// `app/dashboard/page.tsx`, também mostrava o campo cru); e a linha do tempo da
// temporada escrevia `{s.descritor || t(…)}` numa linha SEM tag, que a régua
// descartava. Os três estão cobertos abaixo, cada um com o seu caso.
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
const AREAS = ['app/dashboard/', 'components/pdf/', 'components/temporada/', 'lib/temporada-concluida-pdf.tsx'];

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

/**
 * A linha exibe o descritor CRU?
 *   1. JSX com tag na mesma linha: `<p>{d.descritor}</p>`;
 *   2. expressão filha SOZINHA na linha (JSX quebrado em várias linhas):
 *      `{s.descritor || t(…)}`;
 *   3. atributo que o navegador MOSTRA: `title=`, `alt=`, `aria-label=`.
 */
function exibeDescritorCru(linha: string): boolean {
  if (/descritor(es)?ParaHumano/.test(linha)) return false;
  const codigo = jsxRenderizado(linha);
  if (codigo && TEXTO_JSX.test(codigo)) return true;
  const semComentario = linha.replace(/\/\/.*$/, '').trim();
  if (/^\{(?!\s*\/\*)[^:]*?\.descritor\b/.test(semComentario)) return true;
  return /\b(title|alt|aria-label)=\{[^}]*\.descritor\b/.test(linha);
}

function arquivos(): string[] {
  // Pathspec do git SEM glob mágico: `*` atravessa `/`, então `app/dashboard/*.tsx`
  // pega a raiz E as subpastas. O `**/` exigia uma subpasta e deixava a home de fora.
  return execSync('git ls-files -- "app/dashboard/*.tsx" "components/pdf/*.tsx" "components/temporada/*.tsx" "lib/temporada-concluida-pdf.tsx"', {
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
        if (exibeDescritorCru(linha)) violacoes.push(`${arq}:${i + 1}  ${linha.trim().slice(0, 110)}`);
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
    // os três buracos de 17/09: cada superfície entra na varredura
    for (const arq of ['app/dashboard/page.tsx', 'lib/temporada-concluida-pdf.tsx', 'components/temporada/relatorio-temporada-concluida.tsx']) {
      expect(lista, `${arq} fora da varredura`).toContain(arq);
    }
  });

  it('🔴 a régua separa EXIBIÇÃO das quatro formas que só carregam o valor', () => {
    // Exibe → tem que pegar
    expect(exibeDescritorCru('<p className="x">{d.descritor}</p>')).toBe(true);
    expect(exibeDescritorCru('<div className="x">{conv.icon} {d.descritor}</div>')).toBe(true);
    expect(exibeDescritorCru('<Text style={s.cardTitle}>{d.descritor}</Text>')).toBe(true);
    expect(exibeDescritorCru("            <Text style={s.eyebrow}>Semana {m.semana}{m.descritor ? ` · ${m.descritor}` : ''}</Text>")).toBe(true);
    expect(exibeDescritorCru("                  {s.descritor || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`)}")).toBe(true);
    expect(exibeDescritorCru("                  title={s.descritor || t(`type.${TIPO_LABEL_KEY[s.tipo] || 'episode'}`)}")).toBe(true);
    // Não exibe → não pode pegar (os quatro falsos positivos da 1ª execução)
    expect(exibeDescritorCru('{/* Bloco 1 — Comparativo por descritor */}')).toBe(false);
    expect(exibeDescritorCru('<ConteudoViewer descritor={entrega.descritor} semana={5} />')).toBe(false);
    expect(exibeDescritorCru("  : (conteudo ? [{ dia: 'semana', descritor: semana.descritor, conteudo }] : []);")).toBe(false);
    expect(exibeDescritorCru('function ConteudoViewer({ conteudo, competencia, descritor, pilula }) {')).toBe(false);
    // e a forma limpa, em qualquer posição
    expect(exibeDescritorCru("                  {descritorParaHumano(s.descritor) || t('x')}")).toBe(false);
    expect(exibeDescritorCru('{grupo.descritores.map((d, i) => (')).toBe(false);
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
