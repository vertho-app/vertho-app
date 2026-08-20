// Download do conteúdo DE OUTRA PESSOA — o que o botão do admin dispara.
//
// 🔴 OS DOIS INVARIANTES DESTE ARQUIVO
// ────────────────────────────────────
// 1. **O arquivo é o DELA.** Antes, `/api/conteudo/[id]/pdf` resolvia a
//    personalização pela SESSÃO de quem chamava — o admin recebia o genérico com
//    cara de ser o da pessoa, e a tela avisava isso em letra miúda. Letra miúda
//    não viaja junto com um arquivo salvo no computador, então o parâmetro
//    passou a existir. Se ele parar de ser repassado, o sintoma é mudo: o PDF
//    abre, tem conteúdo, e é de outro perfil.
// 2. **Quem pede o de outra pessoa é AUTORIZADO e fica no log.** O material é
//    nominal (nome no PDF, saudação no MP3). `assertColabAccess` decide; o
//    `logAdminAction` registra. Sem o gate, o `colaboradorId` da query viraria
//    leitura cross-tenant; sem o log, material nominal sai da plataforma sem
//    rastro.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { nomeDeArquivo } from '@/lib/conteudo/download';

const ADMIN = { email: 'rodrigo@vertho.ai', isPlatformAdmin: true, colaborador: { id: 'colab-admin' }, role: 'colaborador', empresaId: null };
const ALVO = 'colab-taluana';

let negarAcesso = false;
const assertColabAccess = vi.fn(async () => (negarAcesso ? new Response('nao', { status: 403 }) : null));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ADMIN,
  assertColabAccess: (...a: any[]) => (assertColabAccess as any)(...a),
}));

const sb = criarSupabaseMock({
  resolver: (tabela: string) =>
    tabela === 'colaboradores' ? { id: ALVO, nome_completo: 'Taluana Gomes Bastos', empresa_id: 'emp-1' } : null,
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const auditoria: any[] = [];
vi.mock('@/lib/audit', () => ({ logAdminAction: async (e: any) => { auditoria.push(e); } }));

/** O que a action recebeu — é aqui que se vê DE QUEM é o PDF. */
const chamadas: any[] = [];
let respostaDaAction: any = { success: true, url: 'https://cdn.exemplo/final/perso/abc.pdf', personalized: true };
vi.mock('@/actions/conteudos', () => ({
  gerarConteudoFinalPersonalizado: async (args: any) => {
    chamadas.push(args);
    return respostaDaAction;
  },
}));

const { GET } = await import('@/app/api/conteudo/[id]/pdf/route');

function pedir(qs: string) {
  return GET(new Request(`https://app.vertho.ai/api/conteudo/cont-1/pdf${qs}`), {
    params: Promise.resolve({ id: 'cont-1' }),
  } as any);
}

beforeEach(() => {
  sb.reset();
  chamadas.length = 0;
  auditoria.length = 0;
  negarAcesso = false;
  respostaDaAction = { success: true, url: 'https://cdn.exemplo/final/perso/abc.pdf', personalized: true };
  assertColabAccess.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF-1.7', {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  })) as any);
});

describe('🔴 o PDF é o DA PESSOA, não o de quem clicou', () => {
  it('com `colaboradorId`, a action recebe o colaborador alvo', async () => {
    await pedir(`?colaboradorId=${ALVO}`);
    expect(chamadas.at(-1).colab).toEqual({ id: ALVO });
  });

  it('sem `colaboradorId`, segue resolvendo pela sessão (comportamento do colaborador)', async () => {
    await pedir('');
    expect(chamadas.at(-1).colab).toBeUndefined();
    expect(assertColabAccess).not.toHaveBeenCalled();
    expect(auditoria).toHaveLength(0); // abrir o próprio PDF não é evento de auditoria
  });

  it('🔴 o id pedido passa por `assertColabAccess` — negado NÃO gera arquivo', async () => {
    negarAcesso = true;
    const r = await pedir(`?colaboradorId=${ALVO}`);
    expect(r.status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it('🔴 recusa da action (tenant errado) não vira arquivo', async () => {
    // A action relê o colaborador do banco e confere o tenant do CONTEÚDO. Se
    // ela recusar, a rota não pode servir arquivo nenhum — nem o genérico, que
    // seria "o admin salvou algo" quando o correto é não salvar nada.
    respostaDaAction = { success: false, error: 'colaborador de outro tenant' };
    const r = await pedir(`?colaboradorId=${ALVO}&download=1`);
    expect(r.status).toBe(404);
    expect(auditoria).toHaveLength(0);
  });
});

describe('🔴 material nominal deixa rastro', () => {
  it('download de outra pessoa vai para o log de auditoria', async () => {
    await pedir(`?colaboradorId=${ALVO}&download=1`);
    expect(auditoria.at(-1)).toMatchObject({
      adminEmail: ADMIN.email,
      acao: 'conteudo.download_pdf',
      alvo: ALVO,
    });
    expect(auditoria.at(-1).detalhes).toMatchObject({ colaboradorId: ALVO, conteudoId: 'cont-1' });
  });

  it('abrir (sem download) também registra, com ação distinta', async () => {
    await pedir(`?colaboradorId=${ALVO}`);
    expect(auditoria.at(-1).acao).toBe('conteudo.abrir_pdf');
  });
});

describe('o arquivo chega como arquivo', () => {
  it('`download=1` responde anexo com nome legível', async () => {
    const r = await pedir(`?colaboradorId=${ALVO}&download=1&name=${encodeURIComponent('Semana 1 · Taluana · Rituais formativos')}`);
    expect(r.status).toBe(200);
    const cd = r.headers.get('content-disposition') || '';
    expect(cd).toContain('attachment');
    expect(cd).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(cd.split("filename*=UTF-8''")[1])).toBe('Semana 1 · Taluana · Rituais formativos.pdf');
  });

  it('sem `download=1` continua 302 para a URL (o fluxo do colaborador)', async () => {
    const r = await pedir(`?colaboradorId=${ALVO}`);
    expect(r.status).toBe(302);
  });

  it('🔴 origem fora do ar não vira arquivo vazio com nome bonito', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })) as any);
    const r = await pedir(`?colaboradorId=${ALVO}&download=1`);
    expect(r.status).toBe(502);
  });
});

describe('nome de arquivo', () => {
  it('não deixa separador de caminho nem quebra de header', () => {
    const bruto = `Semana 1 / Taluana\r\nBastos "aspas"`;
    const nome = nomeDeArquivo(bruto, 'pdf');
    expect(nome).not.toMatch(/[\\/"]/);
    expect(nome).not.toMatch(/[\r\n]/);
    expect(nome.endsWith('.pdf')).toBe(true);
  });

  it('preserva acento e o separador visual do nome montado pela tela', () => {
    expect(nomeDeArquivo('Semana 1 · Taluana · Rituais formativos', 'mp3'))
      .toBe('Semana 1 · Taluana · Rituais formativos.mp3');
  });

  it('não duplica a extensão', () => {
    expect(nomeDeArquivo('relatorio.pdf', 'pdf')).toBe('relatorio.pdf');
  });
});
