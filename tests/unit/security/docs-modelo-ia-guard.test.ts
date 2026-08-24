import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { MODELOS_DISPONIVEIS, DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';

/**
 * ── D8 (auditoria de 22/08): doc que enumera catálogo envelhece calado ─────
 *
 * `CLAUDE.md` e `docs/ARQUITETURA.md` declaravam modelos que o código não usa —
 * **4 de 4 afirmações erradas**: `claude-opus-4-6` para roteiro de vídeo (id que
 * não existe em `MODELOS_DISPONIVEIS` nem em `DEFAULT_TASK_MODELS`, só na tabela
 * de preços legada), um fallback de provedor de duas gerações atrás, e uma lista
 * de cinco ids em que **nenhum** dos seis atuais aparecia.
 *
 * Isolado parece cosmético. Não é: é o insumo de toda decisão de custo e de
 * troca de modelo, e o **contrato dos parâmetros muda por geração** — foi assim
 * que `scripts/spike-batch-roteiros.ts` nasceu com um id de outra geração e o
 * comentário "alinhado ao prod", e que o vídeo passou 5 dias gerando zero
 * (`docs/FMEA-PIPELINE.md` §F-I14).
 *
 * A régua: os docs podem citar um id — o que não podem é citar um id **morto**
 * sem dizer que é morto. Citação histórica vive na allowlist abaixo, com o
 * motivo ao lado, e ela só encolhe (mesma disciplina dos outros guards).
 */

const DOCS = ['CLAUDE.md', 'docs/ARQUITETURA.md'];

/**
 * Famílias, não ids: aparecem em frases sobre um GRUPO de modelos ("modelos
 * reasoning: gpt-5.x") e não são configuração de nada.
 */
const FAMILIAS = new Set(['gpt-5.x', 'kimi-k3', 'kimi*', 'gpt-5']);

/**
 * Citações HISTÓRICAS toleradas — cada uma explica um erro passado, e apagar a
 * citação apagaria a lição. Só pode encolher.
 */
const CITACOES_HISTORICAS: Record<string, string> = {
  'claude-opus-4-6':
    'CLAUDE.md: é o id ERRADO que o próprio parágrafo do D8 está desmentindo — '
    + 'tirá-lo deixaria o aviso sem o exemplo',
};

/** O que o código de fato oferece/pina hoje. */
function modelosVivos(): Set<string> {
  const vivos = new Set<string>();
  for (const m of MODELOS_DISPONIVEIS) vivos.add(m.id.toLowerCase());
  for (const id of Object.values(DEFAULT_TASK_MODELS)) vivos.add(String(id).toLowerCase());

  // `DEFAULT_MODEL` e `AI_FALLBACK_MODEL` não são exportados — leitura do fonte,
  // com asserção de que a extração achou algo (regex que para de casar viraria
  // um guard que aprova tudo).
  const cliente = readFileSync('actions/ai-client.ts', 'utf-8');
  const achados = [
    cliente.match(/const DEFAULT_MODEL\s*=\s*'([^']+)'/),
    cliente.match(/AI_FALLBACK_MODEL\s*=\s*process\.env\.AI_FALLBACK_MODEL\s*\|\|\s*'([^']+)'/),
  ];
  for (const m of achados) if (m) vivos.add(m[1].toLowerCase());
  return { vivos, achados } as any;
}

/** Ids de modelo citados num texto, com a linha. */
function idsCitados(texto: string): Array<{ id: string; linha: number }> {
  const pat = /\b((?:claude|gpt|gemini|kimi)[-a-z0-9.]*\d[a-z0-9.\-]*)\b/gi;
  const achados: Array<{ id: string; linha: number }> = [];
  texto.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(pat)) achados.push({ id: m[1].toLowerCase(), linha: i + 1 });
  });
  return achados;
}

describe('docs: nenhum id de modelo morto', () => {
  it('as duas fontes do código foram lidas (senão o guard aprova tudo)', () => {
    const cliente = readFileSync('actions/ai-client.ts', 'utf-8');
    expect(
      cliente.match(/const DEFAULT_MODEL\s*=\s*'([^']+)'/),
      'DEFAULT_MODEL não foi encontrado em actions/ai-client.ts — a extração quebrou',
    ).toBeTruthy();
    expect(
      cliente.match(/AI_FALLBACK_MODEL\s*=\s*process\.env\.AI_FALLBACK_MODEL\s*\|\|\s*'([^']+)'/),
      'AI_FALLBACK_MODEL não foi encontrado — a extração quebrou',
    ).toBeTruthy();
    expect(MODELOS_DISPONIVEIS.length).toBeGreaterThan(3);
    expect(Object.keys(DEFAULT_TASK_MODELS).length).toBeGreaterThan(10);
  });

  it('os docs citam modelos (senão a regra abaixo passa por vacuidade)', () => {
    const total = DOCS.reduce((n, d) => n + idsCitados(readFileSync(d, 'utf-8')).length, 0);
    expect(total, 'nenhum id citado — o regex de varredura quebrou').toBeGreaterThan(2);
  });

  it('🔴 todo id citado nos docs existe no código (ou está declarado como histórico)', () => {
    const { vivos } = modelosVivos() as any;
    const mortos: string[] = [];

    for (const doc of DOCS) {
      for (const { id, linha } of idsCitados(readFileSync(doc, 'utf-8'))) {
        if (vivos.has(id) || FAMILIAS.has(id) || CITACOES_HISTORICAS[id]) continue;
        mortos.push(`${doc}:${linha} → ${id}`);
      }
    }

    expect(
      mortos,
      'id de modelo que o código não usa mais. Aponte a fonte (`lib/ai-tasks.ts`) em vez de '
      + 'repetir o id; se a citação for histórica de propósito, declare em CITACOES_HISTORICAS '
      + 'com o motivo. O contrato dos parâmetros muda por GERAÇÃO — id velho no doc vira script novo quebrado.',
    ).toEqual([]);
  });

  /**
   * O outro lado: a allowlist não pode guardar id que voltou a viver, senão ela
   * mascara a régua em vez de declarar dívida.
   */
  it('nenhuma citação histórica descreve um modelo VIVO', () => {
    const { vivos } = modelosVivos() as any;
    const ressuscitados = Object.keys(CITACOES_HISTORICAS).filter((id) => vivos.has(id));
    expect(
      ressuscitados,
      'está na allowlist de citação histórica e o código voltou a usar — tire da lista',
    ).toEqual([]);
  });

  /**
   * E a régua que resolve o problema de raiz: os dois docs mandam para a fonte,
   * em vez de manter uma cópia do catálogo.
   */
  it('🔴 os docs apontam `lib/ai-tasks.ts` como fonte do catálogo', () => {
    for (const doc of DOCS) {
      expect(
        readFileSync(doc, 'utf-8').includes('lib/ai-tasks.ts'),
        `${doc} não aponta a fonte — sem isso o leitor não tem onde conferir e volta a copiar ids`,
      ).toBe(true);
    }
  });
});
