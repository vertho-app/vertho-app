import { describe, expect, it } from 'vitest';
import {
  resolveTaskModel,
  familiaDoModelo,
  DUAL_IA_PARES,
  PARES_FORA_DA_TABELA,
  DEFAULT_TASK_MODELS,
  PINNED_TASKS,
  MODELOS_DISPONIVEIS,
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
    // `modeloTemRota` é o MESMO predicado que o dispatch usa — não uma regex
    // paralela. Uma cópia aqui viraria a quinta fonte de verdade da mesma
    // pergunta, e o guard passaria a atestar a si mesmo em vez de atestar o
    // roteador: verde enquanto a produção manda o modelo para a Anthropic.
    const { modeloTemRota } = await import('@/lib/ai-provedores');
    for (const { id } of MODELOS_DISPONIVEIS as Array<{ id: string }>) {
      expect((MODELS as Record<string, unknown>)[id], `dropdown sem preço: ${id}`).toBeTruthy();
      expect(modeloTemRota(id), `dropdown sem rota em ai-client: ${id}`).toBe(true);
    }
  });

  it('todo OpenAI-compatible recebe max_completion_tokens (o Qwen ignora max_tokens)', async () => {
    const { usaMaxCompletionTokens, PROVEDORES_OPENAI_COMPAT } = await import('@/lib/ai-provedores');
    // `Medido em 25/08/2026` mandando teto 100 e lendo completion_tokens:
    //   qwen3.8-max  com max_tokens → 1.675 🔴 ; com max_completion_tokens → 102 ✅
    //   muse/kimi/grok → honram os dois.
    // O `isNew` antigo testava só gpt-5|o1|o3|o4, então o Qwen rodava SEM TETO
    // EFETIVO: 10 de 10 chamadas do piloto passaram dos 6.144 pedidos.
    expect(usaMaxCompletionTokens('qwen3.8-max'), 'qwen SEM max_completion_tokens roda sem teto').toBe(true);
    for (const p of PROVEDORES_OPENAI_COMPAT) {
      expect(usaMaxCompletionTokens(`${p.prefixo}-x`), `provedor ${p.prefixo} ficaria no campo legado`).toBe(true);
    }
    expect(usaMaxCompletionTokens('gpt-5.6-terra')).toBe(true);
    // Claude e Gemini não passam por este caminho — têm ramo próprio no dispatch.
    expect(usaMaxCompletionTokens('claude-sonnet-5')).toBe(false);
    expect(usaMaxCompletionTokens('gemini-3.7-flash')).toBe(false);
  });

  it('todo provedor OpenAI-compatible declara prefixo, provider, env e url', async () => {
    const { PROVEDORES_OPENAI_COMPAT } = await import('@/lib/ai-provedores');
    for (const p of PROVEDORES_OPENAI_COMPAT) {
      expect(p.prefixo, 'prefixo vazio').toBeTruthy();
      // `provider` vira ia_usage_log.provider. Se dois provedores compartilhassem
      // o rótulo, o painel de custo somaria um dentro do outro sem nada acusar.
      expect(p.env, `provedor ${p.prefixo} sem env`).toMatch(/_API(_KEY)?$/);
      expect(p.url, `provedor ${p.prefixo} com url suspeita`).toMatch(/^https:\/\/.+\/chat\/completions$/);
    }
    const rotulos = PROVEDORES_OPENAI_COMPAT.map((p) => p.provider);
    expect(new Set(rotulos).size, `provider duplicado: ${rotulos.join(', ')}`).toBe(rotulos.length);
  });

  /**
   * `Medido em 25/08/2026` ao ligar o Muse Spark 1.2 — respostas REAIS da
   * api.meta.ai, não inventadas para o teste.
   */
  it('resposta 200 com conteúdo vazio e tokens gastos FALHA em vez de virar ""', async () => {
    const { conteudoOuFalhaAlto } = await import('@/lib/ai-provedores');
    // Payload real: max_tokens=32, tudo consumido em raciocínio.
    const respostaReal = {
      choices: [{ finish_reason: 'length', message: { content: '', role: 'assistant' } }],
      usage: { completion_tokens: 32, prompt_tokens: 20, completion_tokens_details: { reasoning_tokens: 32 } },
    };
    expect(() => conteudoOuFalhaAlto(respostaReal, 'muse-spark-1.2'))
      .toThrow(/conteúdo VAZIO após 32 tokens.*32 deles de raciocínio.*finish_reason=length/s);
  });

  it('resposta normal passa intacta — o fail-loud não muda o caminho feliz', async () => {
    const { conteudoOuFalhaAlto } = await import('@/lib/ai-provedores');
    // Payload real: mesmo prompt com max_tokens=600 → 125 tokens de raciocínio + "OK".
    const ok = {
      choices: [{ finish_reason: 'stop', message: { content: 'OK', role: 'assistant' } }],
      usage: { completion_tokens: 136, completion_tokens_details: { reasoning_tokens: 125 } },
    };
    expect(conteudoOuFalhaAlto(ok, 'muse-spark-1.2')).toBe('OK');
  });

  it('vazio SEM tokens gastos continua devolvendo "" (não é o mesmo defeito)', async () => {
    const { conteudoOuFalhaAlto } = await import('@/lib/ai-provedores');
    // Aqui o modelo não gastou nada: é outra classe de resposta degenerada, e
    // transformá-la em exceção mudaria comportamento de quem já convive com ela.
    expect(conteudoOuFalhaAlto({ choices: [{ message: { content: '' } }], usage: { completion_tokens: 0 } }, 'gpt-5.6-terra')).toBe('');
    expect(conteudoOuFalhaAlto({}, 'gpt-5.6-terra')).toBe('');
  });

  describe('validarModelosDoSysConfig — porta de escrita', () => {
    it('config real das empresas passa', async () => {
      const { validarModelosDoSysConfig } = await import('@/lib/ai-tasks');
      expect(await validarModelosDoSysConfig(SYS_CONFIG_REAL)).toEqual([]);
      expect(await validarModelosDoSysConfig({ ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: { ia3_check: 'gpt-5.6-terra' } } })).toEqual([]);
      expect(await validarModelosDoSysConfig({})).toEqual([]);
    });

    it('modelo sem rota é recusado — é o que o dropdown do cliente não garante', async () => {
      const { validarModelosDoSysConfig } = await import('@/lib/ai-tasks');
      const p = await validarModelosDoSysConfig({ ai: { modelos: { ia4_check: 'llama-inventado' } } });
      expect(p).toHaveLength(1);
      expect(p[0]).toMatch(/não tem rota/);
    });

    it('modelo com rota e SEM preço é recusado (ledger nasceria sem custo)', async () => {
      const { validarModelosDoSysConfig } = await import('@/lib/ai-tasks');
      const p = await validarModelosDoSysConfig({ ai: { modelo_padrao: 'gpt-5.9-que-nao-existe-no-catalogo' } });
      expect(p[0]).toMatch(/não tem preço/);
    });

    it('aceita modelo FORA do dropdown que seja válido — a régua não é a curadoria', async () => {
      const { validarModelosDoSysConfig } = await import('@/lib/ai-tasks');
      // Snapshot datado do 5.4 e o flash-lite do auditor do chat: os dois têm
      // preço e rota, e nenhum está em MODELOS_DISPONIVEIS. Travar no dropdown
      // proibiria configurá-los sem motivo.
      expect(await validarModelosDoSysConfig({ ai: { modelos: { ia4_check: 'gpt-5.4-2026-03-05', chat_fase3_audit: 'gemini-3.1-flash-lite' } } })).toEqual([]);
    });

    it('🔑 aceita `gpt-5.4` — e é por isso que esta validação NÃO basta', async () => {
      const { validarModelosDoSysConfig } = await import('@/lib/ai-tasks');
      // O caso real da ACME Demo. `gpt-5.4` tem preço no catálogo e tem rota,
      // então a porta de escrita o aprova — corretamente, porque ele ERA válido
      // quando foi gravado. Quem pega que ele morreu no provedor é o R14 do
      // health-check, não isto aqui. Este teste existe para travar essa fronteira:
      // se alguém "consertar" a validação de escrita para recusar gpt-5.4, estará
      // resolvendo o sintoma no lugar errado e mascarando a necessidade do R14.
      expect(await validarModelosDoSysConfig({ ai: { modelos: { ia3_check: 'gpt-5.4' } } })).toEqual([]);
    });

    it('vazio = sem override, alinhado ao que o resolveTaskModel já faz', async () => {
      const { validarModelosDoSysConfig, resolveTaskModel } = await import('@/lib/ai-tasks');
      // A tela DELETA a chave ao escolher "usar o default", mas um caller HTTP
      // pode mandar ''. O runtime lê isso como sem-override (`if (especifico)`),
      // então a porta de escrita tem que concordar com o consumidor: recusar o
      // que o runtime aceita sem dano só travaria save à toa.
      expect(resolveTaskModel({ ai: { modelos: { ia3_check: '' } } }, 'ia3_check')).toBe('gpt-5.6-terra');
      expect(await validarModelosDoSysConfig({ ai: { modelos: { ia3_check: '' } } })).toEqual([]);
      // Lixo que NÃO é texto o runtime devolveria adiante e o dispatch engasgaria.
      const p = await validarModelosDoSysConfig({ ai: { modelos: { ia3_check: 123 } } });
      expect(p[0]).toMatch(/precisa ser texto/);
    });
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
/**
 * 27/08 — o pino do AUDITOR não basta quando o GERADOR não está pinado.
 *
 * `resolveTaskModel` deixa `sys_config.ai.modelo_padrao` sobrescrever qualquer
 * task NÃO pinada. Com o auditor pinado numa família e o gerador solto, basta o
 * tenant escolher um modelo dessa mesma família no dropdown para os dois
 * caírem juntos — sem erro, sem log, e com a auditoria virando eco.
 */
describe('gerador NÃO pinado × auditor pinado', () => {
  // TODOS os pares, não só os que têm entrada em DEFAULT_TASK_MODELS: quem não
  // tem cai no FALLBACK_GLOBAL, que também é sobrescrito por modelo_padrao.
  // Filtrar por "tem entrada na tabela" escondia justamente os mais expostos.
  it.each(DUAL_IA_PARES)(
    '$gerador × $auditor sobrevivem a um modelo_padrao da família do auditor',
    async ({ gerador, auditor }) => {
      const famAuditor = familiaDoModelo(DEFAULT_TASK_MODELS[auditor]);
      // O tenant escolhe, no dropdown, um modelo da MESMA família do auditor.
      const hostil = MODELOS_DISPONIVEIS.find((m) => familiaDoModelo(m.id) === famAuditor)!;
      const cfg = { ai: { modelo_padrao: hostil.id } };
      const mGer = resolveTaskModel(cfg, gerador);
      const mAud = resolveTaskModel(cfg, auditor);
      expect(familiaDoModelo(mGer), `${gerador}=${mGer} colidiu com ${auditor}=${mAud}`)
        .not.toBe(familiaDoModelo(mAud));
    },
  );
});
