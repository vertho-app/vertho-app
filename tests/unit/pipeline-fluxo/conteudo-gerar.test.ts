import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const gerarIA = vi.fn();
const audioCore = vi.fn();
vi.mock('@/actions/conteudos', () => ({ gerarConteudoIA: (...a: any[]) => gerarIA(...a) }));
vi.mock('@/lib/conteudo-podcast-core', () => ({ gerarPodcastAudioCore: (...a: any[]) => audioCore(...a) }));

import { gerarConteudoDaBiblioteca } from '@/lib/pipeline-fluxo/conteudo-gerar';

const item = { competencia: 'Rotina', descritor: 'd1', cargo: 'CAIXA', formato: 'texto' as const };
const audio = { ...item, formato: 'audio' as const };
const sbCom = (mc: any) => criarSupabaseMock({ resolver: (t) => (t === 'micro_conteudos' ? mc : null) });

beforeEach(() => { gerarIA.mockReset(); audioCore.mockReset(); });

describe('gerarConteudoDaBiblioteca', () => {
  it('texto: gera com o cliente do job e o tenant; não toca no áudio', async () => {
    gerarIA.mockResolvedValue({ success: true, conteudoId: 'c1' });
    const sb = sbCom(null);
    expect(await gerarConteudoDaBiblioteca(sb.client, 'e1', item)).toEqual({ ok: true });
    expect(gerarIA).toHaveBeenCalledWith(expect.objectContaining({ formato: 'texto', competencia: 'Rotina', descritor: 'd1', cargo: 'CAIXA', empresaId: 'e1', sb: sb.client }));
    expect(audioCore).not.toHaveBeenCalled();
  });

  it('falha da geração volta como falha, com a causa', async () => {
    gerarIA.mockResolvedValue({ success: false, error: 'IA não retornou JSON' });
    expect(await gerarConteudoDaBiblioteca(sbCom(null).client, 'e1', item)).toEqual({ ok: false, erro: 'IA não retornou JSON' });
  });

  it('áudio: renderiza o MP3 (o podcast só fica ATIVO com o arquivo) e grava dentro do tenant', async () => {
    gerarIA.mockResolvedValue({ success: true, conteudoId: 'c1' });
    audioCore.mockImplementation(async (_sb: any, _mc: any, atualizar: any) => { await atualizar('c1', { url: 'u', ativo: true }); return { success: true }; });
    const sb = sbCom({ id: 'c1', formato: 'audio', empresa_id: 'e1', conteudo_inline: 'roteiro', url: null, ativo: false });
    expect(await gerarConteudoDaBiblioteca(sb.client, 'e1', audio)).toEqual({ ok: true });
    expect(audioCore).toHaveBeenCalledTimes(1);
    const upd = sb.escritas.find((e) => e.tabela === 'micro_conteudos' && e.op === 'update')!;
    expect(upd.payload).toEqual({ url: 'u', ativo: true });
    // a LEITURA do áudio e a ESCRITA do MP3 ficam, as duas, dentro do tenant
    const eqsEmpresa = sb.chamadas.filter((c) => c.tabela === 'micro_conteudos' && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === 'e1');
    expect(eqsEmpresa).toHaveLength(2);
  });

  it('áudio que JÁ existia sem MP3 (lote interrompido) é completado, não ignorado', async () => {
    gerarIA.mockResolvedValue({ success: true, skipped: true, conteudoId: 'c1' });
    audioCore.mockResolvedValue({ success: true });
    await gerarConteudoDaBiblioteca(sbCom({ id: 'c1', formato: 'audio', empresa_id: 'e1', url: null, ativo: false }).client, 'e1', audio);
    expect(audioCore).toHaveBeenCalledTimes(1);
  });

  it('áudio já publicado e ativo: nenhum TTS novo', async () => {
    gerarIA.mockResolvedValue({ success: true, skipped: true, conteudoId: 'c1' });
    expect(await gerarConteudoDaBiblioteca(sbCom({ id: 'c1', formato: 'audio', empresa_id: 'e1', url: 'u', ativo: true }).client, 'e1', audio)).toEqual({ ok: true });
    expect(audioCore).not.toHaveBeenCalled();
  });

  it('falha do TTS é falha da peça (o podcast inativo seria invisível à trilha)', async () => {
    gerarIA.mockResolvedValue({ success: true, conteudoId: 'c1' });
    audioCore.mockResolvedValue({ success: false, error: 'TTS reprovado' });
    expect(await gerarConteudoDaBiblioteca(sbCom({ id: 'c1', formato: 'audio', empresa_id: 'e1', url: null, ativo: false }).client, 'e1', audio)).toEqual({ ok: false, erro: 'TTS reprovado' });
  });

  it('erro ao ler o áudio para renderizar NÃO vira sucesso; áudio sem id idem', async () => {
    gerarIA.mockResolvedValue({ success: true, conteudoId: 'c1' });
    const sb = sbCom(null);
    sb.falharEm({ tabela: 'micro_conteudos', op: 'select', mensagem: 'rede' });
    expect((await gerarConteudoDaBiblioteca(sb.client, 'e1', audio)).erro).toMatch(/rede/);
    gerarIA.mockResolvedValue({ success: true });
    expect((await gerarConteudoDaBiblioteca(sbCom(null).client, 'e1', audio)).ok).toBe(false);
  });
});
