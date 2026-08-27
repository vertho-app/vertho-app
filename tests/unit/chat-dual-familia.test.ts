/**
 * Dual-IA do chat da fase 3 — o par que está FORA da tabela.
 *
 * Por que existe (26/08/2026): `ai-dual-familia.test.ts` deriva a cobertura de
 * `DEFAULT_TASK_MODELS`, e `chat_fase3_eval`/`chat_fase3_audit` não estão lá —
 * estão em `PARES_FORA_DA_TABELA` justamente porque a rota resolve os dois por
 * fora do `resolveTaskModel`. Resultado: o par mais exposto da base (o gerador
 * sai de um DROPDOWN DE ADMIN) era o único sem guard nenhum.
 *
 * A exposição era real, não teórica: o auditor é `gpt-5.6-terra` desde 05/08 e o
 * gerador é `sys_config.ai.modelo_padrao`. Bastava um admin escolher GPT 5.6 Sol
 * na tela de configuração para gerador e auditor caírem na MESMA família —
 * sem erro, sem log e sem nada na tela dizendo que a segunda opinião virou eco.
 *
 * O que este arquivo trava:
 *   1. para TODO modelo que o admin consegue escolher, o auditor resolvido é de
 *      outra família (a lista de escolhas é `MODELOS_DISPONIVEIS`, não uma
 *      cópia — modelo novo no dropdown entra no teste sozinho);
 *   2. a rota CONSUMA o helper — guard de config sem consumidor: passar a
 *      invariante a existir em `lib/` não adianta se a rota seguir lendo a
 *      const direto.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditorCrossFamilia, familiaDoModelo, MODELOS_DISPONIVEIS } from '@/lib/ai-tasks';

const ROTA = join(process.cwd(), 'app/api/chat/route.ts');
const src = readFileSync(ROTA, 'utf-8');

/** Lê a const da ROTA em vez de repetir o valor: cópia divergente é o bug. */
function lerConst(nome: string): string {
  const m = src.match(new RegExp(`const ${nome} = '([^']+)'`));
  if (!m) throw new Error(`${nome} não encontrado em app/api/chat/route.ts — o teste ficou órfão do alvo.`);
  return m[1];
}
function lerArray(nome: string): string[] {
  const m = src.match(new RegExp(`const ${nome} = \\[([^\\]]+)\\]`));
  if (!m) throw new Error(`${nome} não encontrado em app/api/chat/route.ts.`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('Dual-IA do chat fase 3 (par fora da tabela)', () => {
  const DEFAULT_VALIDADOR = lerConst('DEFAULT_VALIDADOR');
  const DEFAULT_AVALIADOR = lerConst('DEFAULT_AVALIADOR');
  const ALTERNATIVOS = lerArray('VALIDADORES_ALTERNATIVOS');

  it('o default de fábrica já é cross-família', () => {
    const auditor = auditorCrossFamilia(DEFAULT_AVALIADOR, DEFAULT_VALIDADOR, ALTERNATIVOS);
    expect(familiaDoModelo(auditor)).not.toBe(familiaDoModelo(DEFAULT_AVALIADOR));
  });

  // O ponto do arquivo: a invariante não pode depender de o operador não clicar
  // na opção errada. Toda escolha possível do dropdown é exercitada.
  it.each(MODELOS_DISPONIVEIS.map((m) => m.id))(
    'admin escolhendo %s como modelo_padrao ainda produz auditor de outra família',
    (modeloEscolhido) => {
      const auditor = auditorCrossFamilia(modeloEscolhido, DEFAULT_VALIDADOR, ALTERNATIVOS);
      expect(familiaDoModelo(auditor), `gerador ${modeloEscolhido} vs auditor ${auditor}`)
        .not.toBe(familiaDoModelo(modeloEscolhido));
    },
  );

  it('falha ALTO quando não há alternativa de outra família (nunca silencioso)', () => {
    expect(() => auditorCrossFamilia('claude-sonnet-5', 'claude-opus-5', ['claude-sonnet-4-6']))
      .toThrow(/nenhum auditor de outra família/);
  });

  // Guard de consumidor: a invariante em lib/ só vale se a rota a chamar.
  it('a rota RESOLVE o validador pelo helper, não pela const direto', () => {
    expect(src).toMatch(/const modeloValidador = auditorCrossFamilia\(/);
    const usoDireto = src.match(/const modeloValidador = DEFAULT_VALIDADOR\s*;/);
    expect(usoDireto, 'a rota voltou a ler DEFAULT_VALIDADOR direto — Dual-IA deixa de ser calculada').toBeNull();
  });
});
