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

describe('telas da pessoa: o PDI fica "em preparação" com a empresa pausada (dono: "esconder até liberar")', () => {
  it('pausaDaEmpresa lê a chave; falha de leitura NÃO esconde (não some com o PDI de todas as empresas)', async () => {
    const { pausaDaEmpresa } = await import('@/lib/envios-pausados');
    const banco = (resp: any) => ({ from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve(resp) }; return q; } });
    expect(await pausaDaEmpresa(banco({ data: { sys_config: { envios_pausados: { motivo: 'x' } } }, error: null }), 'e1')).toEqual({ motivo: 'x' });
    expect(await pausaDaEmpresa(banco({ data: { sys_config: {} }, error: null }), 'e1')).toBeNull();
    expect(await pausaDaEmpresa(banco({ data: null, error: { message: 'boom' } }), 'e1')).toBeNull();
    expect(await pausaDaEmpresa(banco({ data: null, error: null }), null)).toBeNull();
  });
  it('as três portas do PDI (tela, download e link do PDF) tratam a pausa como o PDI retido', () => {
    const acoes = readFileSync('app/dashboard/pdi/pdi-actions.ts', 'utf8');
    expect((acoes.match(/pdiRetidoPelaAuditoria\([^)]*\) \|\| await pausaDaEmpresa\(sb, colab\.empresa_id\)/g) || []).length).toBe(2);
    const rota = readFileSync('app/api/relatorios/pdf/route.ts', 'utf8');
    expect(rota).toMatch(/pdiRetidoPelaAuditoria\(rel\.conteudo, rel\.gerado_em\) \|\| await pausaDaEmpresa\(sb, rel\.empresa_id\)/);
  });
});

describe('telas da pessoa: a trilha "começa em breve" com a empresa pausada', () => {
  it('loadTemporada tira a data de início SÓ na visão da própria pessoa (gestor e RH veem a trilha como é)', () => {
    const f = readFileSync('actions/temporadas.ts', 'utf8');
    expect(f).toMatch(/const inicioPausado = ctx\.colaborador\?\.id === colaboradorId && !ctx\.isPlatformAdmin\s*&& !!\(await pausaDaEmpresa\(sbRaw, colaborador\.empresa_id\)\)/);
    expect(f).toMatch(/\.\.\.\(inicioPausado \? \{ data_inicio: null \} : \{\}\)/);
    expect(f).toMatch(/inicioPausado,\s*progresso:/);
  });
  it('sem data de início nenhuma semana libera (a régua que as telas e o servidor usam)', async () => {
    const { semanaLiberadaPorData, avaliarAcessoSemana } = await import('@/lib/season-engine/week-gating');
    expect(semanaLiberadaPorData(null, 1, new Date('2026-10-20T12:00:00Z'))).toBe(false);
    expect(avaliarAcessoSemana({ dataInicio: null, plano: [{ semana: 1 }], progresso: [], semana: 1 })).toMatchObject({ liberada: false, motivo: 'data', liberaEm: '' });
  });
  it('as telas dizem "começa em breve" no lugar da data vazia, e a home recebe a trilha sem data', () => {
    const lista = readFileSync('app/dashboard/temporada/page.tsx', 'utf8');
    expect(lista).toMatch(/data\.inicioPausado \? t\('locked\.startsSoon'\)/);
    expect(lista).toMatch(/\{data\.inicioPausado && \([\s\S]{0,200}t\('startsSoon'\)/);
    const semana = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf8');
    expect(semana).toMatch(/acesso\.liberaEm \? t\('locked\.becauseDate', \{ date: acesso\.liberaEm \}\) : t\('locked\.startsSoon'\)/);
    const home = readFileSync('app/dashboard/home-actions.ts', 'utf8');
    expect(home).toMatch(/const inicioPausado = !!pausaDeEnvios\(empCfgRes\.data\?\.sys_config\)/);
    expect(home).toMatch(/inicioPausado && jornadaR\.trilha \? \{ \.\.\.jornadaR\.trilha, data_inicio: null \}/);
  });
  it('o cartão de PDI da home segue a página: retido ou pausado não é "concluído"', () => {
    const f = readFileSync('lib/home/loaders.ts', 'utf8');
    expect(f).toMatch(/auditoria_status:conteudo->auditoria->>status/);
    expect(f).toMatch(/pdiRetidoPelaAuditoria\([\s\S]{0,160}\|\| !!\(await pausaDaEmpresa\(sb, colab\.empresa_id\)\)/);
    expect(f).toMatch(/const pdi = pdiMaisRecente && !pdiEscondido &&/);
  });
  it('os textos novos existem nos quatro idiomas', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const m = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      expect(typeof m.Season?.startsSoon, `${loc} Season.startsSoon`).toBe('string');
      expect(typeof m.Season?.locked?.startsSoon, `${loc} Season.locked.startsSoon`).toBe('string');
      expect(typeof m.SeasonWeek?.locked?.startsSoon, `${loc} SeasonWeek.locked.startsSoon`).toBe('string');
    }
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
