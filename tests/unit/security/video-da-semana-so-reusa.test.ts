/**
 * Reanálise de segurança de 05/10/2026: `resolverVideoDaSemana(competencia, descritor, gerar, opts)` é um
 * export de arquivo `'use server'`, ou seja, um ENDPOINT, e o terceiro argumento (`gerar`) vinha do
 * cliente. A tela sempre mandava `false`, mas quem chamasse a action direto com `true` fazia o servidor
 * criar o cliente marcado (que pula o gate de admin) e seguir até o roteiro com IA e o render pago de
 * vídeo, com a pessoa logada como única exigência (ter cargo e DISC). Era "regra que só existe na tela".
 *
 * Agora a entrega ao colaborador só REUSA o que o admin ou o pré-aquecimento geraram: o parâmetro saiu da
 * assinatura, e a chamada interna fixa `gerar: false`.
 *
 * Validado por mutação: trocar `gerar: false` por `gerar: true` em `resolverVideoDaSemanaParaColaborador`
 * faz o roteiro ser pedido à IA e reprova os testes de argumento hostil.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const h = vi.hoisted(() => ({
  sb: null as any,
  gerarRoteiro: vi.fn(async (..._a: any[]) => ({ error: 'não deveria gerar' })),
  trigger: vi.fn(async (..._a: any[]) => ({ id: 'run-1' })),
  gateAdmin: vi.fn(async (..._a: any[]): Promise<any> => { throw new Error('FORBIDDEN: não é admin'); }),
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/admin-supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/admin-supabase')>()),
  requireAdminSupabase: (...a: any[]) => h.gateAdmin(...a),
}));
vi.mock('@/lib/auth/action-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/action-context')>()),
  requireUserAction: async () => ({ email: 'ana@escola.br', empresaId: 'e1', role: 'colaborador' }),
  getAuthenticatedEmailFromAction: async () => 'ana@escola.br',
}));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  findColabByEmail: async () => ({ id: 'c1' }),
}));
vi.mock('@/lib/video/gerar-roteiro', () => ({ gerarRoteiroDeModulo: (...a: any[]) => h.gerarRoteiro(...a) }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => h.trigger(...a) } }));

import { resolverVideoDaSemana } from '@/actions/gerar-video';

beforeEach(() => {
  h.gerarRoteiro.mockClear();
  h.trigger.mockClear();
  h.gateAdmin.mockClear();
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => ({
      colaboradores: { id: 'c1', empresa_id: 'e1', cargo: 'Professora', perfil_dominante: 'S', locale: 'pt-BR' },
      micro_conteudos: { modulo_base_id: 'mb1' },
      modulos_base_conteudo: { id: 'mb1', titulo: 'Módulo', descritor: 'D', conteudo_central: 'x', conteudo_aplicavel: 'y', locale: 'pt-BR' },
    } as Record<string, any>)[tabela] ?? null,
    lista: () => [],
  });
});

const semGeracao = () => {
  expect(h.gerarRoteiro).not.toHaveBeenCalled();
  expect(h.trigger).not.toHaveBeenCalled();
  expect(h.sb.escritas.filter((e: any) => e.tabela === 'videos_gerados')).toEqual([]);
};

describe('a entrega do vídeo da semana só reusa', () => {
  it('célula sem vídeo: devolve "não gerado" e nada é criado nem disparado', async () => {
    const r: any = await resolverVideoDaSemana('Comunicação', null, { coreId: 'core-1' });
    expect(r.available).toBe(true);
    expect(r.status).toBe('nao_gerado');
    semGeracao();
  });

  it('🔴 `gerar: true` no objeto de opções (cliente hostil) é ignorado', async () => {
    const r: any = await resolverVideoDaSemana('Comunicação', null, { coreId: 'core-1', gerar: true } as any);
    expect(r.status).toBe('nao_gerado');
    semGeracao();
  });

  it('🔴 `true` na posição antiga do parâmetro (cliente com a assinatura velha) não gera', async () => {
    // Na assinatura nova o 3º argumento é `opts`; `true` ali não tem `coreId` e a resolução segue
    // pelo nível da pessoa. O que importa é que a geração não aconteça, qualquer que seja o caminho.
    await (resolverVideoDaSemana as any)('Comunicação', null, true, { coreId: 'core-1' });
    semGeracao();
  });

  it('o gate de admin não é o que segura: o cliente do servidor o pula, e a geração continua barrada', async () => {
    await resolverVideoDaSemana('Comunicação', null, { coreId: 'core-1', gerar: true } as any);
    expect(h.gateAdmin).not.toHaveBeenCalled();
    semGeracao();
  });
});
