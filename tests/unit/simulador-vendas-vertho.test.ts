import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { estado } from '../fixtures/simulador-vendas';
import {
  criarContextoCompetitivoVertho,
  VERTHO_TREINO_EMPRESA_ID,
} from '@/lib/simulador-vendas/vertho';
import { comandoSchema } from '@/lib/simulador-vendas/schema';
import {
  assinatura,
  recebido,
  visaoPublica,
} from '@/lib/simulador-vendas/core';
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
import {
  contextoVertho,
  assertAcessoVertho,
} from '@/lib/simulador-vendas/vertho-access';
const user = {
  id: '20000000-0000-4000-8000-000000000002',
  email: 'vendedor@example.test',
};
const opcoes = { segmento: 'empresa', frente: 'competencias' } as const;
describe('treinamento comercial Vertho', () => {
  beforeEach(() => {
    sb = criarSupabaseMock({
      resolver: () => ({ habilitado: true, briefing: 'Contexto cadastrado' }),
    });
    sb.client.rpc.mockImplementation(async (nome: string) => ({
      data:
        nome === 'sim_vendas_vertho_acesso'
          ? { nome: 'Pessoa', ativo: true }
          : null,
      error: null,
    }));
  });
  it('liga o dono à conta Auth e mantém o tenant fixo, sem privilégios de piloto', async () => {
    const c = await contextoVertho(user);
    expect(c).toMatchObject({
      empresaId: VERTHO_TREINO_EMPRESA_ID,
      ownerKey: `vendedor:${user.id}`,
      auth: null,
      colaboradorId: null,
      vertho: user,
    });
    expect(sb.client.rpc).toHaveBeenCalledWith('sim_vendas_vertho_acesso', {
      p_user: user.id,
    });
    expect(sb.chamadas).toContainEqual({
      tabela: 'sim_vendas_config',
      metodo: 'eq',
      args: ['empresa_id', VERTHO_TREINO_EMPRESA_ID],
    });
  });
  it('nega vínculo ausente/inativo sem recuperar histórico nem gerar IA', async () => {
    sb.client.rpc.mockResolvedValue({ data: { ativo: false }, error: null });
    await expect(contextoVertho(user)).rejects.toMatchObject({ status: 403 });
    expect(sb.chamadas).toEqual([]);
  });
  it('erro no banco fecha o acesso', async () => {
    sb.client.rpc.mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    });
    await expect(assertAcessoVertho(user)).rejects.toMatchObject({
      status: 503,
    });
  });
  it('congela fatos e fontes pertinentes e não expõe o concorrente ou situação reservada', () => {
    const snapshot = criarContextoCompetitivoVertho(
      { segmento: 'rede_publica', frente: 'simulacao' },
      9,
    );
    expect(snapshot.concorrente.id).toBe('yoodli');
    const publica = visaoPublica({ ...estado(), vertho: snapshot });
    expect(publica.treinamentoVertho).toEqual({
      segmento: 'rede_publica',
      frente: 'simulacao',
    });
    expect(JSON.stringify(publica)).not.toContain('yoodli');
    expect(publica).not.toHaveProperty('vertho');
  });
  it('repetir o request com outro segmento/frente é conflito; assinatura legada é preservada', () => {
    const cmd = comandoSchema.parse({
      acao: 'iniciar',
      requestId: user.id,
      nivel: 1,
      vertho: opcoes,
    });
    const s = {
      ...estado(),
      recibos: [{ requestId: user.id, assinatura: assinatura(cmd) }],
    };
    expect(recebido(s, cmd)).toBe(true);
    expect(() =>
      recebido(s, {
        ...cmd,
        acao: 'iniciar',
        nivel: 1,
        vertho: { ...opcoes, frente: 'mentoria' },
      }),
    ).toThrow(/outra ação/);
    expect(assinatura({ acao: 'iniciar', requestId: user.id, nivel: 1 })).toBe(
      '["iniciar",1]',
    );
  });
  it('rejeita frente, segmento e campos não autorizados', () => {
    const base = { acao: 'iniciar', requestId: user.id, nivel: 1 };
    for (const vertho of [
      { segmento: 'outro', frente: 'mentoria' },
      { ...opcoes, concorrente: 'inventado' },
    ])
      expect(comandoSchema.safeParse({ ...base, vertho }).success).toBe(false);
  });
});
