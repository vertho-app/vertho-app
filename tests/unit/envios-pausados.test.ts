import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { pausaDeEnvios } from '@/lib/envios-pausados';

/**
 * Pausa de envios por empresa (pedido do dono, 16/10/2026, Amazon Bowling: "não envie os PDIs amanhã... precisamos
 * fechar todo o fluxo corretamente antes"). Sem ela, o aviso de PDI das 9h e a cadência da segunda saíam sozinhos.
 */
describe('pausaDeEnvios', () => {
  const agora = '2026-10-16T23:00:00.000Z';
  it('com a chave (objeto ou true) a empresa está pausada; sem ela, não', () => {
    expect(pausaDeEnvios({ envios_pausados: { motivo: 'fechar o fluxo', desde: '2026-10-16' } }, agora)).toEqual({ motivo: 'fechar o fluxo', desde: '2026-10-16' });
    expect(pausaDeEnvios({ envios_pausados: true }, agora)?.motivo).toMatch(/sem motivo/);
    expect(pausaDeEnvios({}, agora)).toBeNull();
    expect(pausaDeEnvios(null, agora)).toBeNull();
    expect(pausaDeEnvios({ envios_pausados: false }, agora)).toBeNull();
  });
  it('com `ate`, a pausa acaba sozinha na data', () => {
    expect(pausaDeEnvios({ envios_pausados: { motivo: 'x', ate: '2026-10-20T00:00:00.000Z' } }, agora)).not.toBeNull();
    expect(pausaDeEnvios({ envios_pausados: { motivo: 'x', ate: '2026-10-16T22:00:00.000Z' } }, agora)).toBeNull();
  });
});

// ─── o aviso de PDI pronto pula a empresa pausada (comportamento, com banco falso) ───────────────────────────────
const h = vi.hoisted(() => ({ relatoriosLidos: [] as string[], empresas: [] as any[] }));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      const q: any = {
        select: () => q, or: () => q, gt: () => q, in: () => q, order: () => q, limit: () => q, not: () => q,
        eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
        then: (res: any, rej: any) => {
          if (tabela === 'empresas') return Promise.resolve({ data: h.empresas, error: null }).then(res, rej);
          if (tabela === 'relatorios') h.relatoriosLidos.push(String(filtros.empresa_id));
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        },
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/notifications/pilula-template', () => ({ enviarPorTemplate: vi.fn() }));

beforeEach(() => { h.relatoriosLidos.length = 0; });

describe('avisarPlanosProntos respeita a pausa', () => {
  it('a empresa pausada nem tem os PDIs lidos, e entra na conta de pausadas; as outras seguem', async () => {
    h.empresas = [
      { id: 'amazon', slug: 'ab', nome: 'Amazon', is_demo: false, sys_config: { envios_pausados: { motivo: 'fechar o fluxo' } } },
      { id: 'outra', slug: 'outra', nome: 'Outra', is_demo: false, sys_config: {} },
    ];
    const { avisarPlanosProntos } = await import('@/lib/notifications/avisar-plano-pronto');
    const r = await avisarPlanosProntos({ executar: false });
    expect(r.pausadas).toBe(1);
    expect(h.relatoriosLidos).toEqual(['outra']);
  });
});

describe('o preparo antecipado dos desafios respeita a pausa', () => {
  it('o cron preparar_desafios pula a empresa pausada antes de gerar (e sem acusar "sem brief")', () => {
    const f = readFileSync('app/api/cron/route.ts', 'utf8');
    const caso = f.slice(f.indexOf("case 'preparar_desafios'"), f.indexOf("case 'preparar_desafios'") + 1500);
    expect(caso).toMatch(/select\('id,slug,sys_config'\)/);
    const iPausa = caso.indexOf('pausaDeEnvios(empresa.sys_config)');
    expect(iPausa).toBeGreaterThan(-1);
    expect(iPausa).toBeLessThan(caso.indexOf('prepararDesafiosDaCoorte(sb, empresa.id'));
    expect(caso.slice(iPausa, iPausa + 200)).toMatch(/semBrief: 0[\s\S]*continue;/);
  });
});

describe('a cadência diária respeita a pausa (despacho e worker)', () => {
  it('o despacho tira a empresa pausada do dia', () => {
    const f = readFileSync('actions/cron-jobs.ts', 'utf8');
    const doDia = f.slice(f.indexOf('const doDia ='), f.indexOf('const doDia =') + 600);
    expect(doDia).toMatch(/pausaDeEnvios\(e\.sys_config\)[\s\S]*return false;/);
  });
  it('o worker volta sem enviar ANTES de calcular a janela do dia (nada sai, nenhum relógio anda)', () => {
    const f = readFileSync('lib/fase4/trigger-diario-empresa.ts', 'utf8');
    const corpo = f.slice(f.indexOf('export async function processarEmpresaDiario'));
    const iPausa = corpo.indexOf('pausaDeEnvios(');
    expect(iPausa).toBeGreaterThan(-1);
    expect(iPausa).toBeLessThan(corpo.indexOf('janelasDoDia('));
    expect(corpo.slice(iPausa, iPausa + 400)).toMatch(/if \(pausa\) \{[\s\S]*return \{/);
  });
});
