import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const gerarKitSemanal = vi.fn(async (_p: any) => ({ success: true, kits: [{ kitId: 'k1' }], message: 'ok' }));
vi.mock('@trigger.dev/sdk', () => ({ task: (def: any) => def }));
vi.mock('@/actions/kits', () => ({ gerarKitSemanal: (p: any) => gerarKitSemanal(p) }));
let params: any = {};
const sb = () => criarSupabaseMock({ resolver: (t) => (t === 'kit_jobs' ? { id: 'j1', empresa_id: 'e1', competencia: 'C', descritor: 'D', params } : null) });
let mock = sb();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mock.client }));

import { gerarKitTask } from '@/trigger/gerar-kit';

/**
 * O fluxo completo decide os formatos do kit pelas preferências da célula e grava em `kit_jobs.params`. A task é quem
 * PASSA isso ao gerador: se ela esquecer, o job roda com os 3 formatos padrão e a decisão vira config sem consumidor.
 */
describe('task gerar-kit repassa o que o job decidiu', () => {
  beforeEach(() => { gerarKitSemanal.mockClear(); });
  it('formatos, renderAudio e incluirVideo do job chegam ao gerarKitSemanal', async () => {
    params = { discs: ['D'], formatos: ['audio', 'texto'], renderAudio: true, incluirVideo: true, useBatch: false, porPreferencia: true, audioNominal: true };
    mock = sb();
    await (gerarKitTask as any).run({ jobId: 'j1' });
    expect(gerarKitSemanal.mock.calls[0][0]).toMatchObject({ formatos: ['audio', 'texto'], renderAudio: true, incluirVideo: true, discs: ['D'], porPreferencia: true, audioNominal: true });
  });
  it('job sem formatos (botão manual) segue com o padrão do gerador', async () => {
    params = { discs: ['D', 'I'], renderAudio: false, incluirVideo: false };
    mock = sb();
    await (gerarKitTask as any).run({ jobId: 'j1' });
    expect(gerarKitSemanal.mock.calls[0][0].formatos).toBeUndefined();
    expect(gerarKitSemanal.mock.calls[0][0].porPreferencia).toBe(false);
    expect(gerarKitSemanal.mock.calls[0][0].audioNominal).toBe(false);
  });
});
