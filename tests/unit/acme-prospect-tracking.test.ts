import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const expired = {
  session_id: '11111111111111111111',
  colaborador_id: 'colab-expired',
  auth_email: 'convidado.acme.11111111111111111111@vertho.ai',
  prospect_name: 'Marina Souza',
  prospect_company: 'Empresa Horizonte',
  cargo: 'Representante Comercial',
  created_at: '2026-08-31T12:00:00.000Z',
  expires_at: '2026-09-02T07:00:00.000Z',
  personal_accessed_at: '2026-08-31T13:00:00.000Z',
  disc_completed_at: null,
  colaborador_accessed_at: null,
  gestor_accessed_at: null,
  rh_accessed_at: null,
  access_closed_at: null,
};

const active = {
  ...expired,
  session_id: '22222222222222222222',
  colaborador_id: 'colab-active',
  auth_email: 'convidado.acme.22222222222222222222@vertho.ai',
  prospect_name: 'Caio Lima',
  expires_at: '2026-09-03T07:00:00.000Z',
};

/** Sessões fora da janela de retenção — o teste que precisa delas as preenche. */
let foraDaRetencao: Array<{ session_id: string; auth_email: string }> = [];

let historicoExtenso: any[] | null = null;
/** Linhas do audit log do convite (`demo.prepare_prospect_experience`) que a retenção lê. */
let auditoriaDoConvite: Array<{ id: string; detalhes: Record<string, unknown> }> = [];
const sb = criarSupabaseMock({
  resolver: (table) => {
    if (table === 'empresas') return { id: 'acme-id', is_demo: true };
    if (table === 'colaboradores') {
      return { id: 'colab-expired', mapeamento_em: '2026-09-01T18:30:00.000Z' };
    }
    return null;
  },
  lista: (table, cols, cadeia) => {
    if (table === 'demo_prospect_sessions') {
      if (historicoExtenso && cadeia.some(c => c.metodo === 'range')) {
        const range = cadeia.find(c => c.metodo === 'range')!.args as number[];
        return historicoExtenso.slice(range[0], range[1] + 1);
      }
      // DUAS consultas batem nesta tabela e querem coisas diferentes: a faxina
      // do vencimento lê a sessão inteira, a da RETENÇÃO pede só o par
      // (session_id, auth_email). O mock não aplica filtros, então distinguir
      // pelas COLUNAS é o que impede a retenção de "ver" o vencido de agora e
      // apagar um colaborador que o teste afirma que fica.
      return cols === 'session_id,auth_email' ? foraDaRetencao : [expired, active];
    }
    if (table === 'colaboradores') {
      return [{ id: 'colab-expired', mapeamento_em: '2026-09-01T18:30:00.000Z' }];
    }
    if (table === 'admin_audit_log') return auditoriaDoConvite;
    return [];
  },
});

const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
const listUsers = vi.fn(async () => ({
  data: {
    users: [expired, active].map((row, index) => ({
      id: `auth-${index + 1}`,
      email: row.auth_email,
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_session_id: row.session_id,
        expires_at: row.expires_at,
      },
    })),
  },
  error: null,
}));

sb.client.auth = { admin: { listUsers, deleteUser } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async () => ({ id: 'acme-id', slug: 'acme-demo' })),
}));

import {
  MARCA_LEAD_REMOVIDO,
  cleanupExpiredAcmeProspects,
  listAcmeProspectProgress,
  recordAcmeProspectPersonalAccess,
} from '@/lib/demo/acme-prospect-tracking';

describe('acompanhamento dos prospects ACME', () => {
  beforeEach(() => {
    historicoExtenso = null;
    sb.reset();
    deleteUser.mockClear();
    listUsers.mockClear();
    foraDaRetencao = [];
    auditoriaDoConvite = [];
  });

  it('lê a segunda página para que métricas não sejam truncadas em 50 ou 500 convites', async () => {
    historicoExtenso = Array.from({length:501}, (_,i) => ({...active, session_id: String(i).padStart(20,'0'), disc_completed_at:'2026-09-01'}));
    const rows = await listAcmeProspectProgress(sb.client);
    expect(rows).toHaveLength(501);
    expect(sb.usou('demo_prospect_sessions','range',500)).toBe(true);
  });

  it('fecha somente o vencido, preserva o DISC e mantém o ativo para bloquear o reset', async () => {
    const result = await cleanupExpiredAcmeProspects(
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(result).toMatchObject({
      expiredRemoved: 1,
      activeCount: 1,
      nextExpiry: '2026-09-03T07:00:00.000Z',
    });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('auth-1');
    // 🔑 VENCER É PERDER O ACESSO, NÃO O TRABALHO (03/09/2026): a conta do Auth
    // sai — é ela que deixa a pessoa entrar —, mas o colaborador FICA, com o
    // DISC nas colunas dele. Antes, vencer apagava tudo e quem voltasse um dia
    // depois não encontrava "expirado", encontrava o nada. Quem apaga de vez é
    // a retenção, muito depois, e por `access_closed_at`.
    const apagouColaboradorNoVencimento = sb.escritas.some((escrita) => (
      escrita.tabela === 'colaboradores' && escrita.op === 'delete'
    ));
    expect(apagouColaboradorNoVencimento).toBe(false);
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: { disc_completed_at: '2026-09-01T18:30:00.000Z' },
    }));
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: { access_closed_at: '2026-09-02T07:00:00.000Z' },
    }));
  });

  it('a retenção apaga o convidado fechado há muito tempo — e só ele', async () => {
    foraDaRetencao = [{ session_id: '33333333333333333333', auth_email: 'convidado.acme.33333333333333333333@vertho.ai' }];

    const result = await cleanupExpiredAcmeProspects(
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(result.retidosRemovidos).toBe(1);
    const deletes = sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op === 'delete');
    // exatamente um: o que saiu da janela. O vencido de agora continua de pé.
    expect(deletes).toHaveLength(1);
  });

  describe('a retenção também apaga o nome e a empresa do lead (R-127)', () => {
    const vencida = { session_id: '33333333333333333333', auth_email: 'convidado.acme.33333333333333333333@vertho.ai' };
    const rodar = () => cleanupExpiredAcmeProspects(new Date('2026-09-02T07:00:00.000Z'), sb.client);
    const updates = (tabela: string) => sb.escritas.filter((e) => e.tabela === tabela && e.op === 'update');

    it('a sessão fica (a medição do funil), mas o nome e a empresa viram a marca', async () => {
      foraDaRetencao = [vencida];
      await rodar();
      expect(updates('demo_prospect_sessions')).toContainEqual(expect.objectContaining({
        payload: { prospect_name: MARCA_LEAD_REMOVIDO, prospect_company: MARCA_LEAD_REMOVIDO },
      }));
      // Nenhum delete da sessão: o carimbo de convite aberto e de contato clicado é o funil.
      expect(sb.escritas.some((e) => e.tabela === 'demo_prospect_sessions' && e.op === 'delete')).toBe(false);
      const cadeia = sb.chamadas.filter((c) => c.tabela === 'demo_prospect_sessions');
      expect(cadeia).toContainEqual(expect.objectContaining({ metodo: 'eq', args: ['session_id', vencida.session_id] }));
    });

    it('o registro do audit log do convite perde o nome e a empresa, e guarda o resto', async () => {
      foraDaRetencao = [vencida];
      auditoriaDoConvite = [{
        id: 'audit-1',
        detalhes: { sessionId: vencida.session_id, nome: 'Marina Souza', empresa: 'Empresa Horizonte', cargo: 'Representante Comercial', versao: 'C' },
      }];
      await rodar();
      const [gravacao] = updates('admin_audit_log');
      expect(gravacao.payload.detalhes).toEqual({
        sessionId: vencida.session_id, nome: MARCA_LEAD_REMOVIDO, empresa: MARCA_LEAD_REMOVIDO, cargo: 'Representante Comercial', versao: 'C',
      });
      expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'admin_audit_log', metodo: 'eq', args: ['id', 'audit-1'] }));
      // Só as linhas DESTA sessão e desta ação: o resto do audit log não é tocado.
      expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'admin_audit_log', metodo: 'eq', args: ['acao', 'demo.prepare_prospect_experience'] }));
      expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'admin_audit_log', metodo: 'eq', args: ['detalhes->>sessionId', vencida.session_id] }));
    });

    it('registro de erro do convite (sem nome nem empresa) não é reescrito', async () => {
      foraDaRetencao = [vencida];
      auditoriaDoConvite = [{ id: 'audit-2', detalhes: { sessionId: vencida.session_id, error: 'falha' } }];
      await rodar();
      expect(updates('admin_audit_log')).toEqual([]);
    });

    it('quem já foi anonimizado não volta à fila (o filtro exclui a marca)', async () => {
      foraDaRetencao = [vencida];
      await rodar();
      expect(sb.chamadas).toContainEqual(expect.objectContaining({
        tabela: 'demo_prospect_sessions', metodo: 'neq', args: ['prospect_name', MARCA_LEAD_REMOVIDO],
      }));
    });

    it('🔴 falha ao anonimizar a sessão LANÇA: o cron não pode contar como retido o que ainda tem nome', async () => {
      foraDaRetencao = [vencida];
      sb.falharEm({ tabela: 'demo_prospect_sessions', op: 'update', mensagem: 'timeout no pool', quando: (p) => 'prospect_name' in p });
      await expect(rodar()).rejects.toThrow(/anonimizar sessão do convite: timeout no pool/);
    });

    it('🔴 falha ao reescrever o audit log LANÇA, em vez de seguir calada', async () => {
      foraDaRetencao = [vencida];
      auditoriaDoConvite = [{ id: 'audit-1', detalhes: { sessionId: vencida.session_id, nome: 'Marina', empresa: 'Horizonte' } }];
      sb.falharEm({ tabela: 'admin_audit_log', op: 'update', mensagem: 'sem permissão' });
      await expect(rodar()).rejects.toThrow(/anonimizar o audit log do convite: sem permissão/);
    });

    it('sem ninguém fora da janela, nada é anonimizado', async () => {
      foraDaRetencao = [];
      await rodar();
      expect(sb.escritas.some((e) => e.tabela === 'admin_audit_log')).toBe(false);
      expect(updates('demo_prospect_sessions').some((e) => 'prospect_name' in e.payload)).toBe(false);
    });
  });

  it('lista o histórico em contrato camelCase e recupera o DISC já salvo', async () => {
    const result = await listAcmeProspectProgress(sb.client);

    expect(result[0]).toMatchObject({
      sessionId: expired.session_id,
      nome: 'Marina Souza',
      empresa: 'Empresa Horizonte',
      discCompletedAt: '2026-09-01T18:30:00.000Z',
    });
    expect(sb.usou('demo_prospect_sessions', 'order', 'created_at')).toBe(true);
    expect(sb.usou('demo_prospect_sessions', 'range', 0)).toBe(true);
  });

  it('registra o primeiro acesso somente para um Auth válido e ainda no prazo', async () => {
    const recorded = await recordAcmeProspectPersonalAccess({
      email: active.auth_email,
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_session_id: active.session_id,
        expires_at: '2999-09-03T07:00:00.000Z',
      },
    });

    expect(recorded).toBe(true);
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: expect.objectContaining({ personal_accessed_at: expect.any(String) }),
    }));
  });

  it('🔴 registra o acesso do convidado de OUTRO ambiente (Grupo Sinal), não só do ACME', async () => {
    // `Medido 16/09/2026`: os 3 passaportes do Grupo Sinal abriram sessão e
    // ficaram com o carimbo nulo, porque a conta não era reconhecida.
    const recorded = await recordAcmeProspectPersonalAccess({
      email: 'convidado.gruposinal.33333333333333333333@vertho.ai',
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_session_id: '33333333333333333333',
        expires_at: '2999-09-03T07:00:00.000Z',
      },
    });

    expect(recorded).toBe(true);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions', metodo: 'eq', args: ['session_id', '33333333333333333333'],
    }));
  });

  it('conta sem forma de passaporte não gera carimbo, mesmo com o marcador no metadado', async () => {
    const recorded = await recordAcmeProspectPersonalAccess({
      email: 'convidado.gruposinal.curto@vertho.ai',
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        expires_at: '2999-09-03T07:00:00.000Z',
      },
    });

    expect(recorded).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });
});
