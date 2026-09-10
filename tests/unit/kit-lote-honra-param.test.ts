import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * INVARIANTE: quem decide o lote (Batch API, −50%) é o PARÂMETRO `useBatch`,
 * não a quantidade de DISC do item.
 *
 * POR QUE ESTE TESTE EXISTE (medido em 24/08/2026): `gerarKitSemanal` tinha um
 * `useBatch && discs.length >= 2`, e ele silenciava o pedido em vez de recusá-lo
 * — 9 jobs foram enfileirados com `useBatch: true` gravado em `kit_jobs.params`
 * e **7 dos 11 DISC rodaram síncronos assim mesmo**, ~$0,77 a mais numa rodada
 * de ~$2. Nada no retorno, no progresso ou no job dizia que o lote fora ignorado:
 * o param declarado não era o param aplicado (mesma classe de "config sem
 * consumidor" do CLAUDE.md).
 *
 * O teste observa o CAMINHO percorrido, não o texto do código: no lote o
 * collector é criado e o `aiRun` dele chega às funções de geração; no síncrono
 * não há collector e `aiRun` fica `undefined` (as funções caem no `callAI`).
 *
 * ⚠️ A régua NÃO é "item de 1 DISC sempre loteia" — é "o chamador manda". Por
 * isso o 3º caso: `useBatch: false` com 4 DISC continua síncrono, senão a
 * correção teria trocado um default cego por outro.
 */

const collectorCriado = vi.fn();
const runDoCollector = vi.fn(async () => 'texto do batch');
const podcastCore = vi.fn(async (_sb: any, _mc: any, _update: any) => ({ success: true, error: undefined as string | undefined }));
vi.mock('@/lib/conteudo-podcast-core', () => ({ gerarPodcastAudioCore: (...args: any[]) => (podcastCore as any)(...args) }));

vi.mock('@/lib/ai-batch', () => ({
  createAIBatchCollector: (...args: any[]) => {
    collectorCriado(...args);
    return { run: runDoCollector };
  },
}));

const gerarKitDesafioMock = vi.fn(async (p: any) => {
  chamadasDesafio.push({ aiRun: p?.aiRun });
  return { desafio_texto: 'faça X', acao_observavel: 'a', criterio_de_execucao: 'c', por_que_cabe_na_semana: 'p' };
});
const chamadasDesafio: Array<{ aiRun: any }> = [];

vi.mock('@/lib/season-engine/kit/brief', () => ({
  resolverOuCriarBrief: vi.fn(async () => ({
    briefId: 'b1', brief: { espinha: 'núcleo' }, moduloBaseId: null, reused: true,
  })),
  gerarKitDesafio: (...args: any[]) => (gerarKitDesafioMock as any)(...args),
}));

const chamadasConteudo: Array<{ formato: string; aiRun: any }> = [];
vi.mock('@/actions/conteudos', () => ({
  gerarConteudoIA: vi.fn(async (p: any) => {
    chamadasConteudo.push({ formato: p.formato, aiRun: p.aiRun });
    return { success: true, conteudoId: `c-${p.formato}`, titulo: p.formato };
  }),
}));

vi.mock('@/lib/season-engine/perfil-publico', () => ({
  resolverPerfilPublicoDaEmpresa: vi.fn(async () => ({ registro: 'formal' })),
}));
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: vi.fn() }));
vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: vi.fn(async () => { throw new Error('não deve ser chamado: o teste injeta sb'); }),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));

import { criarSupabaseMock } from '../helpers/supabase-mock';
import { gerarKitSemanal } from '@/actions/kits';

function sbFake() {
  return criarSupabaseMock({
    // o upsert em `kits` faz `.select('id').single()`
    resolver: (tabela) => (tabela === 'kits' ? { id: 'kit-1' } : tabela === 'micro_conteudos' ? { id: 'c-audio', formato: 'audio', empresa_id: 'emp-1', conteudo_inline: 'Roteiro do podcast' } : null),
  });
}

beforeEach(() => {
  collectorCriado.mockClear();
  runDoCollector.mockClear();
  chamadasDesafio.length = 0;
  chamadasConteudo.length = 0;
  podcastCore.mockReset().mockResolvedValue({ success: true, error: undefined });
});

const BASE = {
  competencia: 'Gerenciamento de conflitos',
  descritor: 'Neutralidade',
  empresaId: 'emp-1',
  cargo: 'Diretor(a) Escolar',
  formatos: ['texto'] as any,
  incluirVideo: false,
};

describe('lote do kit segue o parâmetro, não a contagem de DISC', () => {
  it('renderAudio usa o núcleo headless com o cliente do job', async () => {
    const sb = sbFake();
    const r = await gerarKitSemanal({ ...BASE, formatos: ['audio'], discs: ['C'], renderAudio: true, sb: sb.client as any });
    expect(r.success).toBe(true);
    expect(r.audioRendered).toBe(1);
    expect(podcastCore).toHaveBeenCalledWith(sb.client, expect.objectContaining({ id: 'c-audio', empresa_id: 'emp-1' }), expect.any(Function));
    const update = podcastCore.mock.calls[0][2];
    await expect(update('c-audio', { url: 'https://example.test/audio.mp3' })).resolves.toEqual(expect.objectContaining({ url: 'https://example.test/audio.mp3' }));
    expect(sb.chamadas.filter(c => c.tabela === 'micro_conteudos' && c.metodo === 'eq' && c.args[0] === 'empresa_id').map(c => c.args[1])).toEqual(['emp-1', 'emp-1']);
  });

  it('falha ao ler o áudio não chama síntese nem relata sucesso', async () => {
    const sb = sbFake();
    sb.falharEm({ tabela: 'micro_conteudos', op: 'select', mensagem: 'consulta indisponível' });
    const r = await gerarKitSemanal({ ...BASE, formatos: ['audio'], discs: ['C'], renderAudio: true, sb: sb.client as any });
    expect(r.success).toBe(false);
    expect(r.error).toContain('consulta indisponível');
    expect(podcastCore).not.toHaveBeenCalled();
  });

  it('falha de persistência após síntese também torna o job observavelmente incompleto', async () => {
    const sb = sbFake();
    sb.falharEm({ tabela: 'micro_conteudos', op: 'update', mensagem: 'escrita indisponível' });
    podcastCore.mockImplementation(async (_sb, mc, update) => {
      await update(mc.id, { url: 'https://example.test/audio.mp3' });
      return { success: true, error: undefined };
    });
    const r = await gerarKitSemanal({ ...BASE, formatos: ['audio'], discs: ['C'], renderAudio: true, sb: sb.client as any });
    expect(r.success).toBe(false);
    expect(r.error).toContain('escrita indisponível');
  });

  it('áudio reprovado não vira job concluído com zero podcasts silenciosamente', async () => {
    podcastCore.mockResolvedValue({ success: false, error: 'TTS: todas as tentativas reprovadas' });
    const sb = sbFake();
    const r = await gerarKitSemanal({ ...BASE, formatos: ['audio'], discs: ['C'], renderAudio: true, sb: sb.client as any });
    expect(r.success).toBe(false);
    expect(r.audioRendered).toBe(0);
    expect(r.error).toContain('todas as tentativas reprovadas');
  });

  it('1 DISC com useBatch=true LOTEIA (o caso que a régua antiga silenciava)', async () => {
    const sb = sbFake();
    const r = await gerarKitSemanal({ ...BASE, discs: ['C'], useBatch: true, sb: sb.client as any });

    expect(r.success).toBe(true);
    expect(collectorCriado).toHaveBeenCalledTimes(1);
    // O observável de que o lote foi REALMENTE usado: o `aiRun` do collector
    // chegou às duas pontas de geração (desafio e formatos).
    expect(chamadasDesafio.every((c) => c.aiRun === runDoCollector)).toBe(true);
    expect(chamadasConteudo.every((c) => c.aiRun === runDoCollector)).toBe(true);
  });

  it('2 DISC com useBatch=true segue loteando (não regride o caminho que já funcionava)', async () => {
    const sb = sbFake();
    await gerarKitSemanal({ ...BASE, discs: ['D', 'I'], useBatch: true, sb: sb.client as any });

    expect(collectorCriado).toHaveBeenCalledTimes(1);
    expect(chamadasDesafio).toHaveLength(2);
    expect(chamadasDesafio.every((c) => c.aiRun === runDoCollector)).toBe(true);
  });

  it('useBatch=false NÃO loteia, mesmo com os 4 DISC — quem manda é o chamador', async () => {
    const sb = sbFake();
    await gerarKitSemanal({ ...BASE, discs: ['D', 'I', 'S', 'C'], useBatch: false, sb: sb.client as any });

    expect(collectorCriado).not.toHaveBeenCalled();
    expect(chamadasDesafio).toHaveLength(4);
    expect(chamadasDesafio.every((c) => c.aiRun === undefined)).toBe(true);
  });
});
