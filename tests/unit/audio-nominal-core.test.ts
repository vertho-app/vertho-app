import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const gerar = vi.fn(async (_t: string, _n: string, _l: any, _o: any) => ({ buffer: Buffer.from('mp3'), contentType: 'audio/mpeg' }));
vi.mock('@/lib/gemini-tts', () => ({
  extractNarration: (s: string) => String(s || '').trim(),
  generatePersonalizedPodcastAudio: (...a: any[]) => (gerar as any)(...a),
}));

import { prepararAudioNominalCore, caminhoAudioNominal } from '@/lib/conteudo-audio-personalizado-core';

/**
 * O áudio nominal do podcast ("Olá, {nome}") era gerado só na 1ª audição (~2 min, US$ 0,06). O Kit passa a pré-gerá-lo;
 * este núcleo é o que faz isso sem sessão. O que precisa valer: cache por pessoa, nome do BANCO, tenant fechado.
 */
const EMP = 'emp-1';
const conteudo = { id: 'c1', formato: 'audio', empresa_id: EMP, conteudo_inline: 'Roteiro do podcast com mais de vinte caracteres' };
const colab = { nome_completo: 'Rodrigo Naves', empresa_id: EMP };
const montar = (over: Record<string, any> = {}) => criarSupabaseMock({
  resolver: (t) => (t === 'micro_conteudos' ? (over.conteudo === undefined ? conteudo : over.conteudo) : t === 'colaboradores' ? (over.colab === undefined ? colab : over.colab) : null),
});

beforeEach(() => gerar.mockClear());

describe('prepararAudioNominalCore', () => {
  it('gera e grava no caminho que a rota do podcast lê; o NOME vem do banco', async () => {
    const sb = montar();
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: true });
    expect(gerar.mock.calls[0][1]).toBe('Rodrigo Naves');
    expect(gerar.mock.calls[0][2]).toMatchObject({ feature: 'tts_podcast_personalizado', empresaId: EMP, colaboradorId: 'p1' });
    const up = sb.client.storage.from('conteudos').upload;
    expect(up).toBeDefined();
    expect(caminhoAudioNominal('c1', 'p1')).toBe('final/audio-personalizado/c1/p1.mp3');
  });

  it('sanitiza o caminho (a rota usa o mesmo)', () => {
    expect(caminhoAudioNominal('a/b', 'c d')).toBe('final/audio-personalizado/a_b/c_d.mp3');
  });

  it('já em cache: NÃO gasta TTS', async () => {
    const sb = montar();
    sb.client.storage.from = () => ({ download: vi.fn(async () => ({ data: new Blob(['x']), error: null })), upload: vi.fn() });
    const r = await prepararAudioNominalCore(sb.client, { empresaId: EMP, contentId: 'c1', colaboradorId: 'p1' });
    expect(r).toEqual({ success: true, cached: true });
    expect(gerar).not.toHaveBeenCalled();
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
