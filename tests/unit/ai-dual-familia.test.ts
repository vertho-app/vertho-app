import { describe, expect, it } from 'vitest';
import {
  resolveTaskModel,
  familiaDoModelo,
  DUAL_IA_PARES,
  PARES_FORA_DA_TABELA,
  DEFAULT_TASK_MODELS,
  PINNED_TASKS,
} from '@/lib/ai-tasks';

/**
 * INVARIANTE: no padrão Dual-IA, o auditor nunca é da mesma família do gerador.
 *
 * Por que este guard existe (25/08/2026):
 *
 * A regra já estava implementada — `crossLlmCheck()` em `lib/ia-cost-catalog.ts`,
 * mapa bidirecional, aplicado automaticamente por `applyPreset()`. Só que os
 * únicos consumidores são `app/admin/vertho/orcamento` e `.../simulador-custo`:
 * duas telas de SIMULAÇÃO DE CUSTO. Nenhum caminho de execução lê aquilo.
 *
 * Resultado: `blueprint_audit` auditava `blueprint_gerar` com o mesmo
 * `claude-sonnet-4-6` durante toda a vida do Blueprint, e nada acusou — porque
 * a única coisa que sabia a regra não estava no caminho. Uma regra escrita onde
 * não decide nada é decoração.
 *
 * Este teste roda a regra contra os pares REAIS, com a MESMA função que o
 * runtime usa para escolher o modelo (`resolveTaskModel`), e sob o `sys_config`
 * REAL das empresas — não sob um objeto vazio que esconderia a precedência.
 */

// `Medido:` 12/08/2026 — as 10 empresas têm este sys_config e NENHUMA tem
// override das tasks de auditoria. Resolver sob `{}` daria um verde que a
// produção não tem: é o genérico do tenant que derrubava a 2ª IA antes do pin.
const SYS_CONFIG_REAL = { ai: { modelo_padrao: 'claude-sonnet-4-6' } };

describe('Dual-IA — auditor de família diferente do gerador', () => {
  /**
   * Cobertura DERIVADA, não declarada.
   *
   * Um mapa escrito à mão passa em tudo por vacuidade no dia em que alguém
   * adiciona um check e esquece de listar o par — e o verde vira cobertura que
   * não existe (o modo de falha que produziu o `blueprint_audit`).
   *
   * Aqui a lista de auditores sai da PRÓPRIA tabela de tasks pela convenção de
   * nome (`*_check`, `*_audit`, `*_auditor`). Check novo sem par declarado =
   * vermelho, sem ninguém precisar lembrar.
   */
  const auditoresNaTabela = Object.keys(DEFAULT_TASK_MODELS)
    .filter((k) => /(_check|_audit|_auditor)$/.test(k));

  it('todo auditor da tabela tem par declarado (cobertura derivada, não confiada)', () => {
    const comPar = new Set(DUAL_IA_PARES.map((p) => p.auditor));
    const semPar = auditoresNaTabela.filter((k) => !comPar.has(k));

    expect(
      semPar,
      `auditor em DEFAULT_TASK_MODELS sem par em DUAL_IA_PARES: ${semPar.join(', ')}. `
      + 'Declare o gerador correspondente — senão este guard fica verde sem olhar para ele.',
    ).toEqual([]);

    // E o inverso: par declarado apontando para auditor que não existe mais.
    const orfaos = DUAL_IA_PARES
      .map((p) => p.auditor)
      .filter((a) => !DEFAULT_TASK_MODELS[a]);
    expect(orfaos, `par aponta para auditor fora da tabela: ${orfaos.join(', ')}`).toEqual([]);
  });

  it('a cobertura não é vazia (guard que não olha nada passa em tudo)', () => {
    expect(auditoresNaTabela.length).toBeGreaterThanOrEqual(8);
    expect(DUAL_IA_PARES.length).toBe(auditoresNaTabela.length);
  });

  it.each(DUAL_IA_PARES)(
    'auditor de $auditor não compartilha família com $gerador',
    ({ gerador, auditor }) => {
      const modeloGerador = resolveTaskModel(SYS_CONFIG_REAL, gerador);
      const modeloAuditor = resolveTaskModel(SYS_CONFIG_REAL, auditor);
      const familiaGerador = familiaDoModelo(modeloGerador);
      const familiaAuditor = familiaDoModelo(modeloAuditor);

      expect(
        familiaAuditor,
        `${gerador} (${modeloGerador} · ${familiaGerador}) auditado por ${auditor} `
        + `(${modeloAuditor} · ${familiaAuditor}) — MESMA FAMÍLIA. `
        + 'Cross-validation com o mesmo vendor não pega viés de estilo: o auditor herda '
        + 'as mesmas tendências do gerador. Troque o default do auditor em DEFAULT_TASK_MODELS.',
      ).not.toBe(familiaGerador);
    },
  );

  it('todo auditor de par é PINNED (senão o modelo_padrao do tenant desfaz o par)', () => {
    // Sem o pin, o genérico do tenant vence o default por-task: a empresa que
    // setasse `modelo_padrao: claude-*` traria o auditor de volta para a família
    // do gerador SEM tocar em código, e este guard continuaria verde — porque
    // ele resolve sob um sys_config só.
    for (const { auditor } of DUAL_IA_PARES) {
      expect(PINNED_TASKS.has(auditor), `auditor não pinned: ${auditor}`).toBe(true);
    }
  });

  it('o pin do auditor segura mesmo com o tenant forçando a família do gerador', () => {
    // O caso adversarial do teste acima: tenant tentando rebaixar tudo para Claude.
    const hostil = { ai: { modelo_padrao: 'claude-opus-5' } };
    for (const { gerador, auditor } of DUAL_IA_PARES) {
      const fg = familiaDoModelo(resolveTaskModel(hostil, gerador));
      const fa = familiaDoModelo(resolveTaskModel(hostil, auditor));
      expect(fa, `${auditor} cedeu ao modelo_padrao do tenant`).not.toBe(fg);
    }
  });

  it('familiaDoModelo é fail-closed em id desconhecido', () => {
    // Devolver 'desconhecida' faria um modelo novo (qwen*, muse*) passar no guard
    // por ser "diferente de tudo" — falso negativo no único check que existe.
    expect(() => familiaDoModelo('modelo-que-nao-existe-1.0')).toThrow(/família desconhecida/);
    expect(familiaDoModelo('claude-sonnet-5')).toBe('anthropic');
    expect(familiaDoModelo('gpt-5.6-terra')).toBe('openai');
    expect(familiaDoModelo('gemini-3.7-flash')).toBe('google');
    expect(familiaDoModelo('qwen3.8-max')).toBe('alibaba');
    expect(familiaDoModelo('muse-spark-1.2')).toBe('meta');
  });

  it('todo modelo que a tabela pode resolver tem preço no catálogo', async () => {
    // `costFromTokens` devolve null para modelo fora de MODELS, e a linha do
    // ledger fica sem custo. Como o ledger é o instrumento que decide as trocas
    // de modelo, um default sem preço apaga a própria medição da decisão.
    const { MODELS } = await import('@/lib/ia-cost-catalog');
    const semPreco = Object.entries(DEFAULT_TASK_MODELS)
      .filter(([, modelo]) => !(MODELS as Record<string, unknown>)[modelo])
      .map(([task, modelo]) => `${task} → ${modelo}`);
    expect(semPreco, `default sem preço em ia-cost-catalog: ${semPreco.join(', ')}`).toEqual([]);
  });

  it('todo modelo do dropdown tem preço E rota', async () => {
    const { MODELS } = await import('@/lib/ia-cost-catalog');
    const { MODELOS_DISPONIVEIS } = await import('@/lib/ai-tasks');
    // Prefixos que `dispatch` (actions/ai-client.ts:182) sabe rotear. O último
    // caso de lá é `callClaude`, então prefixo desconhecido não falha limpo:
    // vira erro da Anthropic. Oferecer no dropdown o que não roteia é armadilha.
    const ROTEAVEIS = /^(claude|gpt|o1|o3|o4|kimi|grok|gemini)/;
    for (const { id } of MODELOS_DISPONIVEIS as Array<{ id: string }>) {
      expect((MODELS as Record<string, unknown>)[id], `dropdown sem preço: ${id}`).toBeTruthy();
      expect(ROTEAVEIS.test(id), `dropdown sem rota em ai-client: ${id}`).toBe(true);
    }
  });

  it('as exceções fora da tabela continuam fora (senão viram par não verificado)', () => {
    // Se alguém trouxer chat_fase3_* para DEFAULT_TASK_MODELS, este teste falha e
    // manda mover o par para DUAL_IA_PARES — em vez de deixar a exceção envelhecer
    // como cobertura que ninguém confere.
    for (const { gerador, auditor, porque } of PARES_FORA_DA_TABELA) {
      const naTabela = DEFAULT_TASK_MODELS[gerador] || DEFAULT_TASK_MODELS[auditor];
      expect(
        naTabela,
        `${gerador}/${auditor} entrou na tabela de tasks — mova o par para DUAL_IA_PARES. Motivo antigo: ${porque}`,
      ).toBeFalsy();
    }
  });
});
