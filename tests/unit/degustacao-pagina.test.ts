import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Carregador da página de boas-vindas (`/degustacao`, versão B).
 *
 * 🔴 A invariante que importa: o GET da página NÃO escreve e NÃO autentica. É
 * exatamente o GET que o robô de preview do WhatsApp faz, e na versão A foi o GET
 * que criava sessão e carimbava "acesso" (`Medido 16/09/2026`: 6 de 8 prospects).
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'cccccccccccccccccccc';

let sessao: any = null;
let colaborador: any = null;
let respostas: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'demo_prospect_sessions') return sessao;
    if (tabela === 'colaboradores') return colaborador;
    return null;
  },
  lista: (tabela) => (tabela === 'respostas' ? respostas : []),
});
const authAdmin = { generateLink: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn() };
sb.client.auth = { admin: authAdmin, getUser: vi.fn(), verifyOtp: vi.fn() };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => (
    ['acme-demo', 'escolas-acme'].includes(slug) ? { id: `${slug}-id`, slug } : null
  )),
}));

import { carregarPaginaDaDegustacao } from '@/lib/demo/degustacao-hub';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';

const passe = (slug = 'acme-demo') => emitirPasseDegustacao(slug, SID, Math.floor(Date.now() / 1000) + 86_400);

describe('página de boas-vindas da degustação B', () => {
  beforeEach(() => {
    sb.reset();
    vi.clearAllMocks();
    sessao = {
      colaborador_id: 'colab-1',
      prospect_name: 'Andrea de Paula',
      cargo: 'Gerente Comercial',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
      colaborador_accessed_at: null,
      gestor_accessed_at: '2026-09-16T18:20:00.000Z',
      rh_accessed_at: null,
      disc_completed_at: null,
    };
    colaborador = { id: 'colab-1', mapeamento_em: null };
    respostas = [];
  });

  it('🔴 abrir a página não grava nada e não chama o Auth', async () => {
    const pagina = await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai');

    expect(pagina.status).toBe('ok');
    expect(sb.escritas).toHaveLength(0);
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(sb.client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(sb.client.auth.getUser).not.toHaveBeenCalled();
  });

  it('visões na ordem gestor, RH, colaborador, com ticket válido para o ambiente e a sessão', async () => {
    const pagina: any = await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai');

    expect(pagina.visoes.map((v: any) => v.roleKey)).toEqual(['gestor', 'rh', 'usuario']);
    expect(pagina.visoes.map((v: any) => new URL(v.url).hostname)).toEqual([
      'gestor-demo.vertho.ai', 'rh-demo.vertho.ai', 'usuario-demo.vertho.ai',
    ]);
    for (const visao of pagina.visoes) {
      const ticket = verifyDemoPresentationTicket(new URL(visao.url).searchParams.get('ticket'));
      expect(ticket).toMatchObject({ tenant: 'acme-demo', prospectSessionId: SID });
    }
    expect(pagina.visoes[0].vistoEm).toBe('2026-09-16T18:20:00.000Z');
    expect(pagina.visoes[1].vistoEm).toBeNull();
    expect(pagina.primeiroNome).toBe('Andrea');
  });

  it('escolas usam os hosts e a cópia da rede de escolas', async () => {
    const pagina: any = await carregarPaginaDaDegustacao(passe('escolas-acme'), 'escolas-acme.vertho.ai');
    expect(pagina.visoes[0].titulo).toBe('O que a coordenação acompanha');
    expect(new URL(pagina.visoes[0].url).hostname).toBe('coordenacao-escolas.vertho.ai');
  });

  it('host de sala de apresentação ou de outro ambiente não abre a página', async () => {
    expect((await carregarPaginaDaDegustacao(passe(), 'gestor-demo.vertho.ai')).status).toBe('invalido');
    expect((await carregarPaginaDaDegustacao(passe(), 'escolas-acme.vertho.ai')).status).toBe('invalido');
  });

  it('sessão vencida ou fechada: "expirado", sem lançar (o ticket não é emitido)', async () => {
    sessao = { ...sessao, expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect((await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai')).status).toBe('expirado');
    sessao = { ...sessao, expires_at: new Date(Date.now() + 86_400_000).toISOString(), access_closed_at: '2026-09-16T00:00:00.000Z' };
    expect((await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai')).status).toBe('expirado');
  });

  it('erro de banco é "indisponível", não "expirado"', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout no pool' });
    expect((await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai')).status).toBe('indisponivel');
  });

  it('estado pessoal só com fatos do banco, e sem nenhum campo de resultado', async () => {
    colaborador = { id: 'colab-1', mapeamento_em: '2026-09-16T18:30:00.000Z' };
    respostas = [{ id: 'r1', nivel_ia4: 3, nota_ia4: 3.2 }];
    const pagina: any = await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai');

    expect(pagina.pessoal).toEqual({
      discFeito: true, respondeuSituacao: true, devolutivaPronta: true, passo: 'ler-devolutiva',
    });
    // quem tem o link não vê resultado por aqui
    expect(JSON.stringify(pagina)).not.toMatch(/nivel|nota|perfil_dominante|feedback|3\.2/);
    // e as respostas são lidas no tenant certo
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'respostas', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
  });

  it('respondeu mas a avaliação ainda não voltou: aguardando a devolutiva', async () => {
    colaborador = { id: 'colab-1', mapeamento_em: '2026-09-16T18:30:00.000Z' };
    respostas = [{ id: 'r1', nivel_ia4: null, nota_ia4: null }];
    const pagina: any = await carregarPaginaDaDegustacao(passe(), 'acme-demo.vertho.ai');
    expect(pagina.pessoal.passo).toBe('aguardar-devolutiva');
  });
});
