import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O prazo da escrita de um módulo-base.
 *
 * `Medido: 04/09/2026` — o refino dos 3 módulos reprovados do TCH12 (Macaé)
 * abortou nas 6 tentativas com `Request was aborted`, sem deixar linha no
 * ledger. Não era qualidade nem instabilidade do fornecedor: o wrapper tem
 * `AI_TIMEOUT_MS = 120s` por default e esta função pede até 64.000 tokens de
 * SAÍDA, que é o módulo inteiro. Dois minutos não cabem, por construção.
 *
 * O sintoma engana porque a geração pela Batch API funciona: lá não existe esse
 * relógio. Só o caminho SÍNCRONO (refino pela tela, script headless) morria.
 */

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...args: any[]) => callAI(...args) }));

import { chamarIAComRetry, TIMEOUT_ESCRITA_MODULO_MS } from '@/lib/modulo-base-autor';

/** Default do wrapper (`AI_TIMEOUT_MS` em actions/ai-client.ts). */
const TIMEOUT_DO_WRAPPER_MS = 120_000;

const CORPO_VALIDO = JSON.stringify({
  conteudo_central: { ideia_principal: 'x' },
  conteudo_aplicavel: { situacoes: [] },
  guarda_corpos: { cuidados_linguagem: 'x' },
  adaptacao_por_formato: { texto: 'x' },
});

describe('prazo da escrita de módulo-base', () => {
  beforeEach(() => {
    callAI.mockReset();
    callAI.mockResolvedValue(CORPO_VALIDO);
  });

  it('🔴 manda um prazo EXPLÍCITO — sem ele a chamada herda os 120s e aborta', async () => {
    await chamarIAComRetry('sys', 'user', 'claude-sonnet-4-6');

    const opcoes = callAI.mock.calls[0][4];
    expect(opcoes.timeoutMs).toBe(TIMEOUT_ESCRITA_MODULO_MS);
    // a asserção que importa não é o número: é que ele supera o default que
    // derrubava o refino
    expect(opcoes.timeoutMs).toBeGreaterThan(TIMEOUT_DO_WRAPPER_MS);
  });

  it('o prazo cobre a escrita mais longa: 64k tokens de saída não saem em 2 minutos', () => {
    expect(TIMEOUT_ESCRITA_MODULO_MS).toBeGreaterThanOrEqual(300_000);
  });

  it('quem chama pode encurtar o prazo', async () => {
    await chamarIAComRetry('sys', 'user', 'claude-sonnet-4-6', 8000, { timeoutMs: 90_000 });
    expect(callAI.mock.calls[0][4].timeoutMs).toBe(90_000);
  });

  it('a etiqueta do ledger continua junto do prazo', async () => {
    // sem `taskKey` o custo cai em `untagged` e some da conta do mês (F13);
    // acrescentar o timeout não pode ter empurrado a etiqueta para fora
    await chamarIAComRetry('sys', 'user', 'claude-sonnet-4-6');
    expect(callAI.mock.calls[0][4].taskKey).toBe('modulo_base_autor');
  });

  it('a 2ª tentativa também vai com prazo, não com o default', async () => {
    // o retry existe para JSON truncado, que é justamente o que uma resposta
    // cortada por prazo produz — se a 2ª herdasse os 120s, o retry seria inútil
    callAI.mockResolvedValueOnce('não é json');
    await chamarIAComRetry('sys', 'user', 'claude-sonnet-4-6');

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(callAI.mock.calls[1][4].timeoutMs).toBe(TIMEOUT_ESCRITA_MODULO_MS);
  });
});
