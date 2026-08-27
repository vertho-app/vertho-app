/**
 * De onde veio a chamada sem `taskKey` (mig 231).
 *
 * `untagged` é 33% da produção — 3.630 chamadas, US$ 96 só em Sonnet 4.6 — e o
 * ledger respondia "quanto" sem responder "onde". A allowlist estática diz
 * QUAIS call-sites não têm etiqueta; ela não diz QUAIS rodam, e o tráfego
 * recente tem uma assinatura só (input ~2.100, saída ~2.200, 42s, todo dia).
 * Escolher qual etiquetar primeiro sem medir é chute.
 */
import { describe, expect, it } from 'vitest';
import { origemDaChamada } from '@/lib/origem-chamada';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('origemDaChamada', () => {
  it('encadeia os nomes de quem chamou', () => {
    function camadaDeBaixo() { return origemDaChamada(); }
    function camadaDeCima() { return camadaDeBaixo(); }
    expect(camadaDeCima()).toContain('camadaDeBaixo');
  });

  it('pega método de objeto pelo nome do MÉTODO, não do objeto', () => {
    const obj = { gerarAlgumaCoisa() { return origemDaChamada(1); } };
    expect(obj.gerarAlgumaCoisa()).toBe('gerarAlgumaCoisa');
  });

  it('ignora os frames do próprio wrapper', () => {
    function chamadorReal() { return origemDaChamada(3); }
    const r = chamadorReal()!;
    expect(r).not.toMatch(/callAI|registrarUsoIA|origemDaChamada/);
  });

  // ⚠️ A 1ª versão descartava `main`, `run`, `handler` e `fn` como "genéricos
  // demais" — e isso zerava justamente os casos que mais importam: numa task do
  // Trigger o quadro externo É `run`; numa rota, `handler`. Pior: quando o único
  // nome disponível caía na lista, o retorno virava `null`, indistinguível de
  // "o stack não tinha nada".
  it('NÃO descarta `run`/`handler` — são o quadro externo real', () => {
    function run() { return origemDaChamada(1); }
    function handler() { return origemDaChamada(1); }
    expect(run()).toBe('run');
    expect(handler()).toBe('handler');
  });

  // O caso `null` é real (medido numa chamada de topo, sem quadro nomeado), mas
  // construí-lo dentro do vitest é artificial. O que dá para travar aqui é a
  // outra metade do contrato: quadro do wrapper NUNCA é a resposta, mesmo
  // quando é o candidato imediato.
  it('não devolve um nome do wrapper nem quando ele é o quadro imediato', () => {
    function callAI() { return origemDaChamada(1); }
    function chamadorDeVerdade() { return callAI(); }
    expect(chamadorDeVerdade()).toBe('chamadorDeVerdade');
  });

  it('respeita a profundidade pedida', () => {
    function a1() { return origemDaChamada(1); }
    function a2() { return a1(); }
    function a3() { return a2(); }
    expect(a3()!.split('←').length).toBe(1);
  });
});

describe('o wrapper captura na ENTRADA, não dentro do ledger', () => {
  const src = readFileSync(join(process.cwd(), 'actions/ai-client.ts'), 'utf-8');
  const CAPTURA = '_origemCodigo: origemDaChamada()';

  // Medido em 27/08: `return callAI(...)` em posição de cauda numa função async
  // faz o V8 ELIDIR o frame do chamador. Capturando lá dentro, depois de vários
  // awaits, o resultado era `main` — o quadro de cima — em vez do call-site.
  //
  // ⚠️ Esta asserção compara ÍNDICES. Duas versões anteriores dela fatiavam
  // texto e NÃO discriminavam nada: passavam também com a captura movida para
  // depois do await, que é exatamente o defeito que deveriam pegar. Uma delas
  // falhava porque o próprio comentário que explica a regra contém a palavra
  // "await". Asserção que não pode falhar não é teste.
  it.each([
    ['callAI', 'export async function callAI('],
    ['callAIChat', 'export async function callAIChat('],
  ])('%s captura antes do primeiro await do corpo', (_nome, assinaturaTexto) => {
    const assinatura = src.indexOf(assinaturaTexto);
    expect(assinatura, `${assinaturaTexto} não encontrado — o teste ficou órfão do alvo`).toBeGreaterThan(-1);

    const captura = src.indexOf(CAPTURA, assinatura);
    expect(captura, 'a função não captura a origem').toBeGreaterThan(-1);

    // Âncora CONCRETA, não a palavra "await" solta: o comentário que explica
    // esta regra dentro do wrapper contém a palavra, e buscá-la crua fazia a
    // asserção falhar nos DOIS estados — inútil na direção oposta à anterior.
    const primeiroAwait = src.indexOf('await resolveAILocale', assinatura);
    expect(primeiroAwait, 'o primeiro await do corpo mudou — reancore este teste').toBeGreaterThan(-1);

    expect(captura, 'a captura vem DEPOIS do primeiro await — o frame do chamador já se foi')
      .toBeLessThan(primeiroAwait);
  });

  it('o ledger grava o que foi capturado, e só quando falta taskKey', () => {
    expect(src).toMatch(/origem_codigo: options\.taskKey \? null : \(options\._origemCodigo \?\? null\)/);
  });
});
