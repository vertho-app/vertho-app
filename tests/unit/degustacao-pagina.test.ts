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
let cargo: any = null;

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'demo_prospect_sessions') return sessao;
    if (tabela === 'colaboradores') return colaborador;
    if (tabela === 'cargos_empresa') return cargo;
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
import { emitirPasseDegustacao, verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { emitirCodigoCurto, lerCodigoCurto } from '@/lib/demo/degustacao-link-curto';
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
    colaborador = { id: 'colab-1', mapeamento_em: null, cargo: 'Representante Comercial' };
    respostas = [];
    cargo = { top5_workshop: ['Negociação e Fechamento', 'Relacionamento e Pós-venda'] };
  });

  it('🔴 abrir a página não grava nada e não chama o Auth', async () => {
    const pagina = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');

    expect(pagina.status).toBe('ok');
    expect(sb.escritas).toHaveLength(0);
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(sb.client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(sb.client.auth.getUser).not.toHaveBeenCalled();
  });

  it('visões na ordem gestor, RH, colaborador, com ticket válido para o ambiente e a sessão', async () => {
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');

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
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe('escolas-acme') }, 'escolas-acme.vertho.ai');
    expect(pagina.visoes[0].titulo).toBe('O que a coordenação acompanha');
    expect(new URL(pagina.visoes[0].url).hostname).toBe('coordenacao-escolas.vertho.ai');
  });

  it('host de sala de apresentação ou de outro ambiente não abre a página', async () => {
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'gestor-demo.vertho.ai')).status).toBe('invalido');
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'escolas-acme.vertho.ai')).status).toBe('invalido');
  });

  it('sessão vencida ou fechada: "expirado", sem lançar (o ticket não é emitido)', async () => {
    sessao = { ...sessao, expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai')).status).toBe('expirado');
    sessao = { ...sessao, expires_at: new Date(Date.now() + 86_400_000).toISOString(), access_closed_at: '2026-09-16T00:00:00.000Z' };
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai')).status).toBe('expirado');
  });

  it('erro de banco é "indisponível", não "expirado"', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout no pool' });
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai')).status).toBe('indisponivel');
  });

  it('estado pessoal só com fatos do banco, e sem nenhum campo de resultado', async () => {
    colaborador = { ...colaborador, mapeamento_em: '2026-09-16T18:30:00.000Z' };
    respostas = [{ id: 'r1', nivel_ia4: 3, nota_ia4: 3.2 }];
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');

    expect(pagina.pessoal).toEqual({
      discFeito: true, respondeuSituacao: true, devolutivaPronta: true, situacaoDisponivel: true, passo: 'ler-devolutiva',
    });
    // quem tem o link não vê resultado por aqui (os campos de credencial saem da
    // comparação: base64 aleatório pode conter qualquer sequência de letras)
    const { passe: _passe, visoes, ...resto } = pagina;
    const semCredenciais = { ...resto, visoes: visoes.map(({ url: _url, ...visao }: any) => visao) };
    // Por CHAVE, não por substring: "situacaoDisponivel" contém "nivel" e casava.
    const json = JSON.stringify(semCredenciais);
    expect(json).not.toMatch(/"(nivel|nota|perfil|feedback|avaliacao|pontos)[^"]*":/);
    expect(json).not.toContain('3.2');
    // e as respostas são lidas no tenant certo
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'respostas', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
  });

  it('respondeu mas a avaliação ainda não voltou: aguardando a devolutiva', async () => {
    colaborador = { ...colaborador, mapeamento_em: '2026-09-16T18:30:00.000Z' };
    respostas = [{ id: 'r1', nivel_ia4: null, nota_ia4: null }];
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(pagina.pessoal.passo).toBe('aguardar-devolutiva');
  });

  it('fez o DISC e o cargo tem situação: oferece responder', async () => {
    colaborador = { ...colaborador, mapeamento_em: '2026-09-16T18:30:00.000Z' };
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(pagina.pessoal.passo).toBe('responder-situacao');
  });

  it('🔴 cargo que só lidera (Top 5 vazio ou sem linha): depois do DISC, só o perfil', async () => {
    // o cargo da linha do convite difere do colaborador de propósito: quem decide é o do COLABORADOR
    sessao = { ...sessao, cargo: 'Cargo escrito no convite' };
    colaborador = { id: 'colab-1', mapeamento_em: '2026-09-16T18:30:00.000Z', cargo: 'Gerente Comercial' };
    for (const semSituacao of [{ top5_workshop: [] }, { top5_workshop: null }, null]) {
      sb.reset();
      cargo = semSituacao;
      const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
      expect(pagina.pessoal).toMatchObject({ situacaoDisponivel: false, passo: 'perfil-pronto' });
      // a pergunta é feita pelo cargo do COLABORADOR (a mesma chave da avaliação), no tenant certo
      expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'cargos_empresa', metodo: 'eq', args: ['nome', 'Gerente Comercial'] }));
      expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'cargos_empresa', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
    }
  });

  it('erro ao ler o cargo é "indisponível", não um convite errado', async () => {
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout no pool' });
    expect((await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai')).status).toBe('indisponivel');
  });
});

describe('página de boas-vindas pelo LINK CURTO (/c/<código>)', () => {
  beforeEach(() => {
    sb.reset();
    vi.clearAllMocks();
    sessao = {
      colaborador_id: 'colab-1',
      prospect_name: 'Andrea de Paula',
      cargo: 'Representante Comercial',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
      colaborador_accessed_at: null,
      gestor_accessed_at: null,
      rh_accessed_at: null,
      disc_completed_at: null,
    };
    colaborador = { id: 'colab-1', mapeamento_em: null, cargo: 'Representante Comercial' };
    respostas = [];
    cargo = { top5_workshop: ['Negociação e Fechamento'] };
  });

  it('abre a mesma página, sem escrever, e devolve o passe DESTA sessão para os formulários', async () => {
    const codigo = emitirCodigoCurto('acme-demo', SID);
    const pagina: any = await carregarPaginaDaDegustacao({ codigo }, 'acme-demo.vertho.ai');

    expect(pagina.status).toBe('ok');
    expect(verificarPasseDegustacao(pagina.passe)).toMatchObject({ tenant: 'acme-demo', sid: SID });
    expect(sb.escritas).toHaveLength(0);
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });

  it('as visões levam o código de volta, e ele é desta sessão', async () => {
    const pagina: any = await carregarPaginaDaDegustacao({ codigo: emitirCodigoCurto('acme-demo', SID) }, 'acme-demo.vertho.ai');
    for (const visao of pagina.visoes) {
      const volta = new URL(visao.url).searchParams.get('volta');
      expect(lerCodigoCurto(volta, 'acme-demo')).toBe(SID);
    }
  });

  it('🔴 código de outro ambiente, adulterado ou montado só com a sessão não abre, e nem consulta o banco', async () => {
    const deOutroAmbiente = emitirCodigoCurto('gruposinal', SID);
    const legitimo = emitirCodigoCurto('acme-demo', SID);
    const adulterado = `${legitimo.slice(0, -1)}${legitimo.endsWith('A') ? 'B' : 'A'}`;
    // quem só conhece o id da sessão (ele aparece em claro no ticket da sala)
    const semAssinatura = Buffer.concat([Buffer.from(SID, 'hex'), Buffer.alloc(8)]).toString('base64url');

    for (const codigo of [deOutroAmbiente, adulterado, semAssinatura, 'curto', '']) {
      expect((await carregarPaginaDaDegustacao({ codigo }, 'acme-demo.vertho.ai')).status).toBe('expirado');
    }
    expect(sb.chamadas).toHaveLength(0);
  });
});
