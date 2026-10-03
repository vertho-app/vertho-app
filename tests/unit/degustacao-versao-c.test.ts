import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Degustação versão C (diagnóstico guiado, mig 273).
 *
 * A B tem 3 cartões por papel. A C faz o lead escolher UM desafio, ver a
 * resposta na sala e voltar. O que este arquivo segura é o que a C muda em
 * código que A e B já usavam: quatro pontos tratavam "não-B" como "A" em
 * silêncio (painel, lembrete, casa do convidado, coorte da métrica), e as
 * rotas de contato e exploração passaram a conhecer o desafio.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'cccccccccccccccccccc';
const expiry = () => Math.floor(Date.now() / 1000) + 3600;

let sessao: any = null;
let linhasDeSessao: any[] = [];
let email = '';
let limitado = false;
let colaborador: any = null;
let respostas: any[] = [];
let cargo: any = null;

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'demo_prospect_sessions') return sessao;
    if (tabela === 'empresas') return { id: 'acme-demo-id', is_demo: true };
    if (tabela === 'colaboradores') return colaborador;
    if (tabela === 'cargos_empresa') return cargo;
    return null;
  },
  lista: (tabela) => {
    if (tabela === 'demo_prospect_sessions') return linhasDeSessao;
    if (tabela === 'respostas') return respostas;
    return [];
  },
});
sb.client.auth = { admin: {}, getUser: vi.fn(), verifyOtp: vi.fn() };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => (
    ['acme-demo', 'gruposinal', 'escolas-acme'].includes(slug) ? { id: `${slug}-id`, slug } : null
  )),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: email ? { email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => (limitado ? { limited: true } : null) } }));

import { POST as contato } from '@/app/auth/degustacao/contato/route';
import { POST as contatoSala } from '@/app/auth/degustacao/contato-sala/route';
import { POST as exploracao } from '@/app/auth/degustacao/exploracao/route';
import { carregarPaginaDaDegustacao } from '@/lib/demo/degustacao-hub';
import { prepararConviteGuiado } from '@/lib/demo/degustacao-convite';
import { hrefDaCasaDoConvidado } from '@/lib/demo/degustacao-casa';
import { listDemoProspectProgress } from '@/lib/demo/acme-prospect-tracking';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';
import { issueDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import { getDemoPresentationRole } from '@/lib/demo/presentation';
import { rosterDemo } from '@/lib/demo/rosters';
import {
  DEGUSTACAO_VERSOES,
  buildDegustacaoConviteText,
  validateAcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';
import { mensagemDeContato, linkDeContatoDaDegustacao } from '@/lib/demo/degustacao-contato';
import { DEMO_TELEMETRY_VERSION, DEMO_TELEMETRY_VERSION_C, metricasDegustacao } from '@/lib/demo/degustacao-metricas';
import { desafiosDoAmbiente } from '@/lib/demo/degustacao-desafios';

const passe = (slug = 'acme-demo') => emitirPasseDegustacao(slug, SID, expiry());
const emailDaPersona = (papel: 'rh' | 'gestor' | 'usuario') => rosterDemo('comercial').salaApresentacao
  .find((p) => p.presentationRoleKey === papel)!.email;
const ticket = () => issueDemoPresentationTicket(undefined, { prospectSessionId: SID, expiresAtSeconds: expiry() }, 'acme-demo');

beforeEach(() => {
  sb.reset();
  vi.clearAllMocks();
  limitado = false;
  email = '';
  linhasDeSessao = [];
  colaborador = null;
  respostas = [];
  cargo = null;
  sessao = {
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    access_closed_at: null,
    prospect_name: 'Camila Prado',
    prospect_company: 'Empresa Exemplo',
    created_by_email: 'rodrigo@vertho.ai',
    experience_version: 'C',
    cargo: 'Representante Comercial',
    colaborador_id: null,
  };
});

describe('a versão C no contrato', () => {
  it('as versões são A, B e C, e só elas', () => {
    expect([...DEGUSTACAO_VERSOES]).toEqual(['A', 'B', 'C']);
    const entrada = { nome: 'Camila Prado', empresa: 'Empresa Exemplo', roleKey: 'analista-financeiro' };
    expect(validateAcmeProspectExperienceInput({ ...entrada, versao: 'C' })).toMatchObject({ ok: true, value: { versao: 'C' } });
    for (const versao of ['D', 'c', 3, {}]) {
      expect(validateAcmeProspectExperienceInput({ ...entrada, versao })).toMatchObject({ ok: false });
    }
  });

  it('o painel lê C como C: o que não é B não vira A em silêncio', async () => {
    const base = {
      colaborador_id: null, auth_email: 'convidado.acme.x@vertho.ai', prospect_name: 'N', prospect_company: 'E',
      cargo: 'Representante Comercial', created_at: '2026-10-03T12:00:00.000Z', expires_at: '2026-10-13T07:00:00.000Z',
      personal_accessed_at: null, disc_completed_at: null, colaborador_accessed_at: null, gestor_accessed_at: null,
      rh_accessed_at: null, access_closed_at: null, invite_opened_at: null, contact_clicked_at: null,
      relevant_exploration_at: null, relevant_exploration_target: null, telemetry_version: null, is_internal_test: false,
    };
    linhasDeSessao = [
      { ...base, session_id: 'a'.repeat(20), experience_version: 'C' },
      { ...base, session_id: 'b'.repeat(20), experience_version: 'B' },
      { ...base, session_id: 'c'.repeat(20), experience_version: 'A' },
      { ...base, session_id: 'd'.repeat(20), experience_version: null },
    ];
    const lista = await listDemoProspectProgress('acme-demo', sb.client);
    expect(lista.map((p) => [p.sessionId[0], p.versao])).toEqual([['a', 'C'], ['b', 'B'], ['c', 'A'], ['d', 'A']]);
  });

  it('o lembrete NÃO rebaixa um passaporte C para B; só a A vira B', async () => {
    const r: any = await prepararConviteGuiado('acme-demo', SID);
    expect(r).toMatchObject({ ok: true, convertido: false });
    expect(sb.escritas).toHaveLength(0);

    sessao = { ...sessao, experience_version: 'A' };
    const converteu: any = await prepararConviteGuiado('acme-demo', SID);
    expect(converteu).toMatchObject({ ok: true, convertido: true });
    expect(sb.escritas).toEqual([expect.objectContaining({ payload: { experience_version: 'B' } })]);
  });

  it('o /dashboard do convidado C volta para a página do roteiro; o da A segue na home', async () => {
    const convidado = `convidado.acme.${SID}@vertho.ai`;
    const href = await hrefDaCasaDoConvidado(convidado);
    expect(href).toBe(`/c/${emitirCodigoCurto('acme-demo', SID)}`);

    sessao = { ...sessao, experience_version: 'B' };
    expect(await hrefDaCasaDoConvidado(convidado)).toBe(`/c/${emitirCodigoCurto('acme-demo', SID)}`);

    sessao = { ...sessao, experience_version: 'A' };
    expect(await hrefDaCasaDoConvidado(convidado)).toBeNull();
  });

  it('a coorte C é medida à parte da B (telemetria própria, nunca somadas)', () => {
    const base: any = { origem: 'passaporte', nome: 'Ana', contexto: 'Empresa', conviteAbertoEm: 'data' };
    const todos = [
      { ...base, versao: 'B', telemetryVersion: DEMO_TELEMETRY_VERSION },
      { ...base, versao: 'C', telemetryVersion: DEMO_TELEMETRY_VERSION_C, exploracaoRelevanteEm: 'data', contatoClicadoEm: 'data' },
      { ...base, versao: 'C', telemetryVersion: DEMO_TELEMETRY_VERSION_C },
      // C com a telemetria da B (e o inverso) não entra em nenhuma das duas
      { ...base, versao: 'C', telemetryVersion: DEMO_TELEMETRY_VERSION },
      { ...base, versao: 'B', telemetryVersion: DEMO_TELEMETRY_VERSION_C },
      { ...base, versao: 'C', telemetryVersion: DEMO_TELEMETRY_VERSION_C, testeInterno: true },
    ];
    expect(metricasDegustacao(todos)).toEqual({ convites: 1, abertos: 1, exploraram: 0, contatos: 0, taxa: 0 });
    expect(metricasDegustacao(todos, 'C')).toEqual({ convites: 2, abertos: 2, exploraram: 1, contatos: 1, taxa: 50 });
  });
});

describe('o texto que sai para o lead', () => {
  const base = { nome: 'Camila Prado', empresa: 'Empresa Exemplo', minhaCasa: 'na minha empresa' };

  it('sem desafios o texto é EXATAMENTE o da B', () => {
    expect(mensagemDeContato(base)).toBe(
      'Olá! Aqui é Camila (Empresa Exemplo). Acabei de ver a Vertho por dentro e quero entender como isso funcionaria na minha empresa.',
    );
    expect(mensagemDeContato({ ...base, desafios: [], outro: '' })).toBe(mensagemDeContato(base));
  });

  it('um desafio vira uma frase; dois ou mais viram lista; o "outro" entra como item', () => {
    const um = mensagemDeContato({ ...base, desafios: ['o time não engajar com o que oferecemos'] });
    expect(um).toContain('Um dos meus desafios hoje é o time não engajar com o que oferecemos.');
    expect(um.endsWith('Quero entender como isso funcionaria na minha empresa.')).toBe(true);

    const dois = mensagemDeContato({ ...base, desafios: ['a coisa A', 'a coisa B'] });
    expect(dois).toContain('Hoje, meus maiores desafios são:\n1) a coisa A\n2) a coisa B\n');

    const tres = mensagemDeContato({ ...base, desafios: ['a coisa A', 'a coisa B'], outro: 'muita rotatividade' });
    expect(tres).toContain('3) muita rotatividade');

    const soOutro = mensagemDeContato({ ...base, outro: 'muita rotatividade' });
    expect(soOutro).toContain('Meu desafio hoje é: muita rotatividade');
    expect(soOutro).not.toContain('Um dos meus desafios');
  });

  it('nenhuma mensagem tem travessão, e o link do WhatsApp carrega o mesmo texto', () => {
    const dados = { ...base, desafios: ['investir em treinamento sem saber se mudou alguma coisa'], criadoPor: 'rodrigo@vertho.ai' };
    expect(mensagemDeContato(dados)).not.toMatch(/[—–]/);
    const alvo = new URL(linkDeContatoDaDegustacao(dados));
    expect(alvo.host).toBe('wa.me');
    expect(alvo.searchParams.get('text')).toBe(mensagemDeContato(dados));
  });

  it('o convite C promete o que a página entrega, sem minuto em número e sem travessão', () => {
    const acesso = { nome: 'Camila Prado', url: 'https://acme-demo.vertho.ai/c/abc', expiresAt: '2026-10-13T21:00:00.000Z' };
    const c = buildDegustacaoConviteText(acesso, 'acme-demo', 'C');
    expect(c).toContain('Olá, Camila!');
    expect(c).toContain(acesso.url);
    expect(c).toMatch(/escolhe o desafio/);
    expect(c).toContain('do seu time');
    expect(c).not.toMatch(/[—–]/);
    expect(c).not.toMatch(/\d+\s*min/i);
    expect(buildDegustacaoConviteText(acesso, 'escolas-acme', 'C')).toContain('dos seus professores');
    // a B não mudou: o terceiro argumento é opcional e o padrão é a B
    expect(buildDegustacaoConviteText(acesso, 'acme-demo')).toBe(buildDegustacaoConviteText(acesso, 'acme-demo', 'B'));
    expect(buildDegustacaoConviteText(acesso, 'acme-demo')).not.toMatch(/escolhe o desafio/);
  });
});

describe('o início da versão C (carregador)', () => {
  beforeEach(() => {
    colaborador = { id: 'colab-1', mapeamento_em: null, cargo: 'Representante Comercial' };
    cargo = { top5_workshop: ['a', 'b'] };
  });

  it('devolve os cinco desafios na ordem DA SESSÃO, cada link abrindo a sala certa com a cena e o código de volta', async () => {
    sessao = { ...sessao, colaborador_id: 'colab-1' };
    const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(pagina.status).toBe('ok');
    expect(pagina.versao).toBe('C');
    expect(pagina.visoes).toEqual([]);
    expect(pagina.desafios.map((d: any) => d.chave).sort()).toEqual(desafiosDoAmbiente('acme-demo').map((d) => d.chave).sort());

    const codigo = emitirCodigoCurto('acme-demo', SID);
    for (const d of pagina.desafios) {
      const url = new URL(d.url);
      const esperado = desafiosDoAmbiente('acme-demo').find((x) => x.chave === d.chave)!;
      expect(url.pathname).toBe('/auth/apresentacao');
      expect(url.hostname.split('.')[0]).toBe(getDemoPresentationRole(esperado.sala, 'acme-demo').hostSlug);
      expect(url.searchParams.get('cena')).toBe(d.chave);
      expect(url.searchParams.get('volta')).toBe(codigo);
      expect(url.searchParams.get('ticket')).toBeTruthy();
      // a chave atravessa a rede; o caminho NUNCA vai na URL
      expect(url.search).not.toContain('/dashboard');
    }
  });

  it('a ordem é a mesma a cada visita e gira de uma sessão para outra', async () => {
    const primeira: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    const segunda: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(segunda.desafios.map((d: any) => d.chave)).toEqual(primeira.desafios.map((d: any) => d.chave));
  });

  it('A GET não escreve e não autentica (é o GET que o robô de preview faz)', async () => {
    await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(sb.escritas).toHaveLength(0);
    expect((sb.client.auth as any).verifyOtp).not.toHaveBeenCalled();
  });

  it('B e A continuam desenhando a página de três cartões, sem desafios', async () => {
    for (const versao of ['B', 'A', null, undefined]) {
      sessao = { ...sessao, experience_version: versao };
      const pagina: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
      expect(pagina.versao, String(versao)).toBe('B');
      expect(pagina.desafios).toEqual([]);
      expect(pagina.visoes).toHaveLength(3);
    }
  });

  it('o perfil feito aparece como feito; o perfil nunca é pré-requisito', async () => {
    sessao = { ...sessao, colaborador_id: 'colab-1', disc_completed_at: null };
    colaborador = { id: 'colab-1', mapeamento_em: '2026-10-03T12:00:00.000Z', cargo: 'Representante Comercial' };
    const feito: any = await carregarPaginaDaDegustacao({ passe: passe() }, 'acme-demo.vertho.ai');
    expect(feito.pessoal.discFeito).toBe(true);
    expect(feito.desafios).toHaveLength(5);
  });
});

describe('o contato do início (versão C)', () => {
  const requisicao = (campos: Record<string, string>, origem = 'https://acme-demo.vertho.ai') => new NextRequest(
    'https://acme-demo.vertho.ai/auth/degustacao/contato',
    { method: 'POST', headers: { origin: origem }, body: new URLSearchParams({ passe: passe(), ...campos }) },
  );
  const texto = (r: Response) => new URL(r.headers.get('location')!).searchParams.get('text')!;

  it('leva os desafios vistos e o "outro" (limpo) na mensagem', async () => {
    const r = await contato(requisicao({ dores: 'engajamento,resultado', outro: '  muita   rotatividade\n' }));
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get('location')!).host).toBe('wa.me');
    const msg = texto(r);
    expect(msg).toContain('1) o time não engajar com o que oferecemos');
    expect(msg).toContain('2) investir em treinamento sem saber se mudou alguma coisa');
    expect(msg).toContain('3) muita rotatividade');
  });

  it('chave desconhecida é descartada e o texto não carrega nada que não esteja no mapa', async () => {
    const r = await contato(requisicao({ dores: 'constructor,__proto__,https://evil.test,engajamento' }));
    const msg = texto(r);
    expect(msg).toContain('Um dos meus desafios hoje é o time não engajar com o que oferecemos.');
    expect(msg).not.toMatch(/evil|constructor|__proto__/);
  });

  it('o "outro" é cortado em 140 caracteres', async () => {
    const r = await contato(requisicao({ outro: 'x'.repeat(400) }));
    expect(texto(r)).toContain(`Meu desafio hoje é: ${'x'.repeat(140)}`);
    expect(texto(r)).not.toContain('x'.repeat(141));
  });

  it('na B os campos novos são ignorados e o texto é o de sempre', async () => {
    sessao = { ...sessao, experience_version: 'B' };
    const r = await contato(requisicao({ dores: 'engajamento', outro: 'qualquer coisa' }));
    expect(texto(r)).toBe(
      'Olá! Aqui é Camila (Empresa Exemplo). Acabei de ver a Vertho por dentro e quero entender como isso funcionaria na minha empresa.',
    );
  });

  it('carimba o primeiro clique no tenant certo, e origem externa não passa nem grava', async () => {
    await contato(requisicao({ dores: 'engajamento' }));
    expect(sb.escritas.some((e) => 'contact_clicked_at' in e.payload)).toBe(true);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
    sb.reset();
    expect((await contato(requisicao({ dores: 'engajamento' }, 'https://evil.test'))).status).toBe(403);
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('o contato de dentro da sala (versão C)', () => {
  const sala = 'rh-demo.vertho.ai';
  const requisicao = (campos: Record<string, string>, host = sala, origem = `https://${host}`) => new NextRequest(
    `https://${host}/auth/degustacao/contato-sala`,
    { method: 'POST', headers: { origin: origem }, body: new URLSearchParams({ ticket: ticket(), desafio: 'engajamento', ...campos }) },
  );

  beforeEach(() => { email = emailDaPersona('rh'); });

  it('abre o WhatsApp com o texto do desafio, carimba o contato e nunca envia nada', async () => {
    const r = await contatoSala(requisicao({}));
    expect(r.status).toBe(303);
    const alvo = new URL(r.headers.get('location')!);
    expect(alvo.host).toBe('wa.me');
    expect(alvo.searchParams.get('text')).toContain('Um dos meus desafios hoje é o time não engajar com o que oferecemos.');
    expect(sb.escritas.some((e) => 'contact_clicked_at' in e.payload)).toBe(true);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
  });

  it('só vale para sessão C, com ticket, na sala certa e com a persona logada', async () => {
    sessao = { ...sessao, experience_version: 'B' };
    expect((await contatoSala(requisicao({}))).status).toBe(400);
    sessao = { ...sessao, experience_version: 'C' };

    expect((await contatoSala(requisicao({ ticket: 'ticket.falso' }))).status).toBe(400);
    expect((await contatoSala(requisicao({}, 'rh-sinal.vertho.ai'))).status).toBe(400); // ticket é de OUTRO ambiente
    email = emailDaPersona('gestor');
    expect((await contatoSala(requisicao({}))).status).toBe(400); // logado em outro papel
    email = '';
    expect((await contatoSala(requisicao({}))).status).toBe(400); // sem login
    expect(sb.escritas).toHaveLength(0);
  });

  it('recusa chave desconhecida e desafio de OUTRA sala, sem gravar', async () => {
    expect((await contatoSala(requisicao({ desafio: 'constructor' }))).status).toBe(400);
    // `gestao` mora na sala do gestor: pedir da sala do RH não vale
    expect((await contatoSala(requisicao({ desafio: 'gestao' }))).status).toBe(400);
    expect(sb.escritas).toHaveLength(0);
  });

  it('recusa origem externa e respeita o limite', async () => {
    expect((await contatoSala(requisicao({}, sala, 'https://evil.test'))).status).toBe(403);
    limitado = true;
    expect((await contatoSala(requisicao({}))).status).toBe(429);
    expect(sb.escritas).toHaveLength(0);
  });

  it('falha de medição não bloqueia a conversa', async () => {
    sb.falharEm({ tabela: 'demo_prospect_sessions', op: 'update', mensagem: 'offline' });
    expect((await contatoSala(requisicao({}))).status).toBe(303);
  });
});

describe('a exploração relevante na versão C é o desafio escolhido', () => {
  const requisicao = (alvo: string, host = 'rh-demo.vertho.ai') => new NextRequest(
    `https://${host}/auth/degustacao/exploracao`,
    { method: 'POST', headers: { origin: `https://${host}`, 'content-type': 'application/json' }, body: JSON.stringify({ alvo, ticket: ticket() }) },
  );
  const gravouExploracao = () => sb.escritas.filter((e) => 'relevant_exploration_target' in e.payload);

  beforeEach(() => { email = emailDaPersona('rh'); });

  it('na C só o alvo dor-* grava a exploração, e grava a chave do desafio', async () => {
    await exploracao(requisicao('dor-engajamento'));
    expect(gravouExploracao()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ relevant_exploration_target: 'dor-engajamento' }) })]);
    expect(sb.usou('demo_prospect_sessions', 'is', 'relevant_exploration_at')).toBe(true);
  });

  it('o beacon da própria tela (engajamento, pdi...) NÃO disputa a coluna na C, mas a abertura vale', async () => {
    await exploracao(requisicao('engajamento'));
    expect(gravouExploracao()).toHaveLength(0);
    expect(sb.escritas.some((e) => 'invite_opened_at' in e.payload)).toBe(true);
  });

  it('na B e na A o alvo dor-* nunca grava, e o alvo da tela continua gravando como sempre', async () => {
    for (const versao of ['B', 'A']) {
      sb.reset();
      sessao = { ...sessao, experience_version: versao };
      await exploracao(requisicao('dor-engajamento'));
      expect(gravouExploracao(), `${versao} dor`).toHaveLength(0);
      sb.reset();
      await exploracao(requisicao('engajamento'));
      expect(gravouExploracao(), `${versao} tela`).toEqual([expect.objectContaining({ payload: expect.objectContaining({ relevant_exploration_target: 'engajamento' }) })]);
    }
  });

  it('alvo dor- com chave inventada não passa', async () => {
    await exploracao(requisicao('dor-constructor'));
    await exploracao(requisicao('dor-'));
    expect(sb.escritas).toHaveLength(0);
  });
});
