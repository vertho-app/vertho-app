import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { criarStorageFalso } from '../helpers/storage-falso';

const gerar = vi.fn(async (_t: string, _n: string, _l: any, _o: any) => ({ buffer: Buffer.from('mp3'), contentType: 'audio/mpeg' }));
vi.mock('@/lib/gemini-tts', () => ({
  extractNarration: (s: string) => String(s || '').trim(),
  generatePersonalizedPodcastAudio: (...a: any[]) => (gerar as any)(...a),
}));

import { prepararAudioNominalCore } from '@/lib/conteudo-audio-personalizado-core';

/**
 * O áudio nominal do podcast ("Olá, {nome}") era gerado só na 1ª audição (~2 min, US$ 0,06). O Kit passa a pré-gerá-lo;
 * este núcleo é o que faz isso sem sessão. O que precisa valer: cache por pessoa, nome do BANCO, tenant fechado.
 */
const EMP = 'emp-1';
const conteudo = { id: 'c1', formato: 'audio', empresa_id: EMP, conteudo_inline: 'Roteiro do podcast com mais de vinte caracteres' };
const colab = { nome_completo: 'Rodrigo Naves', empresa_id: EMP };
const PRIVADO = 'relatorios-pdf';
const CAMINHO_PRIVADO = `${EMP}/audio-personalizado/c1/p1.mp3`;
const CAMINHO_LEGADO = 'final/audio-personalizado/c1/p1.mp3';
let st = criarStorageFalso();
/** O storage do mock é o falso COM ESTADO: sabe o que existe em cada bucket, por caminho. */
const montar = (over: Record<string, any> = {}) => {
  const sb = criarSupabaseMock({
    resolver: (t) => (t === 'micro_conteudos' ? (over.conteudo === undefined ? conteudo : over.conteudo) : t === 'colaboradores' ? (over.colab === undefined ? colab : over.colab) : null),
  });
  (sb.client as any).storage = st.storage;
  return sb;
};

beforeEach(() => {
  gerar.mockClear();
  st = criarStorageFalso();
});

describe('prepararAudioNominalCore', () => {
  it('gera e grava no bucket PRIVADO, na pasta da empresa da pessoa; o NOME vem do banco', async () => {
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: true });
    expect(gerar.mock.calls[0][1]).toBe('Rodrigo Naves');
    expect(gerar.mock.calls[0][2]).toMatchObject({ feature: 'tts_podcast_personalizado', empresaId: EMP, colaboradorId: 'p1' });
    const uploads = st.chamadas.filter((c) => c.metodo === 'upload');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe(PRIVADO);
    expect(uploads[0].args[0]).toBe(CAMINHO_PRIVADO);
  });

  it('o áudio com o nome da pessoa NUNCA volta ao bucket público `conteudos` (R-74)', async () => {
    // O Kit chama este núcleo em lote: um escritor aqui recriaria, a cada pré-geração, o vazamento que a migração 274 e o
    // lote do podcast fecharam. Nenhuma gravação nem leitura de cache vai ao bucket público.
    const sb = montar();
    await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(st.chamadas.filter((c) => c.metodo === 'upload' && c.bucket === 'conteudos')).toEqual([]);
  });

  it('já em cache no bucket privado: NÃO gasta TTS', async () => {
    st = criarStorageFalso({ [PRIVADO]: [CAMINHO_PRIVADO] });
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: true, cached: true });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('o cache do formato antigo (bucket público, ainda não migrado) também conta: não paga TTS de novo', async () => {
    st = criarStorageFalso({ conteudos: [CAMINHO_LEGADO] });
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: true, cached: true });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('Storage fora do ar NÃO é "sem cache": não gera nem paga TTS às cegas', async () => {
    st.falhar(PRIVADO, 'createSignedUrl', 'connection reset');
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/cache do áudio indisponível/);
    expect(gerar).not.toHaveBeenCalled();
  });

  it('falha no upload volta como erro, não como sucesso', async () => {
    st.falhar(PRIVADO, 'upload', 'sem espaço');
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: false, error: 'sem espaço' });
  });

  it('o conteúdo e o colaborador são lidos DENTRO do tenant pedido (nunca o nome de um tenant num áudio de outro)', async () => {
    const sb = montar();
    await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    for (const tabela of ['micro_conteudos', 'colaboradores']) {
      expect(sb.chamadas.some((c) => c.tabela === tabela && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === EMP), tabela).toBe(true);
    }
  });

  it.each([
    ['conteúdo que não é áudio', { conteudo: { ...conteudo, formato: 'texto' } }, /não é áudio/],
    ['conteúdo de outro tenant (a leitura não casa)', { conteudo: null }, /não é áudio/],
    ['colaborador sem nome ou de outro tenant', { colab: null }, /sem nome/],
    ['narração curta', { conteudo: { ...conteudo, conteudo_inline: 'curto' } }, /narração curta/],
  ])('recusa: %s', async (_n, over, msg) => {
    const r = await prepararAudioNominalCore(montar(over).client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(msg);
    expect(gerar).not.toHaveBeenCalled();
  });

  it('erro de leitura volta como erro (não vira "sem nome")', async () => {
    const sb = montar();
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'rede' });
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r.error).toMatch(/leitura do colaborador: rede/);
  });

  it('parâmetros obrigatórios ausentes recusam sem tocar no banco', async () => {
    const sb = montar();
    expect((await prepararAudioNominalCore(sb.client, { empresaId: '', contentId: 'c1', colaboradorId: 'p1' })).success).toBe(false);
    expect(sb.chamadas).toHaveLength(0);
  });
});
