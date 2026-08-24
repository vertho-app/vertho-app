import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 2 da auditoria 22/08 — os 20 exports do achado A5, exercitados um a um.
 *
 * A classe: `requireAdminSupabase('content.manage')` prova PERMISSÃO e nada mais
 * (`content.manage`, `users.manage` e `exports.run` estão em
 * `BASE_ROLE_PERMISSIONS.rh`), enquanto o id que escolhe a linha — `empresaId`
 * ou o id do recurso — vem do CLIENTE. Resultado: RH do tenant A editava,
 * gerava, apagava e importava no tenant B mandando o id.
 *
 * O guard `gate-permissao-guard` prova que o PADRÃO sumiu do código. Estes casos
 * provam o COMPORTAMENTO: com o gate certo no lugar, a chamada cross-tenant
 * falha. As duas coisas são necessárias — o guard vê que existe gate, não que
 * ele barra.
 *
 * ⚠️ Os retornos diferem de propósito: parte dessas actions envelopa o throw num
 * try/catch e devolve `{ error }`, parte deixa vazar. O teste segue a forma REAL
 * de cada uma — uniformizar aqui esconderia o dia em que uma delas mudar.
 */

let sessao: any = null;
let temPermissao = true;
/** Tenant da linha/registro alvo — a vítima. */
let tenantDoRegistro: string | null = 'emp-B';

function makeClient() {
  const from = () => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, not: () => b, or: () => b, is: () => b,
      order: () => b, limit: () => b, neq: () => b, update: () => b, delete: () => b,
      insert: () => b, upsert: () => b,
      single: async () => ({ data: { id: 'x', empresa_id: tenantDoRegistro, nome: 'Empresa' }, error: null }),
      maybeSingle: async () => ({
        data: { id: 'x', empresa_id: tenantDoRegistro, formato: 'audio', competencia: 'C', storage_path: null, url: null, conteudo_inline: 'x'.repeat(100) },
        error: null,
      }),
      then: undefined,
    };
    return b;
  };
  return {
    from,
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'u' } }) }) },
  };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  requireAdminAction: async (permission?: string) => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    if (!sessao.isPlatformAdmin) throw new Error('FORBIDDEN: apenas platform admin');
    if (permission && !temPermissao) throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
    return sessao;
  },
  requirePermissionAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  assertTenantAccessAction: async (auth: any, empresaId: string | null | undefined) => {
    if (!empresaId) throw new Error('BAD_REQUEST: empresaId obrigatório');
    if (auth.isPlatformAdmin) return;
    if (auth.empresaId !== empresaId) throw new Error('FORBIDDEN: sem acesso a esta empresa');
  },
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/permissions', () => ({ can: async () => temPermissao }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => ({ texto: '{}' })), callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(), DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/gemini-tts', () => ({ extractNarration: () => 'n'.repeat(50), generatePodcastAudio: vi.fn(async () => ({ buffer: Buffer.from(''), extension: 'wav', contentType: 'audio/wav' })) }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() }, runs: { retrieve: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/manuscrito-parser', () => ({ parsearManuscrito: vi.fn(), TRANSICOES: [] }));
vi.mock('@/lib/manuscrito-modulos', () => ({ resolverDescritores: vi.fn() }));
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: vi.fn(async () => ({ plano: [], totalFaltantes: 0, colaboradores: 0 })) }));
vi.mock('@/lib/season-engine/kit/brief', () => ({ resolverOuCriarBrief: vi.fn(), gerarKitDesafio: vi.fn() }));
vi.mock('@/lib/season-engine/perfil-publico', () => ({ resolverPerfilPublicoDaEmpresa: vi.fn(async () => null) }));

import {
  atualizarConteudo, gerarConteudoFinal, gerarPodcastAudio, aprovarRoteiroPodcastEGerarAudio,
  excluirConteudoFinal, deletarConteudo, aplicarTagsIA, gerarConteudoIA, gerarConteudoLote,
  importarVideosBunny,
} from '@/actions/conteudos';
import { removerTop10 } from '@/actions/fase1';
import { excluirCompetenciaBase, salvarCompetenciaBase } from '@/actions/competencias-base';
import { importarColaboradoresLote, configurarCompetencias } from '@/actions/onboarding';
import { extrairPPP } from '@/actions/ppp';
import { gerarKit, gerarKitSemanal, enqueueKit, statusKit, planejarKitsCoorte } from '@/actions/kits';
import { analisarManuscrito } from '@/actions/manuscrito-batch';

const OUTRO = 'emp-B';
const rhEmpA = { role: 'rh', empresaId: 'emp-A', email: 'rh@a.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
const platformAdmin = { role: null, empresaId: null, email: 'admin@vertho.ai', colaborador: null, isPlatformAdmin: true };
const FORBIDDEN = /FORBIDDEN|acesso restrito|sem acesso|apenas platform admin/i;

beforeEach(() => {
  sessao = rhEmpA;
  temPermissao = true;
  tenantDoRegistro = 'emp-B';
});

/** O tenant vem da LINHA: o cliente manda o id do RECURSO, não o da empresa. */
describe('A5 — tenant da LINHA: RH do tenant A não alcança recurso do tenant B', () => {
  it('atualizarConteudo — não edita micro-conteúdo alheio (inclui ativo:false)', async () => {
    const r: any = await atualizarConteudo('c-1', { titulo: 'X' });
    expect(r.error).toMatch(FORBIDDEN);
    expect(r.ok).toBeUndefined();
  });

  it('aplicarTagsIA — delega para atualizarConteudo e herda o gate', async () => {
    const r: any = await aplicarTagsIA('c-1', { pilar: 'P' });
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('gerarConteudoFinal — não gera PDF no acervo alheio (queima IA no orçamento dele)', async () => {
    const r: any = await gerarConteudoFinal('c-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('gerarPodcastAudio — não lê a linha inteira nem gera áudio alheio', async () => {
    const r: any = await gerarPodcastAudio('c-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('aprovarRoteiroPodcastEGerarAudio — não aprova roteiro alheio', async () => {
    const r: any = await aprovarRoteiroPodcastEGerarAudio('c-1', 'roteiro com mais de vinte caracteres');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('excluirConteudoFinal — não apaga o arquivo final do Storage alheio', async () => {
    const r: any = await excluirConteudoFinal('c-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('deletarConteudo — não apaga micro-conteúdo alheio', async () => {
    const r: any = await deletarConteudo('c-1');
    expect(r.error).toMatch(FORBIDDEN);
    expect(r.ok).toBeUndefined();
  });

  it('removerTop10 — não apaga o Top10 de cargo de outro tenant', async () => {
    await expect(removerTop10('t-1')).rejects.toThrow(FORBIDDEN);
  });

  it('statusKit — não lê status/competência de job alheio', async () => {
    expect(await statusKit('job-1')).toBeNull();
  });
});

/** O tenant é PARÂMETRO: o cliente escolhe a empresa direto. */
describe('A5 — tenant é PARÂMETRO: RH do tenant A não escreve no tenant B', () => {
  it('gerarConteudoIA — não gera conteúdo no acervo alheio', async () => {
    const r: any = await gerarConteudoIA({ formato: 'texto', competencia: 'C', descritor: 'D', empresaId: OUTRO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('gerarConteudoLote — idem, em lote', async () => {
    const r: any = await gerarConteudoLote({ formato: 'texto', competencia: 'C', empresaId: OUTRO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('importarVideosBunny — não importa a library para o acervo alheio', async () => {
    const r: any = await importarVideosBunny(OUTRO);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('extrairPPP — não extrai PPP de outra empresa (nem faz o scrape)', async () => {
    await expect(extrairPPP(OUTRO, { textos: ['t'] })).rejects.toThrow(FORBIDDEN);
  });

  it('importarColaboradoresLote — não CRIA gente em tenant alheio', async () => {
    await expect(importarColaboradoresLote(OUTRO, [{ email: 'a@b.com' }])).rejects.toThrow(FORBIDDEN);
  });

  it('configurarCompetencias — não insere competências em tenant alheio', async () => {
    await expect(configurarCompetencias(OUTRO, [{ nome: 'X' }])).rejects.toThrow(FORBIDDEN);
  });

  it('gerarKit — não gera kit no tenant alheio', async () => {
    const r: any = await gerarKit({ competencia: 'C', descritor: 'D', disc: 'D', empresaId: OUTRO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('gerarKitSemanal — idem, os 4 DISC', async () => {
    const r: any = await gerarKitSemanal({ competencia: 'C', descritor: 'D', empresaId: OUTRO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('enqueueKit — o ponto CEGO do guard (id dentro do objeto) também barra', async () => {
    const r: any = await enqueueKit({ competencia: 'C', descritor: 'D', empresaId: OUTRO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('planejarKitsCoorte — não planeja/enfileira kits no tenant alheio', async () => {
    const r: any = await planejarKitsCoorte(OUTRO, {});
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('analisarManuscrito — não queima IA no orçamento do tenant alheio', async () => {
    const r: any = await analisarManuscrito({ arquivoBase64: 'x', empresaId: OUTRO });
    expect(r.error).toMatch(FORBIDDEN);
  });
});

/**
 * Decisão de produto de 24/08: `competencias_base` é o CATÁLOGO GLOBAL — uma
 * linha serve todos os tenants. Escrita ali é de plataforma, não de RH.
 */
describe('catálogo GLOBAL — platform_admin apenas', () => {
  it('excluirCompetenciaBase — RH com content.manage é barrado', async () => {
    await expect(excluirCompetenciaBase('cb-1')).rejects.toThrow(FORBIDDEN);
  });

  it('salvarCompetenciaBase — idem (o guard não via este: o id vinha em `comp.id`)', async () => {
    await expect(salvarCompetenciaBase({ id: 'cb-1', nome: 'X' })).rejects.toThrow(FORBIDDEN);
  });

  it('platform admin continua passando', async () => {
    sessao = platformAdmin;
    const r: any = await excluirCompetenciaBase('cb-1');
    expect(r.success).toBe(true);
  });

  it('gerarConteudoIA sem empresaId = catálogo global: RH barrado', async () => {
    const r: any = await gerarConteudoIA({ formato: 'texto', competencia: 'C', descritor: 'D', empresaId: null });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });
});

/**
 * O gate tem de barrar o alheio SEM quebrar o legítimo — senão a "correção" é só
 * uma tela que parou de funcionar. É a metade que a vigília de FORBIDDEN existe
 * para medir em produção.
 */
describe('o fluxo legítimo continua passando', () => {
  beforeEach(() => { tenantDoRegistro = 'emp-A'; });

  it('atualizarConteudo — RH edita conteúdo da PRÓPRIA empresa', async () => {
    const r: any = await atualizarConteudo('c-1', { titulo: 'X' });
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('deletarConteudo — RH apaga conteúdo da própria empresa', async () => {
    const r: any = await deletarConteudo('c-1');
    expect(r.ok).toBe(true);
  });

  it('planejarKitsCoorte — RH planeja a própria coorte', async () => {
    const r: any = await planejarKitsCoorte('emp-A', {});
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('platform admin alcança o tenant alheio (não quebramos a plataforma)', async () => {
    sessao = platformAdmin;
    tenantDoRegistro = 'emp-B';
    const r: any = await atualizarConteudo('c-1', { titulo: 'X' });
    expect(r.ok).toBe(true);
  });

  it('RH da empresa certa SEM a permissão continua barrado (a dimensão do H0)', async () => {
    temPermissao = false;
    const r: any = await atualizarConteudo('c-1', { titulo: 'X' });
    expect(r.error).toMatch(/permissão necessária/);
  });
});
