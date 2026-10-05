// Exemplo de cenário DA PROPOSTA: formato gravado, validação e rótulos. Parte PURA
// (sem IA, sem banco, sem `server-only`): a tela do orçamento importa daqui as constantes
// e os tipos, o servidor valida com `normalizarExemploGravado`, e o documento público lê
// com `cenarioDoExemplo`. A geração (IA3) mora em `cenario-exemplo-ia.ts`.
//
// POR QUE EXISTE (05/10/2026). O exemplo corporativo era UMA constante servida a toda
// proposta que não fosse de escola: primeiro uma expedição de caminhões, que chegou a uma
// rede de academias que tinha ouvido "hipercustomizado"; depois, ao trocar por um caso de
// gerente de loja, o inverso. Agora o exemplo é gravado POR PROPOSTA
// (`sales_proposals.cenario_exemplo`, mig 277), gerado no painel de revisão pelo caminho do
// Banco de Cenários e revisado por gente antes de ir ao cliente. Proposta sem exemplo
// gravado cai na constante neutra de `proposal-document.ts`.
//
// 🔴 É texto que o CLIENTE lê, vindo de um jsonb editável: nada passa sem `normalizar*`.
// A validação é allowlist (devolve só os campos conhecidos, com tamanho limitado), pelo
// mesmo motivo de `proposal-programa.ts`: campo novo no jsonb não vira texto publicado
// por esquecimento. Os metadados de origem (nota, modelos) NUNCA chegam ao documento.
import type { ProposalCenario, ProposalSegmento } from './proposal-document';

export const LIMITES_EXEMPLO = {
  rotulo: 40,
  situacao: 1200,
  // 40: o nome curto de um descritor da matriz tem até 32 ("Clareza e foco em comportamentos"),
  // e é o rótulo de reserva quando o modelo não dá um.
  nomePergunta: 40,
  pergunta: 320,
  perguntas: 4,
  cargo: 60,
  segmento: 80,
  ficha: 4000,
  competencia: 80,
} as const;

/** Nota mínima da IA3 (decisão do dono, 01/10/2026): abaixo disto o cenário não é "aprovado". */
export const NOTA_MINIMA_EXEMPLO = 80;

/**
 * O rótulo do bloco vai em caixa alta e espaçada numa coluna estreita do PDF: passou de
 * 33 caracteres, quebra e deixa uma palavra sozinha na segunda linha (medido em imagem,
 * 05/10/2026).
 */
export const ROTULO_MAX_NO_PDF = 33;

export type OrigemExemplo = {
  cargo: string;
  segmento: string | null;
  competencia: string | null;
  /** Nota do auditor (0 a 100), ou null se não houve auditoria. */
  nota: number | null;
  status: string | null;
  gerador: string | null;
  auditor: string | null;
  geradoEm: string | null;
  /** A ficha do cargo foi colada (true) ou a IA partiu só do nome do cargo (false). */
  comFicha: boolean;
  /** Alguém mexeu no texto depois de gerado: a nota deixa de valer para o texto final. */
  editado: boolean;
};

export type ExemploGravado = {
  rotulo: string;
  situacao: string;
  perguntas: { nome: string; pergunta: string }[];
  origem: OrigemExemplo | null;
};

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Sem caractere de controle (menos quebra de linha e tab): o texto vai para PDF e HTML.
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!t || t.length > max) return null;
  return t;
}

function textoOuNulo(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? texto(v, max) : null;
}

function origemValida(bruto: unknown): OrigemExemplo | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;
  const cargo = texto(o.cargo, LIMITES_EXEMPLO.cargo);
  if (!cargo) return null;
  const nota = typeof o.nota === 'number' && Number.isFinite(o.nota) ? Math.max(0, Math.min(100, Math.round(o.nota))) : null;
  return {
    cargo,
    segmento: textoOuNulo(o.segmento, LIMITES_EXEMPLO.segmento),
    competencia: textoOuNulo(o.competencia, LIMITES_EXEMPLO.competencia),
    nota,
    status: textoOuNulo(o.status, 40),
    gerador: textoOuNulo(o.gerador, 60),
    auditor: textoOuNulo(o.auditor, 60),
    geradoEm: textoOuNulo(o.geradoEm, 40),
    comFicha: o.comFicha === true,
    editado: o.editado === true,
  };
}

/**
 * Valida o exemplo gravado (jsonb). `null` quando qualquer parte obrigatória falta ou
 * passa do limite: um exemplo pela metade não vira texto de cliente, cai no padrão.
 * Devolve SÓ os campos conhecidos (allowlist), nunca o objeto de entrada.
 */
export function normalizarExemploGravado(bruto: unknown): ExemploGravado | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const rotulo = texto(b.rotulo, LIMITES_EXEMPLO.rotulo);
  const situacao = texto(b.situacao, LIMITES_EXEMPLO.situacao);
  if (!rotulo || !situacao) return null;
  if (!Array.isArray(b.perguntas) || b.perguntas.length !== LIMITES_EXEMPLO.perguntas) return null;

  const perguntas: { nome: string; pergunta: string }[] = [];
  for (const p of b.perguntas) {
    if (!p || typeof p !== 'object') return null;
    const nome = texto((p as any).nome, LIMITES_EXEMPLO.nomePergunta);
    const pergunta = texto((p as any).pergunta, LIMITES_EXEMPLO.pergunta);
    if (!nome || !pergunta) return null;
    perguntas.push({ nome, pergunta });
  }
  return { rotulo, situacao, perguntas, origem: origemValida(b.origem) };
}

const ENTIDADE: Record<ProposalSegmento, string> = { educacao: 'instituição', corporativo: 'empresa' };

/**
 * Fecho do exemplo gravado. NÃO é gerado nem gravado: é o texto da casa, e o substantivo
 * segue o segmento do cliente ("empresa" não serve a uma escola). Diz que o caso é um
 * exemplo, para que ninguém o leia como o cenário que vai ao ar na empresa dele.
 */
export function fechamentoDoExemplo(segmento: ProposalSegmento): string {
  return 'Não é prova nem quiz, e este caso é só um exemplo: no programa, cada situação é gerada a partir da ficha de cada cargo, '
    + `da competência avaliada e do contexto da ${ENTIDADE[segmento]}, e cada pergunta força uma decisão com custo. Ninguém digita relatório depois.`;
}

/**
 * O que o DOCUMENTO usa: o exemplo gravado vira um `ProposalCenario`, sem nenhum
 * metadado de origem. `null` quando não há exemplo válido (o chamador cai no padrão).
 */
export function cenarioDoExemplo(bruto: unknown, segmento: ProposalSegmento): ProposalCenario | null {
  const e = normalizarExemploGravado(bruto);
  if (!e) return null;
  return {
    rotulo: e.rotulo,
    situacao: e.situacao,
    perguntas: e.perguntas,
    fechamento: fechamentoDoExemplo(segmento),
  };
}

/** "Cenário · Gerente de loja", ou "Cenário de exemplo" quando o cargo não cabe na coluna do PDF. */
export function rotuloDoBloco(cargo: string): string {
  const c = cargo.trim().replace(/\s+/g, ' ');
  const rotulo = `Cenário · ${c}`;
  return c && rotulo.length <= ROTULO_MAX_NO_PDF ? rotulo : 'Cenário de exemplo';
}

/** Rótulo curto de uma pergunta vindo do modelo: 1 a 2 palavras, sem pontuação de frase. */
export function rotuloCurtoValido(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[.:;!?"“”]/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 16 || t.split(' ').length > 3) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Rótulo de uma pergunta quando o modelo não deu um: o nome curto de um descritor que
 * ela cobre, o ÚLTIMO da lista que ainda não nomeou outra pergunta (a lista do modelo vem
 * em ordem numérica, e o foco costuma ser o descritor de número maior). Sem descritor
 * livre, "Pergunta N".
 */
export function rotuloPeloDescritor(
  indice: number,
  descritoresDaPergunta: unknown,
  nomesDosDescritores: string[],
  jaUsados: Set<string>,
): string {
  const ds = Array.isArray(descritoresDaPergunta) ? descritoresDaPergunta.filter((d) => Number.isInteger(d)) as number[] : [];
  for (const d of [...ds].sort((a, b) => b - a)) {
    const nome = (nomesDosDescritores[d - 1] || '').trim();
    if (nome && !jaUsados.has(nome)) {
      jaUsados.add(nome);
      return nome.length > LIMITES_EXEMPLO.nomePergunta ? `${nome.slice(0, LIMITES_EXEMPLO.nomePergunta - 1).trimEnd()}…` : nome;
    }
  }
  return `Pergunta ${indice + 1}`;
}

// ── Entrada da geração ─────────────────────────────────────────────────────

/**
 * As cinco competências da matriz global de liderança, na ordem do arquivo. É cópia de
 * `COMPETENCIAS_LIDERANCA` (`lib/simuladores/lideranca/matriz-global.ts`) de propósito: a
 * tela do orçamento é 'use client' e importar o módulo traria o JSON inteiro da matriz
 * para o bundle só para montar um `<select>`. O teste de paridade impede a deriva.
 */
export const COMPETENCIAS_DO_EXEMPLO = [
  'Análise e Diagnóstico de Situações',
  'Desenvolvimento de Pessoas',
  'Comunicação e Conversas de Liderança',
  'Priorização e Tomada de Decisão',
  'Autoconsciência e Aprendizagem Contínua',
] as const;

/** A que gerou o exemplo da Bluefit (nota 93): conversa difícil com uma pessoa da equipe. */
export const COMPETENCIA_PADRAO_DO_EXEMPLO = 'Comunicação e Conversas de Liderança';

export type EntradaGerarExemplo = {
  cargo: string;
  segmento?: string | null;
  /** Ficha do cargo colada pela pessoa (opcional). Sem ela a IA parte do nome do cargo e do segmento. */
  ficha?: string | null;
  competencia?: string | null;
  /** Feedback do auditor na rodada anterior (a tela repete a geração até a nota mínima). */
  feedback?: string | null;
};

export type EntradaValida = {
  cargo: string;
  segmento: string | null;
  ficha: string | null;
  competencia: string;
  feedback: string | null;
};

/** Tipo PLANO (o projeto roda com `strict: false` e não estreita união discriminada). */
export type ResultadoEntrada = { ok: boolean; valor?: EntradaValida; erro?: string };

export function validarEntradaGeracao(bruto: unknown): ResultadoEntrada {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const cargo = texto(b.cargo, LIMITES_EXEMPLO.cargo);
  if (!cargo || cargo.length < 2) return { ok: false, erro: `Informe o cargo do exemplo (até ${LIMITES_EXEMPLO.cargo} caracteres).` };

  const segmentoBruto = typeof b.segmento === 'string' ? b.segmento.trim() : '';
  const segmento = segmentoBruto ? texto(segmentoBruto, LIMITES_EXEMPLO.segmento) : null;
  if (segmentoBruto && !segmento) return { ok: false, erro: `Segmento muito longo (máximo ${LIMITES_EXEMPLO.segmento} caracteres).` };

  const fichaBruta = typeof b.ficha === 'string' ? b.ficha.trim() : '';
  const ficha = fichaBruta ? texto(fichaBruta, LIMITES_EXEMPLO.ficha) : null;
  if (fichaBruta && !ficha) return { ok: false, erro: `Ficha muito longa (máximo ${LIMITES_EXEMPLO.ficha} caracteres).` };

  const competenciaBruta = typeof b.competencia === 'string' ? b.competencia.trim() : '';
  const competencia = competenciaBruta || COMPETENCIA_PADRAO_DO_EXEMPLO;
  if (!(COMPETENCIAS_DO_EXEMPLO as readonly string[]).includes(competencia)) {
    return { ok: false, erro: 'Competência fora da matriz de liderança.' };
  }

  const feedbackBruto = typeof b.feedback === 'string' ? b.feedback.trim() : '';
  // Feedback vem do auditor (uma IA), mas passa pelo navegador: limite próprio, sem erro se estourar (corta).
  const feedback = feedbackBruto ? feedbackBruto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 2500) : null;

  return { ok: true, valor: { cargo, segmento, ficha, competencia, feedback } };
}
