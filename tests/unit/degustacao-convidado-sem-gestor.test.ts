import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O convidado da degustação não é liderado de NINGUÉM.
 *
 * 🔴 O DEFEITO QUE ISTO TRAVA. O convidado nascia com
 * `gestor_email: 'carla.demo@vertho.ai'` — a gerente do roster comercial —, por
 * cópia do padrão das personas de Representante Comercial, desde o commit que
 * criou a experiência (`d1b559c4`, 31/08/2026). Só que a visão GESTOR que o
 * prospect recebe nas etapas 02–04 loga exatamente como ela, e
 * `resolverEscopoDoGestor` lista liderados por `gestor_email` sem filtro algum
 * de convidado. Resultado: cada visitante da degustação lia o NOME REAL e o
 * cargo de todos os que haviam degustado antes dele. `Medido 15/09/2026:` 10 de
 * 10 convidados vivos (7 no `acme-demo`, 3 no `gruposinal`) apareciam na equipe
 * da Carla.
 *
 * 🔑 SÃO DUAS CAMADAS DESDE 16/09/2026, e este arquivo exige as duas. A
 * primeira é o campo nulo da criação (o convidado não é liderado de ninguém). A
 * segunda é o recorte de ELENCO em tenant de demonstração (`recortarElencoDemo`),
 * que nasceu porque a visão de RH enxerga a empresa inteira e o campo nulo não a
 * alcança. O caso injetado repõe o vínculo e prova que a segunda camada segura
 * sozinha; o caso do tenant de cliente prova que o recorte é do AMBIENTE e que
 * este arquivo tem poder de detecção (lá o vínculo reposto aparece, como deve).
 *
 * A entrada da listagem é o payload REAL do insert de criação, nunca uma
 * fixture escrita à mão: uma fixture provaria apenas que ela mesma está certa.
 */

let isDemo = true;
let liderados: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { id: 'acme-id', is_demo: isDemo } : null),
  lista: (tabela) => (tabela === 'colaboradores' ? liderados : []),
});

const createUser = vi.fn(async () => ({ data: { user: { id: 'auth-guest-1' } }, error: null }));
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: 'guest-token-hash' } },
  error: null,
}));
const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));

sb.client.auth = { admin: { createUser, generateLink, deleteUser, listUsers } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async () => ({
    id: 'acme-id', nome: 'ACME Demo', slug: 'acme-demo', ui_config: {},
  })),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => null,
}));

import { prepareAcmeProspectExperience } from '@/lib/demo/acme-prospect-experience';
import { resolverEscopoDoGestor } from '@/app/dashboard/gestor/actions';
import { resetEnvioGuardCache } from '@/lib/demo/envio-guard';

/** A gerente do roster comercial, que é quem a visão GESTOR da sala loga. */
const GERENTE = { id: 'carla-id', email: 'carla.demo@vertho.ai' };

/** Uma persona do elenco, liderada de verdade — o controle positivo. */
const PERSONA_DO_ELENCO = {
  id: 'bruna-id',
  nome_completo: 'Bruna Costa',
  email: 'bruna.demo@vertho.ai',
  cargo: 'Representante Comercial',
  role: 'colaborador',
  gestor_email: GERENTE.email,
};

/** Cria um convidado de verdade e devolve o payload que foi ao banco. */
async function criarConvidado(nome: string) {
  const result = await prepareAcmeProspectExperience({
    nome,
    empresa: 'Empresa Horizonte',
    roleKey: 'representante-comercial',
  });
  expect(result.ok).toBe(true);
  const insert = sb.escritas.find((w) => w.tabela === 'colaboradores' && w.op === 'insert');
  expect(insert?.payload).toBeTruthy();
  return insert!.payload;
}

async function equipeDaGerente() {
  const { liderados: vistos } = await resolverEscopoDoGestor(sb.client, {
    empresaId: 'acme-id',
    meuId: GERENTE.id,
    meuEmail: GERENTE.email,
    isGestor: true,
    isTutor: false,
    tutoradosIds: [],
  });
  return vistos.map((c: any) => c.nome_completo);
}

/** A visão de RH da sala: nem gestor nem tutor, enxerga a empresa inteira. */
async function equipeDoRh() {
  const { liderados: vistos } = await resolverEscopoDoGestor(sb.client, {
    empresaId: 'acme-id',
    meuId: 'helena-id',
    meuEmail: 'helena.demo@vertho.ai',
    isGestor: false,
    isTutor: false,
    tutoradosIds: [],
  });
  return vistos.map((c: any) => c.nome_completo);
}

describe('convidado da degustação fora do escopo do gestor', () => {
  beforeEach(() => {
    isDemo = true;
    liderados = [];
    sb.reset();
    vi.clearAllMocks();
    // `isTenantDemo` guarda a resposta por 60 s: sem limpar, o caso que troca o
    // ambiente leria o `is_demo` do caso anterior.
    resetEnvioGuardCache();
    createUser.mockResolvedValue({ data: { user: { id: 'auth-guest-1' } }, error: null });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'guest-token-hash' } },
      error: null,
    });
    deleteUser.mockResolvedValue({ data: {}, error: null });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';
  });

  it('nasce sem vínculo de gestor', async () => {
    const convidado = await criarConvidado('Marina Souza');

    // As três pontas do vínculo, porque a listagem casa por e-mail mas a tela
    // mostra o nome: deixar `gestor_nome` para trás exibiria uma chefia que a
    // régua não reconhece.
    expect(convidado.gestor_email).toBeNull();
    expect(convidado.gestor_nome).toBeNull();
    expect(convidado.gestor_whatsapp).toBeNull();
    // O convidado continua sendo gente do tenant de demonstração: o que ele
    // perdeu é a chefia, não o vínculo com a empresa.
    expect(convidado.empresa_id).toBe('acme-id');
    expect(convidado.role).toBe('colaborador');
  });

  it('não aparece na equipe da gerente, e a persona do elenco aparece', async () => {
    const convidado = await criarConvidado('Marina Souza');
    liderados = [PERSONA_DO_ELENCO, convidado];

    const equipe = await equipeDaGerente();

    // Controle positivo NA MESMA chamada: sem ele, uma listagem quebrada (ou um
    // mock que devolvesse vazio) passaria como se fosse isolamento.
    expect(equipe).toContain('Bruna Costa');
    expect(equipe).not.toContain('Marina Souza');
    expect(equipe).toHaveLength(1);
  });

  it('caso injetado: com o vínculo reposto, o recorte de elenco segura sozinho no tenant demo', async () => {
    const convidado = await criarConvidado('Marina Souza');
    // O convidado exatamente como ele era antes de 15/09/2026: mesmo payload,
    // com a chefia de volta. Nada mais muda.
    liderados = [PERSONA_DO_ELENCO, { ...convidado, gestor_email: GERENTE.email }];

    const equipe = await equipeDaGerente();

    expect(equipe).toContain('Bruna Costa');
    expect(equipe).not.toContain('Marina Souza');
    expect(equipe).toHaveLength(1);
  });

  it('controle: em tenant de CLIENTE o mesmo vínculo aparece, porque o recorte é do ambiente', async () => {
    isDemo = false;
    const convidado = await criarConvidadoEmTenantDeCliente('Marina Souza');
    liderados = [PERSONA_DO_ELENCO, { ...convidado, gestor_email: GERENTE.email }];

    const equipe = await equipeDaGerente();

    // Sem este caso, um recorte que escondesse todo mundo em todo tenant (ou um
    // mock que nunca devolvesse o convidado) passaria como isolamento.
    expect(equipe).toContain('Marina Souza');
    expect(equipe).toHaveLength(2);
  });
});

/**
 * O payload do convidado é sempre criado em tenant demo (a criação recusa outro).
 * Para o controle do tenant de cliente, o MESMO payload é lido depois de o
 * ambiente virar "cliente": o que muda é só a resposta de `is_demo`.
 */
async function criarConvidadoEmTenantDeCliente(nome: string) {
  isDemo = true;
  const payload = await criarConvidado(nome);
  isDemo = false;
  resetEnvioGuardCache();
  return payload;
}

describe('visão de RH da sala de apresentação', () => {
  beforeEach(() => {
    isDemo = true;
    liderados = [];
    sb.reset();
    vi.clearAllMocks();
    resetEnvioGuardCache();
    createUser.mockResolvedValue({ data: { user: { id: 'auth-guest-1' } }, error: null });
    deleteUser.mockResolvedValue({ data: {}, error: null });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';
  });

  it('🔴 em tenant demo o RH vê só o elenco: convidado sem gestor e cadastro externo ficam fora', async () => {
    const convidado = await criarConvidado('Lucianna Prospect');
    const cadastroExterno = {
      id: 'externo-id',
      nome_completo: 'Alpheu Cadastro',
      email: 'alpheu@empresa-real.com.br',
      cargo: 'Representante Comercial',
      role: 'colaborador',
      gestor_email: null,
    };
    liderados = [PERSONA_DO_ELENCO, convidado, cadastroExterno];

    const equipe = await equipeDoRh();

    // O campo nulo não protege aqui: o RH não filtra por gestor. É o recorte de
    // elenco que tira as duas pessoas reais da tela que todo prospect abre.
    expect(equipe).toEqual(['Bruna Costa']);
  });

  it('em tenant de cliente o RH continua vendo a empresa inteira', async () => {
    const convidado = await criarConvidadoEmTenantDeCliente('Lucianna Prospect');
    const pessoaReal = {
      id: 'real-id',
      nome_completo: 'Pessoa Real',
      email: 'pessoa@cliente.com.br',
      cargo: 'Analista',
      role: 'colaborador',
      gestor_email: null,
    };
    liderados = [PERSONA_DO_ELENCO, convidado, pessoaReal];

    const equipe = await equipeDoRh();

    expect(equipe).toEqual(['Bruna Costa', 'Lucianna Prospect', 'Pessoa Real']);
  });
});
