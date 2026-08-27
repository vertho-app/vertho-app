/**
 * Guard: rota que chama IA declara o próprio orçamento de tempo.
 *
 * Por que existe (27/08/2026): o ledger ganhou `runtime` e `orcamento_ms` na
 * mig 230 justamente porque `latency_ms` sozinho não responde "estamos perto do
 * timeout?" — 227s são 76% de uma rota de 300s e 6% de uma task de 3600s, e
 * nada no dado dizia qual. Foi essa ausência que deixou uma premissa errada
 * sobre `modulo_base_autor` sobreviver por não ser contestável.
 *
 * Medido no dia seguinte à mig: **145 de 145 chamadas de produção entraram como
 * `runtime: 'desconhecido'`.** Eu tinha instrumentado duas tasks do Trigger, e
 * nenhuma delas carrega tráfego. A instrumentação existia e não cobria nada.
 *
 * A allowlist é dívida DECLARADA e só encolhe. Rota nova que chama IA sem
 * declarar contexto é exatamente o que este guard existe para pegar — porque o
 * custo não vem das rotas que existem, vem das que serão escritas amanhã.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Rotas que chamam IA e AINDA não declaram orçamento. Só encolhe. */
const ALLOWLIST = new Set<string>([
  // ⚠️ A 1a versao desta lista tinha 11 entradas — TODA rota com `maxDuration`.
  // O proprio guard mostrou que 10 delas nao chamam IA: era falsa divida, e
  // allowlist inflada ensina a ignorar allowlist.
  //
  // Sobra UMA, e por um motivo que nao se resolve aqui: `chat-simulador` NAO
  // declara `maxDuration`, entao herda o default da plataforma e nao ha
  // orcamento a declarar. Inventar um numero seria pior que nao ter: o
  // denominador mentiria. Declarar `maxDuration` nessa rota e decisao de
  // produto, nao de instrumentacao.
  'app/api/chat-simulador/route.ts',
]);

function rotasVersionadas(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z', 'app/api'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter((f) => f.endsWith('/route.ts'));
  } catch {
    return [];
  }
}

/** A rota chama IA? Direto ou por um núcleo que ela importa. */
function chamaIA(src: string): boolean {
  return /\bcallAI(Chat)?\s*\(/.test(src) || /from '@\/actions\/ai-client'/.test(src);
}

const rotas = rotasVersionadas().filter((f) => existsSync(f));

describe('Guard: rota que chama IA declara orçamento de tempo', () => {
  it('há rotas para varrer (guard que não olha nada passa em tudo)', () => {
    expect(rotas.length).toBeGreaterThan(10);
  });

  it('nenhuma rota NOVA chama IA sem declarar contexto', () => {
    const faltando = rotas
      .filter((f) => !ALLOWLIST.has(f))
      .filter((f) => chamaIA(readFileSync(f, 'utf-8')))
      .filter((f) => !/comContexto\(\{\s*runtime: 'rota'/.test(readFileSync(f, 'utf-8')));
    expect(faltando, `sem orçamento declarado:\n  ${faltando.join('\n  ')}\n\n`
      + 'Sem isto a chamada entra no ledger como runtime "desconhecido" e a pergunta '
      + '"perto do timeout?" volta a não ter denominador. Envolva o handler:\n'
      + "  return comContexto({ runtime: 'rota', orcamentoMs: maxDuration * 1000, onde: 'api/...' }, async () => { ... });")
      .toEqual([]);
  });

  it('o orçamento declarado BATE com o maxDuration real da rota', () => {
    const divergentes: string[] = [];
    for (const f of rotas) {
      const src = readFileSync(f, 'utf-8');
      const declarado = src.match(/orcamentoMs:\s*(\d+)\s*\*\s*1000/)?.[1];
      if (!declarado) continue;
      const real = src.match(/export const maxDuration = (\d+)/)?.[1];
      // Denominador que mente é pior que denominador ausente.
      if (real !== declarado) divergentes.push(`${f}: declara ${declarado}s, maxDuration é ${real ?? '(ausente)'}`);
    }
    expect(divergentes).toEqual([]);
  });

  it('a allowlist só encolhe — nenhuma entrada stale', () => {
    const stale = [...ALLOWLIST].filter((f) => {
      if (!existsSync(f)) return true;
      const src = readFileSync(f, 'utf-8');
      // Já declarou contexto, ou nem chama IA: a entrada não é mais dívida.
      return /comContexto\(\{\s*runtime: 'rota'/.test(src) || !chamaIA(src);
    });
    expect(stale, `entradas que já não são dívida — remova:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
