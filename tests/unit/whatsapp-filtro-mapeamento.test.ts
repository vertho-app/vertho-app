import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O filtro de MAPEAMENTO da tela de envios, no servidor: concluído, em andamento e pendente. Prova, com a regra de andamento REAL
 * (`lib/mapeamento-progresso`, só as fronteiras são mockadas), que cada caminho que aceita o filtro (lote de template e magic link;
 * o e-mail usa o mesmo par de linhas) escolhe as pessoas certas. Três pessoas, uma em cada estado:
 *   ana  = respondeu as 2 competências do cargo        -> completo
 *   bia  = respondeu 1 de 2                            -> em andamento
 *   caio = não respondeu nada                          -> não iniciado
 * "Pendente" é bia + caio; "em andamento" é só a bia (era a lacuna: a 4Life tinha 2 pessoas assim e a tela não as separava).
 */
const COLABS = [
  { id: 'ana', nome_completo: 'Ana Souza', email: 'ana@escola.test', cargo: 'PROF', telefone: '(11) 99999-0001', perfil_dominante: null },
  { id: 'bia', nome_completo: 'Bia Lima', email: 'bia@escola.test', cargo: 'PROF', telefone: '(11) 99999-0002', perfil_dominante: null },
  { id: 'caio', nome_completo: 'Caio Reis', email: 'caio@escola.test', cargo: 'PROF', telefone: '(11) 99999-0003', perfil_dominante: null },
];
const RESPOSTAS = [
  { colaborador_id: 'ana', competencia_id: 'c1', cargo: 'PROF' },
  { colaborador_id: 'ana', competencia_id: 'c2', cargo: 'PROF' },
  { colaborador_id: 'bia', competencia_id: 'c1', cargo: 'PROF' },
];
const CENARIOS = [{ cargo: 'PROF', competencia_id: 'c1' }, { cargo: 'PROF', competencia_id: 'c2' }];

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8';
let sb = criarSupabaseMock();
const generateLink = vi.fn(async (_o: any) => ({ data: { properties: { hashed_token: TOKEN, action_link: 'https://supabase.test/verify' } }, error: null as any }));
const createUser = vi.fn(async (_o: any) => ({ error: null }));
const publicarTemplate = vi.fn(async (_p: any, _d?: number) => {});
const sendEmail = vi.fn(async (_b: any) => ({ ok: true }));
const prepararLote = vi.fn(async (_sb: any, args: any) => ({
  template: args.template, corpo: '', alvos: [], totalNoEscopo: args.colabs.length, elegiveisPeloTemplate: 0, removidosPorFiltros: 0,
  aposRefinamentos: 0, jaReceberam: 0, reenvios: 0, excluidos: [], adiadosPorTeto: 0, avisoTeto: null,
}));

function novoBanco() {
  sb = criarSupabaseMock({
    resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
    lista: (t) => (t === 'colaboradores' ? COLABS : t === 'respostas' ? RESPOSTAS : t === 'banco_cenarios' ? CENARIOS : []),
  });
  (sb.client as any).auth = { admin: { generateLink, createUser } };
}

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));
vi.mock('@/lib/demo/envio-guard', () => ({ gateEnvioDemo: vi.fn(async () => ({ blocked: false })) }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));
vi.mock('@/lib/email-provider', () => ({ sendEmail: (b: any) => sendEmail(b), emailConfigurationError: () => null }));
vi.mock('@/lib/qstash-publish', () => ({
  publicarTemplateCloudCis: (p: any, d?: number) => publicarTemplate(p, d),
  publicarWhatsappCis: vi.fn(async () => {}),
}));
vi.mock('@/lib/whatsapp/cloud-api', async (orig) => ({ ...(await orig<any>()), cloudApiConfigurada: () => true }));
vi.mock('@/lib/notifications/pilula-template', async (orig) => ({
  ...(await orig<any>()),
  templateAtivo: (papel: string) => (papel === 'acesso' ? 'acesso_vertho' : null),
}));
vi.mock('@/lib/notifications/envio-template-lote', async (orig) => ({
  ...(await orig<any>()),
  prepararLoteTemplate: (s: any, a: any) => prepararLote(s, a),
}));

import { dispararMensagemCustomizada, enviarMagicLinksWhatsApp, previewTemplateWhatsApp } from '@/app/admin/whatsapp/actions';

const destinosDoEmail = () => sendEmail.mock.calls.map((c) => c[0].to).sort();
const emailsDosLinks = () => generateLink.mock.calls.map((c) => c[0].email).sort();
const idsDoLote = () => [...(prepararLote.mock.calls.at(-1)![1].idsRefinados as Set<string>)].sort();

beforeEach(() => {
  novoBanco();
  for (const f of [generateLink, createUser, publicarTemplate, prepararLote, sendEmail]) f.mockClear();
  process.env.QSTASH_TOKEN = 'qstash-teste';
});

describe('magic link: filtro `mapeamento`', () => {
  it.each([
    ['completo', ['ana@escola.test']],
    ['andamento', ['bia@escola.test']],
    ['pendente', ['bia@escola.test', 'caio@escola.test']],
  ])('%s', async (filtro, esperado) => {
    const r = await enviarMagicLinksWhatsApp('emp-1', { mapeamento: filtro });
    expect(r.success).toBe(true);
    expect(emailsDosLinks()).toEqual(esperado);
  });

  it('sem filtro: as três', async () => {
    await enviarMagicLinksWhatsApp('emp-1', {});
    expect(emailsDosLinks()).toEqual(['ana@escola.test', 'bia@escola.test', 'caio@escola.test']);
  });

  it('falha ao ler o andamento RECUSA o disparo (nada de "pendente" valendo para todo mundo) e não gera link nenhum', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout no pool' });
    const r = await enviarMagicLinksWhatsApp('emp-1', { mapeamento: 'pendente' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/respostas: timeout no pool/);
    expect(generateLink).not.toHaveBeenCalled();
    expect(publicarTemplate).not.toHaveBeenCalled();
  });
});

describe('e-mail: filtro `mapeamento`', () => {
  it.each([
    ['completo', ['ana@escola.test']],
    ['andamento', ['bia@escola.test']],
    ['pendente', ['bia@escola.test', 'caio@escola.test']],
  ])('%s', async (filtro, esperado) => {
    const r: any = await dispararMensagemCustomizada('emp-1', 'Olá {{nome}}', 'email', { mapeamento: filtro }, 'Aviso');
    expect(r.success).toBe(true);
    expect(destinosDoEmail()).toEqual(esperado);
  });

  it('sem filtro: as três', async () => {
    await dispararMensagemCustomizada('emp-1', 'Olá {{nome}}', 'email', {}, 'Aviso');
    expect(destinosDoEmail()).toEqual(['ana@escola.test', 'bia@escola.test', 'caio@escola.test']);
  });

  it('falha ao ler o andamento RECUSA o envio: nenhum e-mail sai', async () => {
    sb.falharEm({ tabela: 'respostas', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await dispararMensagemCustomizada('emp-1', 'Olá {{nome}}', 'email', { mapeamento: 'pendente' }, 'Aviso');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/respostas: timeout no pool/);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('lote de template: `mapeamentoCompleto` (booleano) e `mapeamentoEmAndamento`', () => {
  it('mapeamentoEmAndamento: só quem respondeu parte', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoEmAndamento: true });
    expect(idsDoLote()).toEqual(['bia']);
  });

  it('mapeamentoCompleto true: só quem concluiu', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoCompleto: true });
    expect(idsDoLote()).toEqual(['ana']);
  });

  it('mapeamentoCompleto false: pendente = quem começou E quem não começou (não é o "em andamento")', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoCompleto: false });
    expect(idsDoLote()).toEqual(['bia', 'caio']);
  });

  it('sem filtro de mapeamento: todos, e o andamento nem é lido', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', {});
    expect(idsDoLote()).toEqual(['ana', 'bia', 'caio']);
    expect(sb.usou('respostas', 'select')).toBe(false);
  });

  it('só o `true` ESTRITO liga o "em andamento" (o valor vem do cliente: "true" como texto ou 1 não liga)', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoEmAndamento: 'true' });
    expect(idsDoLote()).toEqual(['ana', 'bia', 'caio']);
    await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoEmAndamento: 1 });
    expect(idsDoLote()).toEqual(['ana', 'bia', 'caio']);
  });

  it('combina com o filtro de perfil: "Sem perfil + Em andamento" é a bia (a pergunta da 4Life)', async () => {
    await previewTemplateWhatsApp('emp-1', 'qualquer', { disc: 'nao', mapeamentoEmAndamento: true });
    expect(idsDoLote()).toEqual(['bia']);
  });

  it('"Sem perfil + Concluído" continua vazio quando a única concluída tem perfil', async () => {
    novoBanco();
    sb = criarSupabaseMock({
      resolver: (t) => (t === 'empresas' ? { nome: 'Escola Teste', slug: 'escolateste' } : null),
      lista: (t) => (t === 'colaboradores' ? [{ ...COLABS[0], perfil_dominante: 'DI' }, COLABS[1], COLABS[2]] : t === 'respostas' ? RESPOSTAS : t === 'banco_cenarios' ? CENARIOS : []),
    });
    await previewTemplateWhatsApp('emp-1', 'qualquer', { disc: 'nao', mapeamentoCompleto: true });
    expect(idsDoLote()).toEqual([]);
  });

  it('falha ao ler o andamento vira erro da prévia, não "0 pessoas"', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'sem acesso' });
    const r: any = await previewTemplateWhatsApp('emp-1', 'qualquer', { mapeamentoEmAndamento: true });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/cenários: sem acesso/);
    expect(prepararLote).not.toHaveBeenCalled();
  });
});
