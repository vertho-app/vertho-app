/**
 * Ingestão de documentos pra knowledge_base.
 *
 * - Extrai texto de PDF (pdf-parse) e DOCX (mammoth)
 * - Quebra em chunks por seção (headings + tamanho máx)
 * - Helpers stateless: as actions decidem onde persistir (lib/rag.ingestDoc)
 */

export interface ParsedDoc {
  text: string;
  pages?: number;
  meta?: Record<string, unknown>;
}

export interface ChunkOptions {
  /** Tamanho máximo aproximado em chars (~800 tokens = ~3200 chars) */
  maxChars?: number;
  /** Overlap entre chunks consecutivos (chars) — preserva contexto */
  overlapChars?: number;
}

export interface Chunk {
  /** Título inferido da seção (heading) ou primeira linha */
  titulo: string;
  /** Conteúdo do chunk */
  conteudo: string;
  /** Posição no doc original (ordem) */
  ordem: number;
}

const DEFAULT_MAX_CHARS = 3200;
const DEFAULT_OVERLAP = 200;

/**
 * Extrai texto de um PDF via pdf-parse (binário Buffer).
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDoc> {
  // unpdf funciona em serverless sem DOM, sem worker, sem DOMMatrix.
  const { extractText } = await import('unpdf');
  const result = await extractText(new Uint8Array(buffer));
  return {
    text: Array.isArray(result.text) ? result.text.join('\n\n') : (result.text || ''),
    pages: result.totalPages || 0,
    meta: {},
  };
}

/**
 * Extrai texto de um DOCX via mammoth.
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDoc> {
  const { default: mammoth } = await import('mammoth');
  const r = await mammoth.extractRawText({ buffer });
  return {
    text: r.value || '',
    meta: { messages: r.messages },
  };
}

/**
 * Detecta tipo do arquivo pelo magic bytes / mime e chama o parser certo.
 */
export async function parseDocument(
  buffer: Buffer,
  hint?: { mime?: string; filename?: string },
): Promise<ParsedDoc> {
  const mime = hint?.mime || '';
  const filename = (hint?.filename || '').toLowerCase();

  if (mime === 'application/pdf' || filename.endsWith('.pdf') || isPdfBuffer(buffer)) {
    return parsePdf(buffer);
  }
  if (
    mime.includes('wordprocessingml') ||
    filename.endsWith('.docx') ||
    isDocxBuffer(buffer)
  ) {
    return parseDocx(buffer);
  }
  // Texto puro
  if (mime.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) {
    return { text: buffer.toString('utf8') };
  }
  throw new Error('Formato não suportado (use PDF, DOCX, TXT ou MD)');
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString() === '%PDF';
}

function isDocxBuffer(buf: Buffer): boolean {
  // DOCX é um ZIP — começa com 'PK'
  return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/**
 * Quebra texto em chunks por seção (heading detectado por regex) com tamanho
 * máximo. Cada chunk tem `titulo` (heading da seção ou primeira linha
 * significativa) + `conteudo` + `ordem`.
 *
 * Headings detectados:
 *   - Markdown: # / ## / ###
 *   - Numerados: "1. Título", "1.1 Título", "Capítulo X", "Seção Y"
 *   - Linhas em CAIXA ALTA com 3-80 chars
 *   - Linhas curtas seguidas de \n\n (estilo título)
 */
export function chunkBySection(
  text: string,
  opts: ChunkOptions = {},
): Chunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP;

  if (!text || !text.trim()) return [];

  // Normaliza quebras de linha + colapsa múltiplas linhas em branco
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Quebra por headings — captura o texto entre headings
  const headingRegex = new RegExp(
    [
      String.raw`^(#{1,6})\s+(.+)$`, // markdown
      String.raw`^(\d+(?:\.\d+)*\.?\s+[A-ZÀ-Ú][^\n]{2,80})$`, // numerados
      String.raw`^((?:Capítulo|Seção|Cap[íi]tulo|Se[çc][aã]o)\s+[\dIVXLCDM]+[^\n]{0,100})$`, // capítulo/seção
      String.raw`^([A-ZÀ-Ú][A-ZÀ-Ú\s\d.,:;()-]{3,80})$`, // CAIXA ALTA
    ].join('|'),
    'gm',
  );

  const sections: Array<{ titulo: string; conteudo: string }> = [];
  let lastIdx = 0;
  let lastTitle = inferFirstLineTitle(normalized);

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(normalized)) !== null) {
    const startIdx = match.index;
    const conteudoAnterior = normalized.slice(lastIdx, startIdx).trim();
    if (conteudoAnterior) {
      sections.push({ titulo: lastTitle, conteudo: conteudoAnterior });
    }
    lastTitle = (match[2] || match[3] || match[4] || match[5] || match[1]).trim();
    lastIdx = startIdx + match[0].length;
  }
  // Última seção
  const conteudoFinal = normalized.slice(lastIdx).trim();
  if (conteudoFinal) {
    sections.push({ titulo: lastTitle, conteudo: conteudoFinal });
  }

  // Se não houver headings detectados, fica 1 seção só
  if (sections.length === 0) {
    sections.push({ titulo: lastTitle, conteudo: normalized });
  }

  // Aplica limite de tamanho dentro de cada seção (split com overlap se grande)
  const chunks: Chunk[] = [];
  let ordem = 0;
  for (const sec of sections) {
    if (sec.conteudo.length <= maxChars) {
      chunks.push({ titulo: sec.titulo, conteudo: sec.conteudo, ordem: ordem++ });
    } else {
      const sliced = splitByMaxChars(sec.conteudo, maxChars, overlapChars);
      sliced.forEach((part, i) => {
        const titulo = sliced.length > 1 ? `${sec.titulo} (parte ${i + 1}/${sliced.length})` : sec.titulo;
        chunks.push({ titulo, conteudo: part, ordem: ordem++ });
      });
    }
  }

  return chunks;
}

function inferFirstLineTitle(text: string): string {
  const firstLine = text.split('\n').find(l => l.trim().length > 0) || 'Documento';
  return firstLine.trim().slice(0, 120);
}

/**
 * Quebra texto longo em pedaços de até maxChars, tentando parar em
 * fim de parágrafo (\n\n) ou frase (. ! ?). Adiciona overlap.
 */
function splitByMaxChars(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      // Tenta cortar em \n\n próximo
      const lastBreak = text.lastIndexOf('\n\n', end);
      if (lastBreak > i + maxChars * 0.6) {
        end = lastBreak;
      } else {
        // Tenta cortar em fim de frase
        const lastSentence = Math.max(
          text.lastIndexOf('. ', end),
          text.lastIndexOf('! ', end),
          text.lastIndexOf('? ', end),
        );
        if (lastSentence > i + maxChars * 0.6) end = lastSentence + 1;
      }
    }
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(i + 1, end - overlapChars);
  }
  return out.filter(Boolean);
}

/**
 * Pipeline completo: parse + chunk. Retorna chunks prontos pra ingestDoc().
 */
export async function parseAndChunk(
  buffer: Buffer,
  hint?: { mime?: string; filename?: string },
  opts: ChunkOptions = {},
): Promise<Chunk[]> {
  const parsed = await parseDocument(buffer, hint);
  return chunkBySection(parsed.text, opts);
}
