/**
 * Parser de manuscrito autoral (DOCX) → Módulos-Base.
 *
 * 100% DETERMINÍSTICO. Nunca chama IA. Se o DOCX não segue o padrão, lança erro
 * claro — não adivinha.
 *
 * ── Anatomia do manuscrito ──────────────────────────────────────────────────
 * Um manuscrito cobre UMA competência e traz um capítulo por descritor. Dentro
 * do capítulo, cada seção é um "microbloco" (MB) com cabeçalho canônico:
 *
 *   {cargo} | {cod_comp} | {nome_descritor} | ID: {cod_comp}_MB{nn} | {ação}
 *
 * ── O nível está codificado no NÚMERO do microbloco ─────────────────────────
 * Os MBs são numerados em FAIXAS, uma por nível da régua. Com 6 descritores e 2
 * MBs por faixa (amostra SED08, 54 MBs):
 *
 *   MB 01-12 → faixa N1   ("Reconhecer o gap" / "Identificar evidências")
 *   MB 13-24 → faixa N2   ("Estruturar rotina" / "Aplicar critério")
 *   MB 25-36 → faixa N3   ("Conduzir com consistência" / "Aprimorar a prática")
 *   MB 37-48 → faixa N4   ("Transformar em referência" / "Transferir método")
 *   MB 49-54 → síntese    ("Consolidar em ciclo real"), 1 por descritor
 *
 * Dentro de uma faixa, os MBs avançam de descritor em descritor. Logo:
 *
 *   MB = (faixa-1) × tamanhoFaixa + (descritor-1) × mbsPorFaixa + k
 *   MB da síntese = 4 × tamanhoFaixa + descritor
 *
 * O parser DERIVA `mbsPorFaixa` da contagem (não hardcoda 2) e depois CONFERE a
 * numeração inteira contra a fórmula. Se um único MB não cair no lugar previsto,
 * é erro — porque significa que o manuscrito não segue a convenção e qualquer
 * fatiamento seria silenciosamente errado.
 *
 * ── Um módulo = um par de faixas adjacentes (+ síntese) ─────────────────────
 * A transição N2→N3 precisa do ponto de partida (faixa N2) e do destino (N3). A
 * faixa do meio é compartilhada por duas transições — o destino de um módulo é o
 * ponto de partida do próximo. A síntese entra nas três: ela ancora o exemplo
 * integrado ("um ciclo completo de..."), não a profundidade.
 *
 * Resultado: 3 transições × N descritores módulos por manuscrito (18, no SED08).
 */

/** Nível da régua de maturidade. */
export type Nivel = 'N1' | 'N2' | 'N3' | 'N4';

/** Faixa de numeração a que um microbloco pertence. */
export type Faixa = Nivel | 'SINTESE';

/** As três transições possíveis, sempre de 1 nível de diferença. */
export const TRANSICOES: ReadonlyArray<readonly [Nivel, Nivel]> = [
  ['N1', 'N2'],
  ['N2', 'N3'],
  ['N3', 'N4'],
] as const;

export interface Microbloco {
  /** "SED08_MB01" */
  id: string;
  /** 1..54 */
  num: number;
  /** Título editorial da seção ("O técnico que só aparece na crise"). */
  titulo: string;
  /** Nome do descritor, como escrito no cabeçalho. */
  descritor: string;
  /** Ação declarada ("Reconhecer o gap em presença junto às unidades"). */
  acao: string;
  faixa: Faixa;
  /** Corpo do microbloco, do cabeçalho até o próximo (ou até a Síntese). */
  texto: string;
  chars: number;
}

export interface Transicao {
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  /** IDs dos MBs que compõem a fonte, em ordem de documento. */
  microblocos: string[];
  /** Texto concatenado — é o que vai no user prompt da autora. */
  textoFonte: string;
  chars: number;
}

export interface DescritorGroup {
  /** 1-based, na ordem de aparição no manuscrito. */
  indice: number;
  descritor: string;
  microblocos: Microbloco[];
  transicoes: Transicao[];
}

export interface RecursoExterno {
  tipo: string;
  titulo: string;
  fonte: string;
  link: string;
  conexaoFormativa: string;
  observacoes: string;
}

export interface ManuscritoParseResult {
  /** "SED08" */
  cod_comp: string;
  /** "Gestor Educacional" — como o manuscrito nomeia o cargo. */
  cargo: string;
  /** "O Técnico que Acompanha" */
  titulo: string;
  subtitulo: string;
  descritores: DescritorGroup[];
  /** Texto de fechamento do manuscrito. Guardado, não usado na autoria. */
  sintese: string;
  recursos: RecursoExterno[];
  stats: {
    totalMicroblocos: number;
    totalDescritores: number;
    mbsPorFaixa: number;
    /** 3 × totalDescritores */
    modulosPrevistos: number;
    charsUteis: number;
    charsDescartados: number;
  };
  avisos: string[];
}

/**
 * Cabeçalho do microbloco. Tolera as convenções observadas nos manuscritos:
 *  - separador `|` (SED) ou `·` (DIR/COO)
 *  - ação após ` | `/` · ` (SED), COLADA no ID (`ID: DIR09_MB01Reconhecer…`),
 *    ou ausente na linha (COO03 — a ação vem no corpo). Por isso o 5º grupo é
 *    opcional; quando vazio, cai-se no título editorial da linha anterior.
 */
const RE_CABECALHO =
  /^(.+?)\s*[|·]\s*([A-Z]{2,5}\d{2})\s*[|·]\s*(.+?)\s*[|·]\s*ID:\s*([A-Z]{2,5}\d{2}_MB\d{2,3})\s*(?:[|·]\s*)?(.*)$/gim;

/** "Manuscrito-base · Gestor Educacional · SED08" (· ou - ou |). */
const RE_CAPA = /Manuscrito[- ]base\s*[·\-|]\s*(.+?)\s*[·\-|]\s*([A-Z]{2,5}\d{2})\s*$/im;

/** Início da cauda não-conteúdo. Só vale a ocorrência DEPOIS do último MB. */
const RE_CAUDA = /^\s*S[íi]ntese\b.*$/gim;

/** Fim da síntese: o que vem depois é bibliografia/apêndice. */
const RE_POS_SINTESE = /^\s*(Bibliografia|Refer[êe]ncias|Ap[êe]ndice)\b.*$/gim;

export async function parsearManuscrito(buffer: Buffer): Promise<ManuscritoParseResult> {
  const { default: mammoth } = await import('mammoth');
  const raw = (await mammoth.extractRawText({ buffer })).value || '';
  if (!raw.trim()) throw new Error('DOCX vazio ou ilegível.');

  const avisos: string[] = [];
  const cabecalhos = [...raw.matchAll(RE_CABECALHO)];
  if (cabecalhos.length === 0) {
    throw new Error(
      'Nenhum microbloco encontrado. O DOCX precisa ter cabeçalhos no padrão ' +
        '"Cargo | COD | Descritor | ID: COD_MBnn | Ação".',
    );
  }

  // ── Cauda: Síntese/Bibliografia/Apêndice não são conteúdo de módulo ────────
  // Sem isto, o ÚLTIMO microbloco engole tudo que vem depois dele.
  const fimUltimoMB = cabecalhos[cabecalhos.length - 1].index!;
  const cauda = [...raw.matchAll(RE_CAUDA)].find((m) => m.index! > fimUltimoMB);
  const fimConteudo = cauda ? cauda.index! : raw.length;
  if (!cauda) avisos.push('Seção "Síntese" não encontrada — o último microbloco pode conter a bibliografia.');

  const posSintese = [...raw.matchAll(RE_POS_SINTESE)].find((m) => m.index! > fimConteudo);
  const fimDaSintese = posSintese ? posSintese.index! : raw.length;

  // ── Metadados da capa ─────────────────────────────────────────────────────
  const capa = raw.match(RE_CAPA);
  const linhas = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const titulo = linhas[0] || '(sem título)';
  const subtitulo = linhas[1] && !RE_CAPA.test(linhas[1]) ? linhas[1] : '';

  const cod_comp = capa?.[2] || cabecalhos[0][2];
  const cargo = capa?.[1] || cabecalhos[0][1];
  if (!capa) avisos.push('Linha de capa "Manuscrito-base · Cargo · COD" não encontrada; metadados vieram do 1º cabeçalho.');

  // ── Microblocos ───────────────────────────────────────────────────────────
  const parciais = cabecalhos.map((m, i) => {
    const inicioCorpo = m.index! + m[0].length;
    const fimCorpo = i + 1 < cabecalhos.length ? cabecalhos[i + 1].index! : fimConteudo;
    // Título editorial = última linha não-vazia antes do cabeçalho.
    const antes = raw.slice(Math.max(0, m.index! - 400), m.index!).split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      id: m[4],
      num: Number(m[4].split('_MB')[1]),
      titulo: antes[antes.length - 1] || '',
      descritor: m[3].trim(),
      acao: (m[5] || '').trim(),
      texto: raw.slice(m.index!, Math.max(inicioCorpo, fimCorpo)),
    };
  });

  const total = parciais.length;

  // ── Agrupa por rótulo de descritor (ordem de aparição) ────────────────────
  const grupos = new Map<string, typeof parciais>();
  for (const p of parciais) {
    if (!grupos.has(p.descritor)) grupos.set(p.descritor, []);
    grupos.get(p.descritor)!.push(p);
  }
  const contiguo = (nums: number[]) => Math.max(...nums) - Math.min(...nums) + 1 === nums.length;

  // ── Esquema de numeração ──────────────────────────────────────────────────
  // SEQUENCIAL (COO06): cada descritor é um intervalo contíguo de MBs (1-9, 10-18…).
  //   O último MB do bloco é a síntese daquele descritor.
  // POR-FAIXA (SED08/DIR09/COO03): os MBs de um descritor saltam entre faixas
  //   (1,2,13,14,25,26,37,38) — o grupo NÃO é contíguo. A síntese (49-54) pode
  //   vir junto (SED08, rótulo = descritor) ou como seção "INTEGRAÇÃO" à parte
  //   (DIR09/COO03, grupo contíguo no topo, rótulo distinto → excluída).
  const gruposArr = [...grupos.entries()].map(([nome, mbs]) => ({
    nome, mbs, nums: mbs.map((m) => m.num), cont: contiguo(mbs.map((m) => m.num)),
  }));
  const sequencial = gruposArr.every((g) => g.cont);

  // Descritores principais vs seção de integração.
  let principais: typeof gruposArr;
  if (sequencial) {
    principais = gruposArr;
  } else {
    // Por-faixa: a seção de integração é um grupo contíguo cujos números ficam
    // TODOS acima dos MBs de faixa dos descritores reais.
    const maxFaixa = Math.max(...gruposArr.filter((g) => !g.cont).flatMap((g) => g.nums));
    principais = gruposArr.filter((g) => !(g.cont && Math.min(...g.nums) > maxFaixa));
    const integracao = gruposArr.filter((g) => g.cont && Math.min(...g.nums) > maxFaixa);
    if (integracao.length) {
      avisos.push(`Seção de integração ("${integracao.map((g) => g.nome).join('", "')}", ${integracao.reduce((n, g) => n + g.mbs.length, 0)} MBs) tratada como nível-competência — não entra nas transições por descritor.`);
    }
  }

  const nDesc = principais.length;
  if (nDesc < 4) throw new Error(`Apenas ${nDesc} descritores principais encontrados (esperado ~6). O DOCX foge da convenção.`);

  // ── Faixa por POSIÇÃO dentro do descritor (unifica os dois esquemas) ───────
  // Ordenados: ranks 0..7 = N1,N1,N2,N2,N3,N3,N4,N4; rank 8 (se houver) = síntese.
  const tamanhos = [...new Set(principais.map((g) => g.mbs.length))];
  if (tamanhos.length !== 1) {
    throw new Error(`Descritores com nº de MBs diferentes (${tamanhos.join(',')}). A convenção do manuscrito não é uniforme.`);
  }
  const perDesc = tamanhos[0];
  const temSintese = perDesc % 4 === 1;                 // 9 = 8 faixa + 1 síntese; 8 = sem
  if (!temSintese && perDesc % 4 !== 0) {
    throw new Error(`Cada descritor tem ${perDesc} MBs — não fecha em (4 faixas × k) [+1 síntese]. Verifique o DOCX.`);
  }
  const mbsPorFaixa = Math.floor(perDesc / 4);
  const FAIXAS = ['N1', 'N2', 'N3', 'N4'] as const;

  const microblocos: Microbloco[] = [];
  const doDescOrdenado = new Map<string, Microbloco[]>();
  principais.forEach((g) => {
    const ordenados = [...g.mbs].sort((a, b) => a.num - b.num);
    const lista: Microbloco[] = ordenados.map((p, rank) => ({
      ...p,
      faixa: (temSintese && rank === perDesc - 1 ? 'SINTESE' : FAIXAS[Math.floor(rank / mbsPorFaixa)]) as Faixa,
      chars: p.texto.length,
    }));
    doDescOrdenado.set(g.nome, lista);
    microblocos.push(...lista);
  });

  // ── Agrupa por descritor e monta as três transições ───────────────────────
  const descritores: DescritorGroup[] = principais.map((g, i) => {
    const nome = g.nome;
    const doDesc = doDescOrdenado.get(nome)!;
    const transicoes = TRANSICOES.map(([ne, nd]) => {
      // Faixa de entrada + faixa de destino + a síntese (âncora do exemplo integrado).
      const sel = doDesc.filter((m) => m.faixa === ne || m.faixa === nd || m.faixa === 'SINTESE');
      const textoFonte = sel.map((m) => m.texto).join('\n\n');
      return {
        nivel_entrada: ne,
        nivel_destino: nd,
        microblocos: sel.map((m) => m.id),
        textoFonte,
        chars: textoFonte.length,
      };
    });
    return { indice: i + 1, descritor: nome, microblocos: doDesc, transicoes };
  });

  // ── Avisos (não bloqueiam) ────────────────────────────────────────────────
  if (nDesc !== 6) avisos.push(`${nDesc} descritores principais (esperado: 6).`);
  avisos.push(`Esquema ${sequencial ? 'sequencial' : 'por-faixa'}, ${perDesc} MBs/descritor${temSintese ? ' (c/ síntese)' : ' (s/ síntese própria)'}.`);
  for (const g of descritores) {
    const magra = g.transicoes.find((t) => t.chars < 2000);
    if (magra) avisos.push(`Descritor "${g.descritor}" tem pouco conteúdo em ${magra.nivel_entrada}→${magra.nivel_destino} (${magra.chars} chars).`);
  }

  const charsUteis = microblocos.reduce((a, m) => a + m.chars, 0);

  return {
    cod_comp,
    cargo,
    titulo,
    subtitulo,
    descritores,
    sintese: cauda ? raw.slice(fimConteudo, fimDaSintese).trim() : '',
    recursos: await parsearRecursos(buffer),
    stats: {
      totalMicroblocos: microblocos.length,
      totalDescritores: nDesc,
      mbsPorFaixa,
      modulosPrevistos: nDesc * TRANSICOES.length,
      charsUteis,
      charsDescartados: raw.length - charsUteis,
    },
    avisos,
  };
}

/**
 * Tabela de recursos externos do apêndice. Só o `convertToHtml` preserva
 * `<table>` — o `extractRawText` achata tudo em linhas soltas.
 *
 * Falha em silêncio (retorna []): o apêndice é bônus, não bloqueia a importação.
 */
async function parsearRecursos(buffer: Buffer): Promise<RecursoExterno[]> {
  try {
    const { default: mammoth } = await import('mammoth');
    const html = (await mammoth.convertToHtml({ buffer })).value || '';

    // A primeira tabela DEPOIS do apêndice de recomendações. (O manuscrito também
    // tem um "Apêndice — Mapa dos microblocos", que não interessa.)
    const ancora = html.search(/Ap[êe]ndice[^<]*Recomenda/i);
    const tabela = (ancora >= 0 ? html.slice(ancora) : html).match(/<table[\s\S]*?<\/table>/i);
    if (!tabela) return [];

    const linhas = [...tabela[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((tr) =>
      [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((td) =>
        td[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
      ),
    );
    if (linhas.length < 2) return [];

    const link = (celulas: string[]) => celulas.find((c) => /^https?:\/\//i.test(c)) || '';
    return linhas
      .slice(1)
      .filter((c) => c.length >= 3 && c.some(Boolean))
      .map((c) => ({
        tipo: c[0] || '',
        titulo: c[1] || '',
        fonte: c[2] || '',
        link: link(c),
        conexaoFormativa: c[c.length - 2] || '',
        observacoes: c[c.length - 1] || '',
      }));
  } catch {
    return [];
  }
}

/** Mapeia o "tipo" curado pela Ju para o CHECK de `micro_conteudos.formato`. */
export function formatoDoRecurso(tipo: string): 'video' | 'audio' | 'texto' | 'case' | 'pdf' {
  const t = tipo.toLowerCase();
  if (/v[íi]deo|webin|documenta/.test(t)) return 'video';
  if (/podcast|[áa]udio/.test(t)) return 'audio';
  if (/pdf|guia|manual/.test(t)) return 'pdf';
  if (/caso|case/.test(t)) return 'case';
  return 'texto';
}
