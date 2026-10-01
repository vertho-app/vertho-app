import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { kbEmbeddingUpdate, moduloEmbeddingUpdate, moduloEmbeddingCompativel, VOYAGE_4_MODEL } from '@/lib/embeddings';

const mocks = vi.hoisted(() => ({ embedQuery: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/embeddings', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/embeddings')>(), embedQuery: mocks.embedQuery,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: mocks.admin }));
import { retrieveContext, isMetadataOnlyChunk } from '@/lib/rag';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const chunk = (id: string, conteudo = 'Abra o menu e escolha Tira-Dúvidas para enviar sua pergunta.') =>
  ({ id, titulo: 'Ajuda', conteudo, categoria: null, score: 0.02 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('rollout Voyage — gerações separadas', () => {
  it('grava Voyage 4 em colunas novas; rollback continua escrevendo nas legadas', () => {
    const v4 = { model: VOYAGE_4_MODEL, vector: [1, 0] };
    const v3 = { model: 'voyage/voyage-3-large', vector: [0, 1] };
    expect(kbEmbeddingUpdate(v4)).toMatchObject({ embedding_v4: [1, 0], embedding_v4_model: VOYAGE_4_MODEL });
    expect(kbEmbeddingUpdate(v4)).not.toHaveProperty('embedding');
    expect(moduloEmbeddingUpdate(v4)).not.toHaveProperty('descritor_embedding');
    expect(kbEmbeddingUpdate(v3)).toMatchObject({ embedding: [0, 1], embedding_model: v3.model });
    expect(moduloEmbeddingUpdate(v3)).toEqual({ descritor_embedding: [0, 1] });
    const m = { descritor_embedding: v3.vector, descritor_embedding_v4: v4.vector, descritor_embedding_v4_model: v4.model };
    expect(moduloEmbeddingCompativel(m, v4.model)).toEqual(v4.vector);
    expect(moduloEmbeddingCompativel(m, v3.model)).toEqual(v3.vector);
    expect(moduloEmbeddingCompativel({ ...m, descritor_embedding_v4_model: v3.model }, v4.model)).toBeNull();
    expect(moduloEmbeddingCompativel(m, 'openai/text-embedding-3-small')).toBeNull();
  });

  it.each([[VOYAGE_4_MODEL, 'kb_search_hybrid_v4'], ['voyage/voyage-3-large', 'kb_search_hybrid']])(
    'query %s usa somente a RPC compatível', async (model, rpc) => {
      const sb = criarSupabaseMock();
      mocks.admin.mockReturnValue(sb.client);
      mocks.embedQuery.mockResolvedValue({ vector: [1, 0], model });
      sb.client.rpc.mockResolvedValue({ data: [chunk('indice', 'Escuta ativa\n\nN3\n\nCOMT01_MB34'), chunk('util')], error: null });
      expect((await retrieveContext('tenant-a', 'Como escutar melhor?', 1)).map(c => c.id)).toEqual(['util']);
      expect(sb.client.rpc).toHaveBeenCalledOnce();
      expect(sb.client.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ p_empresa_id: 'tenant-a', p_limit: 3 }));
    },
  );

  it('falha da RPC nova cai para FTS no mesmo tenant, sem comparar vetores de outra geração', async () => {
    const sb = criarSupabaseMock();
    mocks.admin.mockReturnValue(sb.client);
    mocks.embedQuery.mockResolvedValue({ model: VOYAGE_4_MODEL, vector: [1, 0] });
    sb.client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: [chunk('ajuda')], error: null });
    expect((await retrieveContext('tenant-a', 'Como acessar?')).map(c => c.id)).toEqual(['ajuda']);
    expect(sb.client.rpc.mock.calls.map(([name]) => name)).toEqual(['kb_search_hybrid_v4', 'kb_search']);
    expect(sb.client.rpc.mock.calls.every(([, args]) => args.p_empresa_id === 'tenant-a')).toBe(true);
    sb.client.rpc.mockResolvedValue({ data: null, error: { message: 'banco indisponível' } });
    expect(await retrieveContext('tenant-a', 'Como acessar?')).toEqual([]);
  });

  it('sem embedding usa FTS; k zero e tenant ausente não consultam o banco', async () => {
    const sb = criarSupabaseMock(); mocks.admin.mockReturnValue(sb.client);
    mocks.embedQuery.mockResolvedValue(null);
    sb.client.rpc.mockResolvedValue({ data: [chunk('ajuda')], error: null });
    expect(await retrieveContext('tenant-a', 'Ajuda')).toHaveLength(1);
    expect(sb.client.rpc.mock.calls.map(([name]) => name)).toEqual(['kb_search']);
    sb.client.rpc.mockClear();
    expect(await retrieveContext('tenant-a', 'Ajuda', 0)).toEqual([]);
    await expect(retrieveContext('', 'Ajuda')).rejects.toThrow('empresaId obrigatório');
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });

  it('resolver ignora o vetor legado mesmo quando ele teria o melhor cosseno', async () => {
    mocks.embedQuery.mockResolvedValue({ model: VOYAGE_4_MODEL, vector: [1, 0] });
    const sb = criarSupabaseMock({ lista: tabela => {
      if (tabela === 'competencias_base') return [{ id: 'competencia' }];
      if (tabela !== 'modulos_base_conteudo') return [];
      return [
        { id: 'legado', descritor: 'Outro tema', titulo: 'Outro tema', descritor_embedding: [1, 0], auditoria_ia: { nota: 10 } },
        { id: 'novo', descritor: 'Ouvir com atenção', titulo: 'Ouvir com atenção', descritor_embedding_v4: [0.9, 0.1],
          descritor_embedding_v4_model: VOYAGE_4_MODEL, auditoria_ia: { nota: 9 } },
      ];
    } });
    const result = await resolverModuloBaseParaConteudo(sb.client, { competenciaNome: 'Comunicação', descritor: 'Escuta ativa', nivelMin: 1 });
    expect(result?.modulo.id).toBe('novo');
    expect(result?.criterio).toContain('semântico');
  });
});

describe('grounding — fragmentos de índice', () => {
  it.each(['N3\n\nCOMT01_MB34', 'Escuta ativa\n\nN4\n\nPRO01_MB01', 'Limites profissionais\n\nConsolidação\n\nPRO01_MB02',
    'Comunicação\n\nClareza, escuta e respeito\n\nManuscrito-base · Professor(a) · COMT01'])('remove metadados: %s', text => {
    expect(isMetadataOnlyChunk(text)).toBe(true);
  });
  it.each(['Abra o menu e escolha Tira-Dúvidas.', 'Rituais regulares e frequência: 1:1, dailies e retros',
    'O nível N3 é a meta; o código COMT01_MB34 identifica a referência.', 'Clique em iniciar para retomar sua jornada',
    'Limites profissionais\n\nN3\n\nCOMT01_MB34\n\nCombine horários de atendimento com a equipe.'])('preserva conteúdo curto: %s', text => {
    expect(isMetadataOnlyChunk(text)).toBe(false);
  });
});
