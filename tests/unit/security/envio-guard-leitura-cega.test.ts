import { describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * O gate de tenant-demo quando a leitura de `empresas.is_demo` FALHA.
 *
 * A política do arquivo é fail-open, declarada no cabeçalho dele: "em erro de
 * leitura, NÃO bloqueia (não queremos derrubar envio real por um blip)". Estes
 * testes não a contestam — eles garantem as duas coisas que faltavam para ela
 * ser uma política em vez de um acidente:
 *
 *   1. **Ela é ACIONADA no caso que importa.** O `console.warn` morava num
 *      `catch`, e o supabase-js RETORNA `{ error }` em vez de lançar: erro de
 *      query passava reto, `data` vinha `null`, `isDemo` virava `false` e o
 *      tenant de demonstração mandava comunicação REAL — sem cair no catch,
 *      logo sem nem o aviso que o catch promete.
 *   2. **Ela não gruda.** O resultado do fail-open não pode entrar no cache de
 *      60s: um blip de leitura estenderia por um minuto inteiro a janela em que
 *      um tenant de demo é tratado como real.
 *
 * O `resolver` devolve `is_demo: true` de propósito em todos os casos: assim
 * `false` só pode vir do fail-open, nunca de o tenant não ser demo — sem isso a
 * asserção passaria pelo motivo errado.
 */

let sb = criarSupabaseMock();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

/** Recarrega o módulo: o cache de 60s vive no escopo dele. */
async function carregarGuard() {
  vi.resetModules();
  return await import('@/lib/demo/envio-guard');
}

describe('envio-guard · leitura de is_demo que falha', () => {
  it('não bloqueia (fail-open preservado) mas DEIXA RASTRO', async () => {
    sb = criarSupabaseMock({ resolver: () => ({ is_demo: true }) });
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout na leitura' });
    const { isTenantDemo } = await carregarGuard();

    expect(await isTenantDemo('emp-1')).toBe(false);
    // Sem esta asserção o teste passaria com o bug intacto: `data: null` também
    // produz `false`. O rastro é o que separa "política aplicada" de "falha
    // silenciosa que por acaso tem o mesmo efeito".
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(true);
  });

  it('o fail-open NÃO entra no cache: a chamada seguinte pergunta de novo', async () => {
    sb = criarSupabaseMock({ resolver: () => ({ is_demo: true }) });
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'blip' });
    const { isTenantDemo } = await carregarGuard();

    expect(await isTenantDemo('emp-1')).toBe(false);

    sb.falhas.length = 0;   // o blip passou
    expect(await isTenantDemo('emp-1')).toBe(true);
  });

  it('leitura OK reconhece o tenant de demo e bloqueia', async () => {
    sb = criarSupabaseMock({ resolver: () => ({ is_demo: true }) });
    const { isTenantDemo } = await carregarGuard();

    expect(await isTenantDemo('emp-1')).toBe(true);
    expect(sb.escritas.some((e) => e.tabela === 'degradacao_log')).toBe(false);
  });

  it('empresa sem id não consulta nada', async () => {
    sb = criarSupabaseMock({ resolver: () => ({ is_demo: true }) });
    const { isTenantDemo } = await carregarGuard();

    expect(await isTenantDemo(null)).toBe(false);
    expect(sb.chamadas).toHaveLength(0);
  });
});
