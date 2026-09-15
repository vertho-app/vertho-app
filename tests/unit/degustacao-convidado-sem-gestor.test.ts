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
 * 🔑 A PROTEÇÃO É O CAMPO NULO, NÃO UM FILTRO — e é por isso que o terceiro
 * caso existe. A listagem do gestor continua sem conhecer a noção de convidado:
 * se alguém repuser o vínculo, o vazamento volta inteiro. O caso injetado prova
 * que este arquivo TEM poder de detecção, ou seja, que a ausência afirmada no
 * segundo caso vem do dado e não de um instrumento cego.
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

describe('convidado da degustação fora do escopo do gestor', () => {
  beforeEach(() => {
    isDemo = true;
    liderados = [];
    sb.reset();
    vi.clearAllMocks();
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

  it('caso injetado: repor o vínculo devolve o vazamento — a proteção é o campo nulo', async () => {
    const convidado = await criarConvidado('Marina Souza');
    // O convidado exatamente como ele era antes de 15/09/2026: mesmo payload,
    // com a chefia de volta. Nada mais muda.
    liderados = [PERSONA_DO_ELENCO, { ...convidado, gestor_email: GERENTE.email }];

    const equipe = await equipeDaGerente();

    // Este `toContain` documenta o defeito, não o aprova: a listagem do gestor
    // não filtra convidado, então quem garante o isolamento é o `null` da
    // criação. Se este caso deixar de vazar, ganhamos uma segunda camada e o
    // teste deve ser reescrito para exigir as duas.
    expect(equipe).toContain('Marina Souza');
    expect(equipe).toHaveLength(2);
  });
});
