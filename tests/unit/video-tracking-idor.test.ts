import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `registrarVideoWatched` é `'use server'` → endpoint HTTP, e o `colaboradorId`
 * vem do CLIENTE (é parâmetro). Só o dono registra o próprio playback: senão
 * qualquer autenticado forja engajamento de qualquer colaborador/tenant — e
 * `videos_watched.play_finished` é o sinal em que a /admin/engajamento confia.
 * Pior: 'play_finished' dispara a conclusão de pílula na trilha do alvo.
 */

const inserts: any[] = [];
let sessao: any = null;

function makeClient() {
  const from = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: table === 'colaboradores' ? { empresa_id: 'emp-A' } : null, error: null }),
      insert: async (payload: any) => { inserts.push({ table, payload }); return { error: null }; },
    };
    return b;
  };
  return { from };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED: usuário não autenticado');
    return sessao;
  },
}));

import { registrarVideoWatched } from '@/actions/video-tracking';

const params = { videoId: 'vid-1', eventType: 'play_finished', secondsWatched: 100, videoLength: 100 };

beforeEach(() => {
  inserts.length = 0;
  sessao = { colaborador: { id: 'colab-dono' }, email: 'dono@x.com', isPlatformAdmin: false };
});

describe('registrarVideoWatched', () => {
  it('registra o playback do PRÓPRIO colaborador', async () => {
    const r: any = await registrarVideoWatched({ colaboradorId: 'colab-dono', ...params } as any);
    expect(r.ok).toBe(true);
    expect(inserts.filter((i) => i.table === 'videos_watched')).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ colaborador_id: 'colab-dono', empresa_id: 'emp-A' });
  });

  it('NÃO registra playback em nome de outro colaborador', async () => {
    const r: any = await registrarVideoWatched({ colaboradorId: 'outra-pessoa', ...params } as any);
    expect(r.error).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });

  it('NÃO registra quando a sessão não resolve colaborador', async () => {
    sessao = { colaborador: null, email: 'admin@vertho.ai', isPlatformAdmin: true };
    const r: any = await registrarVideoWatched({ colaboradorId: 'colab-dono', ...params } as any);
    expect(r.error).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });

  it('não lança pro client sem sessão', async () => {
    sessao = null;
    const r: any = await registrarVideoWatched({ colaboradorId: 'colab-dono', ...params } as any);
    expect(r.error).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });
});
