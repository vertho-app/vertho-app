import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';
import { criarStorageFalso } from '../../helpers/storage-falso';

// Só a identidade e os provedores externos são simulados. Os gates de API,
// action, equipe e representante abaixo são os mesmos usados em produção.
const h = vi.hoisted(() => ({
  actionToken: '',
  contextos: {} as Record<string, any>,
  tts: vi.fn(async () => { throw new Error('TTS não deve ser chamado'); }),
  render: vi.fn(async () => { throw new Error('render não deve ser chamado'); }),
  download: vi.fn(async (url: string) => new Response(`download:${url}`)),
  auditar: vi.fn(async () => {}),
}));

const pessoas: Record<string, any> = {};
const relatorios: Record<string, any> = {};
const conteudos: Record<string, any> = {};
const representantes: Record<string, any> = {};
for (const empresa of ['a', 'b']) {
  for (const [apelido, role] of [['colab', 'colaborador'], ['par', 'colaborador'], ['gestor', 'gestor'], ['outro-gestor', 'gestor'], ['rh', 'rh']]) {
    const id = `${empresa}-${apelido}`;
    const email = `${id}@exemplo.invalid`;
    const pessoa = { id, email, empresa_id: empresa, nome_completo: id, role, locale: 'pt-BR', gestor_email: apelido === 'colab' ? `${empresa}-gestor@exemplo.invalid` : null };
    pessoas[id] = pessoa;
    h.contextos[email] = { colaborador: pessoa, role, empresaId: empresa, isPlatformAdmin: false, platformAdminRole: null };
  }
  for (const [id, tipo, dono] of [['pdi', 'individual', 'colab'], ['pdi-par', 'individual', 'par'], ['gestor', 'gestor', 'gestor'], ['rh', 'rh', 'rh'], ['sem-dono', 'individual', null]]) {
    const chave = `${empresa}-${id}`;
    relatorios[chave] = { id: chave, tipo, empresa_id: empresa, colaborador_id: dono ? `${empresa}-${dono}` : null, conteudo: {}, pdf_path: `${empresa}/${chave}.pdf`, gerado_em: '2026-10-08T00:00:00Z' };
  }
  conteudos[empresa] = { id: empresa, formato: 'audio', empresa_id: empresa, url: 'https://exemplo.invalid/base.mp3', conteudo_inline: 'Narração sintética para teste.' };
}
conteudos.global = { ...conteudos.a, id: 'global', empresa_id: null };
for (const [id, status] of [['rc-a', 'active'], ['rc-b', 'active'], ['rc-suspenso', 'suspended'], ['rc-inativo', 'inactive']]) {
  const email = `${id}@exemplo.invalid`;
  representantes[email] = { id, email, status };
  // getUserContext real devolve este contexto vazio para Auth sem colaborador.
  h.contextos[email] = { colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: false, platformAdminRole: null };
}
h.contextos['admin@exemplo.invalid'] = { colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master' };

function filtrar(linhas: any[], cadeia: Chamada[]) {
  return linhas.filter((linha) => cadeia.every((c) => c.metodo !== 'eq' || linha[c.args[0]] === c.args[1]));
}
const sb = criarSupabaseMock({ resolver: (tabela, _cols, cadeia) => {
  const linhas = tabela === 'colaboradores' ? Object.values(pessoas)
    : tabela === 'relatorios' ? Object.values(relatorios)
    : tabela === 'micro_conteudos' ? Object.values(conteudos)
    : tabela === 'sales_representatives' ? Object.values(representantes)
    : tabela === 'sales_materials' ? [{ id: 'catalogo', title: 'Material sintético', storage_path: 'catalogo.pdf' }]
    : tabela === 'empresas' ? [{ id: 'a', nome: 'Empresa A', default_locale: 'pt-BR' }, { id: 'b', nome: 'Empresa B', default_locale: 'pt-BR' }]
    : [];
  return filtrar(linhas, cadeia)[0] ?? null;
} });
const st = criarStorageFalso();
sb.client.storage = st.storage;
sb.client.auth = { getUser: vi.fn(async (token?: string) => {
  const email = `${token ?? h.actionToken}@exemplo.invalid`;
  return { data: { user: h.contextos[email] ? { id: email, email } : null }, error: null };
}) };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({ createSupabaseServerClient: async () => sb.client }));
vi.mock('@/lib/authz', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/authz')>(), getUserContext: async (email: string) => h.contextos[email] ?? null }));
vi.mock('@/lib/gemini-tts', () => ({ extractNarration: (s: string) => s, generatePersonalizedPodcastAudio: h.tts }));
vi.mock('@/lib/audit', () => ({ logAdminAction: h.auditar }));
vi.mock('@/lib/conteudo/download', () => ({ servirComoDownload: h.download }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: h.render }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioGestor', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioRH', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoExecutivo', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoNR1', () => ({ default: () => null }));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({ mostrarVertho: true }), nomeArquivoMarca: (s: string) => s }));

import { GET as relatorio } from '@/app/api/relatorios/pdf/route';
import { GET as podcast } from '@/app/api/conteudo/[id]/podcast/route';
import { GET as material } from '@/app/api/sales/materials/[id]/download/route';

const req = (ator: string, path: string) => new Request(`https://exemplo.invalid${path}`, { headers: ator ? { authorization: `Bearer ${ator}` } : {} });
const audioPath = (empresa: string, conteudo: string, pessoa: string) => `${empresa}/audio-personalizado/${conteudo}/${pessoa}.mp3`;

beforeEach(() => {
  sb.reset(); st.reset(); vi.clearAllMocks(); h.actionToken = '';
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Rede real proibida neste teste'); }));
  for (const rel of Object.values(relatorios)) st.semear('relatorios-pdf', rel.pdf_path, `PDF:${rel.id}`);
  // Há cache até para combinações proibidas: quem bloqueia é o gate, não um 404 acidental.
  for (const pessoa of Object.values(pessoas)) for (const conteudo of ['a', 'b', 'global']) st.semear('relatorios-pdf', audioPath(pessoa.empresa_id, conteudo, pessoa.id), `MP3:${pessoa.id}`);
  st.semear('sales-materials', 'catalogo.pdf', 'PDF:comercial');
});
afterEach(() => vi.unstubAllGlobals());

function semEfeitos() {
  expect(st.chamadas).toEqual([]);
  expect(sb.escritas).toEqual([]);
  expect(h.tts).not.toHaveBeenCalled(); expect(h.render).not.toHaveBeenCalled();
  expect(h.download).not.toHaveBeenCalled(); expect(h.auditar).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}

describe('relatórios: matriz com gates reais e duas empresas', () => {
  const casos: [string, string, number][] = [
    ['', 'a-pdi', 401], ['invalido', 'a-pdi', 401], ['rc-a', 'a-pdi', 403],
    ['a-colab', 'a-pdi', 200], ['a-colab', 'a-pdi-par', 403], ['a-colab', 'a-rh', 403], ['a-colab', 'a-sem-dono', 403],
    ['a-gestor', 'a-pdi', 200], ['a-gestor', 'a-pdi-par', 403], ['a-gestor', 'a-gestor', 200], ['a-outro-gestor', 'a-gestor', 403], ['a-gestor', 'a-rh', 403],
    ['a-rh', 'a-pdi-par', 200], ['a-rh', 'a-gestor', 200], ['a-rh', 'a-rh', 200], ['a-rh', 'a-sem-dono', 200],
    ['a-rh', 'b-pdi', 403], ['b-rh', 'a-pdi', 403], ['a-rh', 'b-rh', 403], ['b-rh', 'a-rh', 403],
    ['a-colab', 'b-pdi', 403], ['b-colab', 'a-pdi', 403], ['b-colab', 'b-pdi', 200], ['b-rh', 'b-rh', 200], ['admin', 'b-pdi', 200], ['admin', 'a-rh', 200],
  ];
  it.each(casos)('%s → %s: %i', async (ator, id, status) => {
    const res = await relatorio(req(ator, `/api/relatorios/pdf?id=${id}`));
    expect(res.status).toBe(status);
    if (status !== 200) semEfeitos();
    else {
      expect(await res.text()).toBe(`PDF:${id}`);
      expect(st.chamadas.map(c => [c.bucket, c.metodo, c.args[0]])).toEqual([['relatorios-pdf', 'download', relatorios[id].pdf_path]]);
      expect(sb.escritas).toEqual([]); expect(h.render).not.toHaveBeenCalled();
    }
  });

  it('falha ao conferir equipe responde 503 sem acessar o PDF', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'falha sintética' });
    const res = await relatorio(req('a-gestor', '/api/relatorios/pdf?id=a-pdi'));
    expect(res.status).toBe(503); semEfeitos();
  });
});

describe('podcasts: dono, equipe, empresa e assinatura privada', () => {
  const casos: [string, string, string, number][] = [
    ['', 'a', '', 401], ['invalido', 'a', '', 401], ['rc-a', 'a', '', 403],
    ['a-colab', 'a', '', 302], ['b-colab', 'b', '', 302], ['a-colab', 'b', '', 403], ['b-colab', 'a', '', 403],
    ['a-colab', 'a', 'a-par', 403], ['a-gestor', 'a', 'a-colab', 302], ['a-gestor', 'a', 'a-par', 403],
    ['a-rh', 'a', 'a-par', 302], ['a-rh', 'a', 'b-colab', 403], ['b-rh', 'b', 'a-colab', 403],
    ['a-rh', 'b', 'b-colab', 403], ['b-rh', 'a', 'a-colab', 403], ['admin', 'b', 'b-colab', 302],
    ['admin', 'a', 'b-colab', 404],
    ['a-colab', 'global', '', 302], ['b-colab', 'global', '', 302],
    ['a-rh', 'global', 'a-par', 302], ['b-rh', 'global', 'b-par', 302], ['a-gestor', 'global', 'a-colab', 302],
    ['a-rh', 'global', 'b-colab', 403], ['b-rh', 'global', 'a-colab', 403], ['admin', 'global', 'b-colab', 302],
  ];
  it.each(casos)('%s → %s, alvo %s: %i', async (ator, id, alvo, status) => {
    const res = await podcast(req(ator, `/api/conteudo/${id}/podcast${alvo ? `?colaboradorId=${alvo}` : ''}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(status);
    if (status !== 302) semEfeitos();
    else {
      const pessoa = pessoas[alvo || ator];
      expect(res.headers.get('location')).toContain(`/relatorios-pdf/${audioPath(pessoa.empresa_id, id, pessoa.id)}?`);
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(st.chamadas.map(c => [c.bucket, c.metodo, c.args[1]])).toEqual([['relatorios-pdf', 'createSignedUrl', 3600]]);
      expect(h.tts).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(sb.escritas).toEqual([]);
    }
  });

  it('download de outra pessoa só recebe URL assinada após os gates', async () => {
    const res = await podcast(req('a-rh', '/api/conteudo/a/podcast?colaboradorId=a-par&download=1'), { params: Promise.resolve({ id: 'a' }) });
    expect(res.status).toBe(200);
    expect(h.download.mock.calls[0][0]).toContain('/relatorios-pdf/a/audio-personalizado/a/a-par.mp3?');
    expect(h.auditar).toHaveBeenCalledTimes(1);
  });

  it.each(['a-rh', 'admin'])('%s: falha ao conferir alvo responde 503 sem assinatura ou geração', async (ator) => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'falha sintética' });
    const res = await podcast(req(ator, '/api/conteudo/a/podcast?colaboradorId=a-par'), { params: Promise.resolve({ id: 'a' }) });
    expect(res.status).toBe(503); semEfeitos();
  });
});

describe('materiais comerciais: catálogo compartilhado por RCs ativos', () => {
  it.each([['', 403], ['invalido', 403], ['a-colab', 403], ['a-gestor', 403], ['a-rh', 403], ['b-rh', 403], ['rc-suspenso', 403], ['rc-inativo', 403], ['rc-a', 200], ['rc-b', 200], ['admin', 200]] as [string, number][])('%s: %i', async (ator, status) => {
    h.actionToken = ator;
    const res = await material(req(ator, '/api/sales/materials/catalogo/download'), { params: Promise.resolve({ id: 'catalogo' }) });
    expect(res.status).toBe(status);
    if (status !== 200) semEfeitos();
    else {
      expect(await res.text()).toBe('PDF:comercial');
      expect(st.chamadas.map(c => [c.bucket, c.metodo, c.args[0]])).toEqual([['sales-materials', 'download', 'catalogo.pdf']]);
      expect(sb.escritas).toEqual([]);
    }
  });
  it('material ausente não acessa Storage', async () => {
    h.actionToken = 'rc-a';
    const res = await material(req('rc-a', '/api/sales/materials/ausente/download'), { params: Promise.resolve({ id: 'ausente' }) });
    expect(res.status).toBe(404); semEfeitos();
  });
  it('Bearer sem sessão da action não autoriza o download comercial', async () => {
    const res = await material(req('rc-a', '/api/sales/materials/catalogo/download'), { params: Promise.resolve({ id: 'catalogo' }) });
    expect(res.status).toBe(403); semEfeitos();
  });
});
