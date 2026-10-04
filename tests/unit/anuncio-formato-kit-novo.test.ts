import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-88 (04/10/2026): o formato que a mensagem da cadência anuncia e o kit novo.
 *
 * No kit novo (`desafio.por_preferencia`) a pessoa vê só os 2 primeiros formatos
 * dela, e o vídeo só se for um deles; quem nunca respondeu a tela de preferências é
 * tratado como texto + estudo de caso. O cron lia o plano cru, sem o overlay, e o
 * default de `derivarPrioridadeFormatos` é vídeo: com o deck da célula pronto, a
 * mensagem dizia "Seu vídeo de hoje" a quem a tela não abria o vídeo. O pré-voo usava
 * a mesma regra e não acusava.
 *
 * Aqui o cron roda de verdade, com o `formato-anunciado` e o overlay REAIS (só os
 * canais são stubs).
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  envioPilula: vi.fn(),
  envioTemplate: vi.fn(),
  email: vi.fn(),
  degradacao: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ ...h.sb.client, raw: h.sb.client }) }));
vi.mock('@/lib/degradacao', () => ({ registrarDegradacao: h.degradacao, DEGRADACAO: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/lib/whatsapp', () => ({ assertFilaDoProvedorLimpa: vi.fn(async () => {}) }));
vi.mock('@/lib/qstash-publish', () => ({ publicarWhatsappCis: vi.fn() }));
vi.mock('@/lib/notifications/push-core', () => ({ enviarPush: vi.fn(async () => ({ entregues: 0, falhas: 0 })) }));
vi.mock('@/lib/notifications/pilula-template', () => ({
  templateAtivo: () => null,
  enviarPorTemplate: h.envioTemplate,
  enviarPilulaPorTemplate: h.envioPilula,
}));
vi.mock('@/lib/notifications/pilula-envio', async (orig) => ({
  ...(await orig<any>()),
  enviarEmailPilula: h.email,
}));

import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';
import { formatosEntregaveis, escolherFormatoAnunciado, formatoDeReserva } from '@/lib/season-engine/formato-anunciado';
import { formatosTop2DaPessoa } from '@/lib/season-engine/kit/formatos-por-preferencia';
import { conteudoComoAPessoaVe, criarCacheDeKits } from '@/lib/season-engine/conteudo-da-pessoa';

const SEGUNDA = { hoje: 1, hojeUTC: '2026-11-09', agora: '2026-11-09T12:00:00Z' };
const EMPRESA = { id: 'emp-1', slug: 'escola', is_demo: false, sys_config: {} };

/** Sem nenhuma preferência declarada: o default vira vídeo, o kit novo trata como texto + caso. */
const SEM_PREFERENCIA = {};
/** Vídeo, depois áudio: o vídeo está entre os 2 primeiros. */
const QUER_VIDEO = { pref_video_curto: 5, pref_audio: 4, pref_texto: 2, pref_estudo_caso: 1 };
/** Texto, depois caso: o vídeo está FORA dos 2 primeiros, mesmo tendo preferência declarada. */
const QUER_TEXTO = { pref_texto: 5, pref_estudo_caso: 4, pref_video_curto: 2, pref_audio: 1 };

const PLANO = [{
  semana: 1, tipo: 'conteudo', descritor: 'Planejar aulas',
  conteudos_dia: [
    { competencia: 'Planejamento', descritor: 'Planejar aulas', conteudo: { core_id: 'core-1', titulo: 'Tema 1', formatos_disponiveis: { texto: { id: 'p-t', url: null }, case: { id: 'p-c', url: null } } } },
    { competencia: 'Planejamento', descritor: 'Planejar aulas', conteudo: { core_id: 'core-1', titulo: 'Tema 1b', formatos_disponiveis: { texto: { id: 'p-t', url: null }, case: { id: 'p-c', url: null } } } },
  ],
}];

function cron(opts: { prefs: Record<string, number>; kitNovo: boolean; deckPronto?: boolean; kitsFalham?: boolean }) {
  h.sb = criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'fase4_envios') {
        return [{
          id: 'env-1', colaborador_id: 'c1', semana_atual: 1, status: 'ativo',
          colaboradores: { nome_completo: 'Maria Souza', whatsapp: '+5571999990000', email: 'maria@x.br', perfil_dominante: 'S', cargo: 'Professora', ...opts.prefs },
        }];
      }
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'c1', numero_temporada: 1, temporada_plano: PLANO, competencia_foco: 'Planejamento', data_inicio: '2026-11-09' }];
      if (tabela === 'kit_briefs') return [{ id: 'b1', competencia: 'Planejamento', descritor: 'Planejar aulas', cargo: null, empresa_id: null }];
      if (tabela === 'kits') {
        return [{ id: 'k1', brief_id: 'b1', created_at: '2026-10-01T00:00:00Z', desafio: { desafio_texto: 'Faça X', ...(opts.kitNovo ? { por_preferencia: true } : {}) } }];
      }
      if (tabela === 'micro_conteudos') {
        return [
          { id: 'k-t', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto do kit' },
          { id: 'k-c', kit_id: 'k1', formato: 'case', url: null, titulo: 'Caso do kit' },
          { id: 'k-a', kit_id: 'k1', formato: 'audio', url: null, titulo: 'Áudio do kit' },
        ];
      }
      return [];
    },
    resolver: (tabela) => {
      // `temDeckPronto`: o core aponta para um módulo-base e a célula tem deck assistível.
      if (tabela === 'empresas') return { sys_config: {} };
      if (tabela === 'micro_conteudos') return { modulo_base_id: 'mb-1' };
      if (tabela === 'videos_gerados') return opts.deckPronto === false ? null : { id: 'deck-1' };
      return null;
    },
    falhas: opts.kitsFalham ? [{ tabela: 'kit_briefs', op: 'select', mensagem: 'timeout no pool' }] : [],
  });
}

const formatoDaPilula = () => h.envioPilula.mock.calls[0]?.[0]?.formato;
const htmlDoEmail = () => String(h.email.mock.calls[0]?.[2] ?? '');

describe('cron da cadência × kit novo: o formato anunciado é o que a pessoa vê', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(SEGUNDA.agora));
    for (const f of [h.envioPilula, h.envioTemplate, h.email, h.degradacao]) f.mockReset();
    h.envioPilula.mockResolvedValue({ tentou: true, ok: true });
    h.envioTemplate.mockResolvedValue({ tentou: true, ok: true });
    h.email.mockResolvedValue({ ok: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('🔴 kit novo, SEM preferência declarada e deck pronto: anuncia texto, nunca vídeo', async () => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo: true });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('texto');
    expect(htmlDoEmail()).not.toContain('formato=video');
    expect(htmlDoEmail()).toContain('formato=texto');
  });

  it('🔴 kit novo, preferência declarada com o vídeo FORA dos 2 primeiros: não anuncia vídeo', async () => {
    cron({ prefs: QUER_TEXTO, kitNovo: true });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('texto');
  });

  it('kit novo, vídeo entre os 2 primeiros e deck pronto: anuncia vídeo', async () => {
    cron({ prefs: QUER_VIDEO, kitNovo: true });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('video');
  });

  it('kit novo, vídeo entre os 2 primeiros mas SEM deck: anuncia o áudio, o outro dos 2', async () => {
    cron({ prefs: QUER_VIDEO, kitNovo: true, deckPronto: false });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('audio');
  });

  it('kit ANTERIOR segue como sempre: sem preferência e com deck pronto, o vídeo é anunciado (a tela o mostra)', async () => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo: false });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('video');
  });

  it('a leitura dos kits falhou: cai no comportamento de antes, mas REGISTRA a queda', async () => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo: true, kitsFalham: true });
    await processarEmpresaDiario(EMPRESA, SEGUNDA);
    expect(formatoDaPilula()).toBe('video');
    const registro = h.degradacao.mock.calls.map((c: any[]) => c[0]).find((r: any) => r.tipo === 'FORMATO_ANUNCIADO_SEM_KIT');
    expect(registro).toMatchObject({ fluxo: 'envio', chave: 'diario:emp-1', empresaId: 'emp-1', severidade: 'aviso' });
    expect(registro.detalhe.motivo).toContain('timeout no pool');
  });
});

describe('conteudoComoAPessoaVe', () => {
  const item = PLANO[0].conteudos_dia[0];
  const montar = (kitNovo: boolean) => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo });
    return criarCacheDeKits(h.sb.client, 'emp-1')('Professora', 'S');
  };

  it('devolve uma CÓPIA: o plano em memória do cron (tema, link) não é tocado', async () => {
    const kitsCache = await montar(true);
    const antes = JSON.stringify(item);
    const vista = await conteudoComoAPessoaVe(h.sb.client, { item, semana: 1, colab: { perfil_dominante: 'S', cargo: 'Professora' }, empresaId: 'emp-1', competenciaFoco: 'Planejamento', kitsCache });
    expect(vista.video_permitido).toBe(false);
    expect(JSON.stringify(item)).toBe(antes);
    expect((item.conteudo as any).video_permitido).toBeUndefined();
  });

  it('kit novo: `video_permitido` acompanha os 2 primeiros da pessoa', async () => {
    const kitsCache = await montar(true);
    const colab = { perfil_dominante: 'S', cargo: 'Professora', ...QUER_VIDEO };
    const vista = await conteudoComoAPessoaVe(h.sb.client, { item, semana: 1, colab, empresaId: 'emp-1', competenciaFoco: 'Planejamento', kitsCache });
    expect(vista.video_permitido).toBe(true);
    // O áudio entra nos 2 primeiros, e o kit tem áudio: aparece mesmo sem constar do plano.
    expect(Object.keys(vista.formatos_disponiveis).sort()).toEqual(['audio']);
  });

  it('kit anterior: nada é marcado nem filtrado', async () => {
    const kitsCache = await montar(false);
    const vista = await conteudoComoAPessoaVe(h.sb.client, { item, semana: 1, colab: { perfil_dominante: 'S', cargo: 'Professora' }, empresaId: 'emp-1', competenciaFoco: 'Planejamento', kitsCache });
    expect(vista.video_permitido).toBeUndefined();
    expect(Object.keys(vista.formatos_disponiveis).sort()).toEqual(['audio', 'case', 'texto']);
  });

  it('o cache pergunta uma vez por (cargo × DISC), mesmo com várias pessoas na célula', async () => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo: true });
    const kits = criarCacheDeKits(h.sb.client, 'emp-1');
    await Promise.all([kits('Professora', 'S'), kits('professora ', 'sic'), kits('Professora', 'S')]);
    expect(h.sb.chamadas.filter((c: any) => c.tabela === 'kit_briefs' && c.metodo === 'select')).toHaveLength(1);
    await kits('Diretora', 'S');
    expect(h.sb.chamadas.filter((c: any) => c.tabela === 'kit_briefs' && c.metodo === 'select')).toHaveLength(2);
  });
});

describe('formatosEntregaveis / escolherFormatoAnunciado com `video_permitido`', () => {
  const comDeck = () => criarSupabaseMock({ resolver: (t) => (t === 'micro_conteudos' ? { modulo_base_id: 'mb-1' } : { id: 'deck' }) });
  const conteudo = (extra: Record<string, any>) => ({ core_id: 'core-1', formatos_disponiveis: { texto: { id: 't' }, case: { id: 'c' } }, ...extra });

  it('🔴 `video_permitido: false` fecha o vídeo mesmo com o deck pronto, e nem pergunta pelo deck', async () => {
    const sb = comDeck();
    const r = await formatosEntregaveis(sb.client, { empresaId: 'e1', conteudo: conteudo({ video_permitido: false }), cargo: 'C1', disc: 'D' });
    expect(r).toEqual(['texto', 'case']);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('`video_permitido: true` ou ausente: o deck decide, como sempre', async () => {
    for (const extra of [{ video_permitido: true }, {}]) {
      const r = await formatosEntregaveis(comDeck().client, { empresaId: 'e1', conteudo: conteudo(extra), cargo: 'C1', disc: 'D' });
      expect(r).toContain('video');
    }
  });

  it('`semVideo` tira o vídeo da escolha, e a reserva também não o devolve', () => {
    expect(escolherFormatoAnunciado(SEM_PREFERENCIA, ['video', 'texto'], { semVideo: true })).toBe('texto');
    expect(escolherFormatoAnunciado(SEM_PREFERENCIA, ['video', 'texto'])).toBe('video');
    expect(formatoDeReserva(SEM_PREFERENCIA, { semVideo: true })).toBe('texto');
    expect(formatoDeReserva(SEM_PREFERENCIA)).toBe('video');
  });
});

describe('formatosTop2DaPessoa', () => {
  it('sem preferência: texto + caso, a mesma regra do kit novo', () => {
    expect(formatosTop2DaPessoa(SEM_PREFERENCIA)).toEqual(['texto', 'case']);
  });
  it('com preferência: os 2 primeiros dela', () => {
    expect(formatosTop2DaPessoa(QUER_VIDEO)).toEqual(['video', 'audio']);
    expect(formatosTop2DaPessoa(QUER_TEXTO)).toEqual(['texto', 'case']);
  });
});

describe('pré-voo (health) × kit novo: mede o que o envio promete', () => {
  // Segunda 09/11/2026 em Brasília: a P1 sai nesse dia.
  const ALVO = new Date('2026-11-09T12:00:00Z');

  it('🔴 sem preferência e deck pronto no kit novo: a entrega prevista não tem vídeo e promete texto', async () => {
    cron({ prefs: SEM_PREFERENCIA, kitNovo: true });
    const { coletarEntregasPrevistas } = await import('@/lib/pipeline-health/coleta');
    const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(h.sb.client, 'emp-1', ALVO);
    expect(pilulaAlvo).toBe(1);
    expect(entregas).toHaveLength(1);
    expect(entregas[0].formatosDisponiveis).not.toContain('video');
    expect(entregas[0].formatoAnunciado).toBe('texto');
  });

  it('com o vídeo entre os 2 primeiros, a mesma coleta o dá por entregável', async () => {
    cron({ prefs: QUER_VIDEO, kitNovo: true });
    const { coletarEntregasPrevistas } = await import('@/lib/pipeline-health/coleta');
    const { entregas } = await coletarEntregasPrevistas(h.sb.client, 'emp-1', ALVO);
    expect(entregas[0].formatosDisponiveis).toContain('video');
    expect(entregas[0].formatoAnunciado).toBe('video');
  });
});
