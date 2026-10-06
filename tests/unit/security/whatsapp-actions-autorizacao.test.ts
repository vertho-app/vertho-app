import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

// O gate real consulta a sessão, o papel e os overrides. Só as fronteiras
// externas são simuladas: autenticação, banco, cache de áudio e transporte.
const estado = vi.hoisted(() => ({
  email: 'master@example.test' as string | null,
  ctx: null as any,
  overrides: [] as any[],
  proprio: null as any,
  alvo: null as any,
  espera: null as number | null,
  sendWhatsapp: vi.fn(),
  findColabByEmail: vi.fn(),
  fetchColabPorId: vi.fn(),
  limitarAcao: vi.fn(),
}));

const sb = criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => {
    if (tabela !== 'colaboradores') return null;
    const id = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'id')?.args[1];
    return [estado.proprio, estado.alvo].find((c) => c?.id === id) ?? null;
  },
  lista: (tabela, _cols, cadeia) => {
    if (tabela !== 'permission_overrides') return [];
    const chaves: string[] = cadeia.find((c) => c.metodo === 'in')?.args[1] || [];
    return estado.overrides.filter((o) => chaves.includes(o.scope_key));
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.email ? { email: estado.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => estado.ctx ? { ...estado.ctx } : null,
  findColabByEmail: (...args: any[]) => estado.findColabByEmail(...args),
  canViewColabJourney: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsapp: (...args: any[]) => estado.sendWhatsapp(...args) }));
vi.mock('@/lib/rate-limit', () => ({
  heavyLimiter: {},
  devolutivaWhatsAppLimiter: { nome: 'devolutiva' },
  limitarAcao: (...args: any[]) => estado.limitarAcao(...args),
}));
vi.mock('@/actions/ai-client', () => ({ callAI: () => { throw new Error('IA não deve ser chamada neste teste'); } }));
vi.mock('@/lib/relatorio-comportamental/relatorio-core', () => ({
  CACHE_MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
  BUCKET: 'relatorios-pdf',
  isFreshReportCache: () => true,
  fetchColabPorId: (...args: any[]) => estado.fetchColabPorId(...args),
  gerarTextosLLM: vi.fn(),
  persistReportTexts: vi.fn(),
  gerarEsalvarRelatorioComportamentalCore: vi.fn(),
}));

import { enviarWhatsApp, enviarAudio, enviarPDF, enviarLink } from '@/actions/whatsapp';
import {
  enviarDevolutivaWhatsApp, enviarDevolutivaWhatsAppPorId,
} from '@/app/dashboard/perfil-comportamental/relatorio/relatorio-actions';
import { devolutivaWhatsAppLimiter } from '@/lib/rate-limit';

const MASTER = { role: 'colaborador', isPlatformAdmin: true, platformAdminRole: 'master', empresaId: null, colaborador: null };
const SOCIO = { ...MASTER, platformAdminRole: 'socio' };
const resultadoEnvio = { ok: true, provider: 'zapi', attempts: [] };
const endpoints = [
  { nome: 'texto', action: enviarWhatsApp, args: ['5511999990000', 'Mensagem'] },
  { nome: 'áudio', action: enviarAudio, args: ['5511999990000', 'https://signed.example.test/audio.mp3'] },
  { nome: 'PDF', action: enviarPDF, args: ['5511999990000', 'JVBERg==', 'arquivo.pdf'] },
  { nome: 'link', action: enviarLink, args: ['5511999990000', 'https://example.test', 'Título'] },
];

beforeEach(() => {
  sb.reset();
  vi.clearAllMocks();
  estado.email = 'master@example.test';
  estado.ctx = MASTER;
  estado.overrides = [];
  estado.espera = null;
  const agora = new Date().toISOString();
  estado.proprio = {
    id: 'colab-proprio', empresa_id: 'empresa-a', email: 'pessoa@example.test',
    nome_completo: 'Pessoa A', telefone: '5511999990001',
    comportamental_audio_path: 'empresa-a/colab-proprio/audio.mp3',
    comportamental_audio_at: agora, report_generated_at: agora, report_texts: {},
  };
  estado.alvo = {
    ...estado.proprio, id: 'colab-alvo', empresa_id: 'empresa-b', nome_completo: 'Pessoa B',
    telefone: null, whatsapp: '5511999990002', comportamental_audio_path: 'empresa-b/colab-alvo/audio.mp3',
  };
  estado.sendWhatsapp.mockResolvedValue(resultadoEnvio);
  estado.findColabByEmail.mockImplementation(async (email) => email === estado.proprio.email ? estado.proprio : null);
  estado.fetchColabPorId.mockImplementation(async (id) => id === estado.alvo.id ? estado.alvo : null);
  estado.limitarAcao.mockImplementation(async () => estado.espera);
});

describe('endpoints públicos de WhatsApp: autorização obrigatória', () => {
  it.each(endpoints)('$nome: argumento extra antigo não libera envio sem sessão', async ({ action, args }) => {
    estado.email = null;
    for (const extra of [true, { empresaId: 'empresa-b' }]) {
      await expect(Reflect.apply(action, undefined, [...args, extra])).rejects.toThrow(/UNAUTHORIZED/);
    }
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it.each(['colaborador', 'gestor', 'rh'])('%s não envia para número ou URL arbitrários', async (role) => {
    estado.ctx = { role, isPlatformAdmin: false, platformAdminRole: null, empresaId: 'empresa-a' };
    for (const { action, args } of endpoints) {
      await expect(Reflect.apply(action, undefined, [...args, true])).rejects.toThrow(/apenas platform admin/);
    }
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('sessão sem contexto do usuário é recusada', async () => {
    estado.ctx = null;
    await expect(enviarWhatsApp('5511999990000', 'Mensagem')).rejects.toThrow(/UNAUTHORIZED/);
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('sócio sem assessments.dispatch é recusado mesmo com o argumento antigo', async () => {
    estado.ctx = SOCIO;
    for (const { action, args } of endpoints) {
      await expect(Reflect.apply(action, undefined, [...args, true])).rejects.toThrow(/assessments\.dispatch/);
    }
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('deny por usuário impede o envio até do master', async () => {
    estado.overrides = [{ scope_key: 'user:master@example.test', permission_key: 'assessments.dispatch', effect: 'deny' }];
    await expect(enviarAudio('5511999990000', 'https://example.test/audio.mp3')).rejects.toThrow(/assessments\.dispatch/);
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('master autorizado preserva payload e resultado de texto e áudio', async () => {
    expect(await enviarWhatsApp('5511999990000', 'Mensagem')).toEqual({
      success: true, message: 'Mensagem enviada', provider: 'zapi', data: resultadoEnvio,
    });
    expect(await enviarAudio('5511999990000', 'https://example.test/audio.mp3')).toEqual({
      success: true, message: 'Áudio enviado', provider: 'zapi', data: resultadoEnvio,
    });
    expect(estado.sendWhatsapp.mock.calls).toEqual([
      [{ kind: 'text', phone: '5511999990000', text: 'Mensagem' }],
      [{ kind: 'audio', phone: '5511999990000', url: 'https://example.test/audio.mp3' }],
    ]);
  });

  it('falha do provedor continua retornando erro ao admin autorizado', async () => {
    estado.sendWhatsapp.mockResolvedValue({ ok: false, reason: 'Provedor indisponível', attempts: [] });
    expect(await enviarAudio('5511999990000', 'https://example.test/audio.mp3')).toEqual({
      success: false, error: 'Provedor indisponível',
    });
  });
});

describe('devolutiva: caminhos autorizados usam o serviço de transporte', () => {
  it('sem sessão não consulta colaborador, não assina arquivo e não envia', async () => {
    estado.email = null;
    expect(await enviarDevolutivaWhatsApp()).toEqual({ error: 'Não autenticado' });
    expect(estado.findColabByEmail).not.toHaveBeenCalled();
    expect(sb.storageChamadas).toEqual([]);
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('colaborador envia só ao próprio telefone, mesmo recebendo argumentos forjados', async () => {
    estado.email = estado.proprio.email;
    estado.ctx = { role: 'colaborador', isPlatformAdmin: false, empresaId: 'empresa-a' };
    expect(await Reflect.apply(enviarDevolutivaWhatsApp, undefined, [estado.alvo.id, estado.alvo.whatsapp])).toEqual({ success: true });
    expect(estado.findColabByEmail).toHaveBeenCalledWith(estado.proprio.email, expect.any(String));
    expect(estado.limitarAcao).toHaveBeenCalledWith(devolutivaWhatsAppLimiter, 'devolutiva:colab-proprio');
    expect(sb.chamadas).toContainEqual({ tabela: 'colaboradores', metodo: 'eq', args: ['id', 'colab-proprio'] });
    expect(sb.storageChamadas).toContainEqual({
      bucket: 'relatorios-pdf', metodo: 'createSignedUrl',
      args: ['empresa-a/colab-proprio/audio.mp3', 3600, { download: 'vertho-devolutiva-pessoa-a.mp3' }],
    });
    expect(estado.sendWhatsapp).toHaveBeenCalledExactlyOnceWith({
      kind: 'audio', phone: '5511999990001', url: 'https://signed/empresa-a/colab-proprio/audio.mp3',
    });
  });

  it('admin envia ao contato cadastrado do alvo com o mesmo limite por pessoa', async () => {
    expect(await enviarDevolutivaWhatsAppPorId('colab-alvo')).toEqual({ success: true });
    expect(estado.fetchColabPorId).toHaveBeenCalledWith('colab-alvo');
    expect(estado.limitarAcao).toHaveBeenCalledWith(devolutivaWhatsAppLimiter, 'devolutiva:colab-alvo');
    expect(estado.sendWhatsapp).toHaveBeenCalledExactlyOnceWith({
      kind: 'audio', phone: '5511999990002', url: 'https://signed/empresa-b/colab-alvo/audio.mp3',
    });
  });

  it.each([
    { nome: 'sem sessão', email: null, ctx: MASTER, erro: /UNAUTHORIZED/ },
    { nome: 'RH', email: 'rh@example.test', ctx: { role: 'rh', isPlatformAdmin: false }, erro: /apenas platform admin/ },
    { nome: 'sócio', email: 'socio@example.test', ctx: SOCIO, erro: /assessments\.dispatch/ },
  ])('$nome não resolve nem envia a devolutiva de outra pessoa', async ({ email, ctx, erro }) => {
    estado.email = email;
    estado.ctx = ctx;
    expect(await enviarDevolutivaWhatsAppPorId('colab-alvo')).toEqual({ error: expect.stringMatching(erro) });
    expect(estado.fetchColabPorId).not.toHaveBeenCalled();
    expect(sb.storageChamadas).toEqual([]);
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it.each(['proprio', 'admin'])('%s: limite bloqueia antes de assinar ou enviar', async (origem) => {
    estado.espera = 180;
    estado.email = origem === 'proprio' ? estado.proprio.email : 'master@example.test';
    const r = origem === 'proprio' ? await enviarDevolutivaWhatsApp() : await enviarDevolutivaWhatsAppPorId('colab-alvo');
    expect(r).toEqual({ error: expect.stringContaining('Tente de novo em 3 min.') });
    expect(sb.storageChamadas).toEqual([]);
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('falha ao assinar o arquivo impede o envio', async () => {
    sb.falharEm({ tabela: '__storage__:relatorios-pdf', metodo: 'createSignedUrl', mensagem: 'Storage indisponível' });
    expect(await enviarDevolutivaWhatsAppPorId('colab-alvo')).toEqual({ error: 'Erro ao gerar link: Storage indisponível' });
    expect(estado.sendWhatsapp).not.toHaveBeenCalled();
  });

  it('falha no transporte continua sendo exibida como erro', async () => {
    estado.sendWhatsapp.mockResolvedValue({ ok: false, reason: 'Provedor indisponível', attempts: [] });
    expect(await enviarDevolutivaWhatsAppPorId('colab-alvo')).toEqual({ error: 'Provedor indisponível' });
  });
});
