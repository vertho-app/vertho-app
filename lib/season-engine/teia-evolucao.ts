/**
 * A TEIA do relatório de evolução — os comportamentos observáveis de uma
 * competência desenhados como radar, com o diagnóstico e o fechamento
 * SOBREPOSTOS (pedido do dono, 17/09/2026: "gráfico teia de aranha com os
 * descritores, com a primeira e segunda avaliação sobrepostas").
 *
 * 🔴 POR QUE O FIM TEM PISO NO INÍCIO
 * ───────────────────────────────────
 * Sobrepor as duas medições é, graficamente, o par de notas "2,0 → 2,3" que
 * saiu de todas as telas em 14/09 — e, onde a nota caiu, é um veredito de
 * regressão desenhado: a linha do fechamento entra para dentro da linha do
 * diagnóstico, sem número nenhum, mas visível. A régua do produto não afirma
 * isso (`avancoExibido` tem piso em zero; `agruparPorCompetencia` segura o
 * nível da competência com `Math.max`), porque a queda entre as duas conversas
 * é variação do instrumento (desvio 0,07, amplitude até 0,33 ao reler a MESMA
 * conversa, medido 09/09/2026) e não alguém que desaprendeu.
 *
 * `Medido: 17/09/2026` — nos 331 comportamentos gravados, 33 (10%) têm nota
 * final menor que a inicial, espalhados em 8 dos 47 relatórios. Sem o piso,
 * essas 8 pessoas abririam o relatório com um bico afundado no desenho, e o
 * texto ao lado diria "0,0 · Estável". O gráfico contradiria a régua no mesmo
 * papel.
 *
 * Com o piso, onde caiu as duas linhas se ENCOSTAM ("manteve o patamar", que é
 * o que a medição sustenta) e a área entre elas é exatamente o avanço exibido.
 *
 * Módulo PURO (só `descritorParaHumano`, que também é puro): serve ao PDF
 * (servidor, `@react-pdf/renderer`) e à tela ('use client', SVG inline) sem
 * que nenhum dos dois reimplemente a geometria — a lição de `convergencia.ts`,
 * onde a régua duplicada vazou para o documento da pessoa.
 */
import { descritorParaHumano } from '@/lib/descritor-humano';

/** A escala do comportamento observável: 1 no centro, 4 na borda. */
export const NOTA_MIN = 1;
export const NOTA_MAX = 4;

/**
 * Abaixo de 3 eixos não existe teia: com 2 o "polígono" é um segmento e com 1
 * é um ponto. `Medido: 17/09/2026` — 1 dos 58 grupos de competência gravados
 * tem 2 comportamentos; os outros 57 têm de 4 a 6.
 */
export const MIN_EIXOS = 3;

/** Anéis rotulados, nos níveis inteiros acima do centro. */
export const ANEIS = [2, 3, 4] as const;

export interface PontoTeia { x: number; y: number }

export interface EixoTeia {
  /** Já sem o código da matriz: é texto que a pessoa lê. */
  rotulo: string;
  /** O rótulo quebrado em linhas (SVG não quebra texto sozinho). */
  linhas: string[];
  /** Nota do diagnóstico, presa à escala. */
  inicio: number;
  /** Nota do fechamento COM PISO no início (ver o cabeçalho). */
  fim: number;
  /** O fechamento ficou abaixo do diagnóstico e foi segurado pelo piso. */
  segurouNoPiso: boolean;
  pontoInicio: PontoTeia;
  pontoFim: PontoTeia;
  /** Ponta do eixo (nota máxima), onde o raio termina. */
  vertice: PontoTeia;
  /** Onde ancorar o rótulo, já com folga além da ponta. */
  pontoRotulo: PontoTeia;
  ancora: 'start' | 'middle' | 'end';
}

export interface Teia {
  centro: PontoTeia;
  raio: number;
  eixos: EixoTeia[];
  /** `"x,y x,y …"` pronto para `points` de um polígono. */
  poligonoInicio: string;
  poligonoFim: string;
  aneis: { valor: number; pontos: string; rotuloEm: PontoTeia }[];
}

export interface OpcoesTeia {
  centro?: PontoTeia;
  raio?: number;
  /** Distância entre a ponta do eixo e o rótulo. */
  folgaRotulo?: number;
  /** Caracteres por linha do rótulo (o PDF cabe menos que a tela). */
  larguraRotulo?: number;
  /** Linhas de rótulo antes de cortar com reticências. */
  linhasRotulo?: number;
}

function nota(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Os comportamentos que entram na teia: só os que têm AS DUAS notas.
 * Comportamento sem uma delas fica de fora em vez de virar zero — ausência não
 * é nota 1 no centro (mesma guarda de `avancoExibido`).
 */
function medidos(descritores: any[] | null | undefined) {
  return (Array.isArray(descritores) ? descritores : [])
    .map((d) => ({ d, pre: nota(d?.nota_pre), pos: nota(d?.nota_pos) }))
    .filter((x): x is { d: any; pre: number; pos: number } => x.pre != null && x.pos != null);
}

/**
 * Vai haver teia para este conjunto? Fonte única para quem precisa decidir
 * LAYOUT antes de desenhar — o PDF prende o título da competência à teia
 * quando ela existe e ao primeiro card quando não existe.
 */
export function temTeia(descritores: any[] | null | undefined): boolean {
  return medidos(descritores).length >= MIN_EIXOS;
}

const naEscala = (n: number) => Math.min(NOTA_MAX, Math.max(NOTA_MIN, n));

/**
 * Quebra o rótulo em linhas sem cortar palavra. `<text>` de SVG (tanto o do
 * navegador quanto o do `@react-pdf/renderer`) NÃO quebra sozinho: sem isto o
 * rótulo sai numa linha só e invade o vizinho.
 *
 * `Medido: 17/09/2026` — os 335 descritores gravados têm mediana de 32 e máximo
 * de 47 caracteres, então duas linhas cobrem a base inteira sem reticências.
 */
export function quebrarRotulo(texto: string, largura = 22, maxLinhas = 2): string[] {
  const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const candidata = atual ? `${atual} ${p}` : p;
    if (candidata.length <= largura || !atual) {
      atual = candidata;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  // Estourou: a última linha visível termina em reticências, para o texto não
  // sumir sem sinal.
  const cortadas = linhas.slice(0, maxLinhas);
  const ultima = cortadas[maxLinhas - 1];
  cortadas[maxLinhas - 1] = `${ultima.slice(0, Math.max(1, largura - 1)).trimEnd()}…`;
  return cortadas;
}

/**
 * Monta a teia de um conjunto de comportamentos (tipicamente os de UMA
 * competência, na ordem em que o relatório os lista).
 *
 * Devolve `null` quando não há teia para desenhar: menos de `MIN_EIXOS`
 * comportamentos COM AS DUAS NOTAS. Comportamento sem uma das notas fica de
 * fora em vez de virar zero — ausência não é nota 1 no centro.
 */
export function montarTeia(descritores: any[] | null | undefined, opcoes: OpcoesTeia = {}): Teia | null {
  const centro = opcoes.centro ?? { x: 0, y: 0 };
  const raio = opcoes.raio ?? 100;
  const folga = opcoes.folgaRotulo ?? 14;
  const largura = opcoes.larguraRotulo ?? 22;
  const maxLinhas = opcoes.linhasRotulo ?? 2;

  const eixosMedidos = medidos(descritores);
  if (eixosMedidos.length < MIN_EIXOS) return null;

  const n = eixosMedidos.length;
  // Primeiro eixo no topo, sentido horário: é como se lê um relógio.
  const angulo = (i: number) => -Math.PI / 2 + (i / n) * 2 * Math.PI;
  const ponto = (valor: number, i: number): PontoTeia => {
    const a = angulo(i);
    const r = ((naEscala(valor) - NOTA_MIN) / (NOTA_MAX - NOTA_MIN)) * raio;
    return { x: centro.x + r * Math.cos(a), y: centro.y + r * Math.sin(a) };
  };

  const eixos: EixoTeia[] = eixosMedidos.map(({ d, pre, pos }, i) => {
    const inicio = naEscala(pre);
    // 🔴 O PISO. Mesma decisão de `avancoExibido`: a régua não afirma queda, o
    // desenho também não.
    const fim = naEscala(Math.max(pre, pos));
    const a = angulo(i);
    const rotulo = descritorParaHumano(d?.descritor);
    const cos = Math.cos(a);
    return {
      rotulo,
      linhas: quebrarRotulo(rotulo, largura, maxLinhas),
      inicio,
      fim,
      segurouNoPiso: pos < pre,
      pontoInicio: ponto(inicio, i),
      pontoFim: ponto(fim, i),
      vertice: ponto(NOTA_MAX, i),
      pontoRotulo: {
        x: centro.x + (raio + folga) * cos,
        y: centro.y + (raio + folga) * Math.sin(a),
      },
      // Quase em cima do eixo vertical o rótulo é centrado; dos lados ele se
      // afasta do desenho, senão passa por cima da teia.
      ancora: Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end',
    };
  });

  const pontos = (pegar: (e: EixoTeia) => PontoTeia) =>
    eixos.map((e) => { const p = pegar(e); return `${arred(p.x)},${arred(p.y)}`; }).join(' ');

  return {
    centro,
    raio,
    eixos,
    poligonoInicio: pontos((e) => e.pontoInicio),
    poligonoFim: pontos((e) => e.pontoFim),
    aneis: ANEIS.map((valor) => ({
      valor,
      pontos: eixos.map((_, i) => { const p = ponto(valor, i); return `${arred(p.x)},${arred(p.y)}`; }).join(' '),
      // O número do anel vai no eixo de cima, deslocado para não pisar na linha.
      rotuloEm: ponto(valor, 0),
    })),
  };
}

/** Duas casas bastam para o SVG e deixam o `points` legível no teste. */
function arred(v: number): number {
  return Math.round(v * 100) / 100;
}
