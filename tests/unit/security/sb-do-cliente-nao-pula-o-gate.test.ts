/**
 * Análise de segurança de 05/10/2026: `gerarConteudoIA`, `gerarKit`, `gerarKitSemanal`,
 * `dispararVideoDoKit` e `resolverCelulaVideo` são exports de arquivos `'use server'`,
 * ou seja, endpoints, e aceitavam um `sb` "do job em background": `sbIn || await
 * requireEmpresaSupabase(...)`. Argumento de Server Action vem do CLIENTE, então um
 * `sb: {}` truthy PULAVA o gate de permissão e de tenant e a geração chegava ao
 * `callAI` (custo) antes de falhar na gravação.
 *
 * Só o cliente que o SERVIDOR criou (marca de `createSupabaseAdmin`) pode pular o gate.
 * O `use-server-internal-guard` só procurava um parâmetro chamado `internal`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { marcarClienteDoServidor, ehClienteDoServidor } from '@/lib/auth/cliente-do-servidor';

const gateEmpresa = vi.fn(async (..._a: any[]): Promise<any> => { throw new Error('FORBIDDEN: sem permissão'); });
const gateAdmin = vi.fn(async (..._a: any[]): Promise<any> => { throw new Error('FORBIDDEN: não é admin'); });
vi.mock('@/lib/admin-supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin-supabase')>()),
  requireEmpresaSupabase: (...a: any[]) => gateEmpresa(...a),
  requireAdminSupabase: (...a: any[]) => gateAdmin(...a),
}));
const callAI = vi.fn(async () => 'nunca deveria gerar');
vi.mock('@/actions/ai-client', async (orig) => ({ ...(await orig<typeof import('@/actions/ai-client')>()), callAI }));

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const forjado = () => ({}) as any;
const forjadoComFrom = () => ({ from: () => { throw new Error('não deveria tocar o banco'); } }) as any;

beforeEach(() => {
  gateEmpresa.mockClear();
  gateAdmin.mockClear();
  callAI.mockClear();
});

describe('a marca do cliente do servidor', () => {
  it('objeto vindo do cliente, mesmo com `from`, não tem a marca', () => {
    expect(ehClienteDoServidor({})).toBe(false);
    expect(ehClienteDoServidor({ from: () => 1 })).toBe(false);
    expect(ehClienteDoServidor(JSON.parse('{"from":"x"}'))).toBe(false);
    expect(ehClienteDoServidor(null)).toBe(false);
    expect(ehClienteDoServidor('supabase')).toBe(false);
  });

  it('a marca não aparece na serialização (não dá para "copiar" de um cliente real)', () => {
    const c = marcarClienteDoServidor({ from: () => 1 });
    expect(ehClienteDoServidor(c)).toBe(true);
    expect(ehClienteDoServidor(JSON.parse(JSON.stringify(c)))).toBe(false);
    expect(ehClienteDoServidor({ ...c })).toBe(false);
  });

  it('createSupabaseAdmin devolve cliente marcado', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    expect(ehClienteDoServidor(createSupabaseAdmin())).toBe(true);
  });
});

describe('🔴 `sb` forjado pelo cliente cai no gate', () => {
  it.each([['{}', forjado], ['objeto com from', forjadoComFrom]])('gerarConteudoIA com sb %s: o gate roda e a IA não é chamada', async (_n, fabricar) => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const r: any = await gerarConteudoIA({
      formato: 'texto', competencia: 'C', descritor: 'D', empresaId: EMPRESA, forcar: true, fichaCargo: null, sb: fabricar(),
    } as any);
    expect(gateEmpresa).toHaveBeenCalledTimes(1);
    expect(gateEmpresa.mock.calls[0][0]).toBe(EMPRESA);
    expect(r.success).toBe(false);
    expect(callAI).not.toHaveBeenCalled();
  });

  it('gerarKit com sb forjado: o gate roda', async () => {
    const { gerarKit } = await import('@/actions/kits');
    const r: any = await gerarKit({ competencia: 'C', descritor: 'D', disc: 'S', empresaId: EMPRESA, sb: forjado(), avatarGrupo: { id: 'g' } as any, adiarVideo: true } as any);
    expect(gateEmpresa).toHaveBeenCalledTimes(1);
    expect(r.success).toBe(false);
    expect(callAI).not.toHaveBeenCalled();
  });

  it('gerarKitSemanal com sb forjado: o gate roda', async () => {
    const { gerarKitSemanal } = await import('@/actions/kits');
    const r: any = await gerarKitSemanal({ competencia: 'C', descritor: 'D', empresaId: EMPRESA, sb: forjado() } as any);
    expect(gateEmpresa).toHaveBeenCalledTimes(1);
    expect(r.success).not.toBe(true);
  });

  it('dispararVideoDoKit com cliente forjado: recusa sem tocar o banco', async () => {
    const { dispararVideoDoKit } = await import('@/actions/gerar-video');
    const r: any = await dispararVideoDoKit(forjadoComFrom(), {
      moduloBaseId: 'mb1', empresaId: EMPRESA, cargo: 'x', disc: 'S', desafioTexto: 't', kitId: 'k1',
    });
    expect(r.error).toMatch(/não reconhecido/);
  });

  it('resolverCelulaVideo com opts.sb forjado: o gate de admin roda', async () => {
    const { resolverCelulaVideo } = await import('@/actions/gerar-video');
    await expect(resolverCelulaVideo('mb1', EMPRESA, 'x', 'S', null, { sb: forjado() })).rejects.toThrow(/FORBIDDEN/);
    expect(gateAdmin).toHaveBeenCalledTimes(1);
  });
});

describe('o cliente que o servidor criou segue pulando o gate (jobs e lotes continuam funcionando)', () => {
  it('gerarConteudioIA com cliente marcado não chama o gate', async () => {
    const { gerarConteudoIA } = await import('@/actions/conteudos');
    const sb = marcarClienteDoServidor({ from: () => { throw new Error('parou aqui, de propósito'); } });
    // sem `formato`: devolve o erro de validação logo depois de resolver o cliente
    const r: any = await gerarConteudoIA({ competencia: 'C', descritor: 'D', empresaId: EMPRESA, sb } as any);
    expect(gateEmpresa).not.toHaveBeenCalled();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/obrigatórios/);
  });

  it('gerarKit com cliente marcado não chama o gate', async () => {
    const { gerarKit } = await import('@/actions/kits');
    const sb = marcarClienteDoServidor({});
    const r: any = await gerarKit({ competencia: '', descritor: 'D', disc: 'S', empresaId: EMPRESA, sb } as any);
    expect(gateEmpresa).not.toHaveBeenCalled();
    expect(r.error).toMatch(/obrigatórios/);
  });

  it('resolverCelulaVideo com cliente marcado não chama o gate de admin', async () => {
    const { resolverCelulaVideo } = await import('@/actions/gerar-video');
    const sb = marcarClienteDoServidor({ from: () => { throw new Error('parou aqui, de propósito'); } });
    await expect(resolverCelulaVideo('mb1', EMPRESA, 'x', 'S', null, { sb })).rejects.toThrow(/parou aqui/);
    expect(gateAdmin).not.toHaveBeenCalled();
  });
});

describe('o padrão não volta', () => {
  it.each([
    ['actions/conteudos.ts', /sbIn \|\| await requireEmpresaSupabase/],
    ['actions/kits.ts', /sbIn \|\| await requireEmpresaSupabase|const sbk = sb \|\| await requireEmpresaSupabase/],
    ['actions/gerar-video.ts', /opts\.sb \|\| await requireAdminSupabase/],
  ])('🔴 %s não decide "interno" por truthiness do argumento', (arquivo, padrao) => {
    expect(readFileSync(arquivo, 'utf8')).not.toMatch(padrao);
  });
});
