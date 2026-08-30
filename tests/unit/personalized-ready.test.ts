import { describe, expect, it, vi } from 'vitest';
import { findReadyPersonalizedVideo, personalizedGreetingCopy } from '@/lib/video/personalized-ready';

function queryReturning(data: any, error: any = null) {
  const query: any = {};
  for (const method of ['select', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error }));
  return query;
}

describe('entrega do vídeo nominal já pronto', () => {
  it('troca o deck da célula pelo Bunny da saudação do colaborador', async () => {
    const cell = queryReturning({ id: 'cell-1' });
    const personalized = queryReturning({
      bunny_video_id: '3325bd10-e53b-4f22-a583-8eab05c07303',
      bunny_library: '636615',
    });
    const sb = {
      from: vi.fn((table: string) => table === 'videos_gerados' ? cell : personalized),
    };

    await expect(findReadyPersonalizedVideo(sb, {
      empresaId: 'empresa-1',
      colaboradorId: 'bruna-1',
      cargo: 'Representante Comercial',
      perfilDominante: 'CS',
      moduloBaseId: 'modulo-1',
    })).resolves.toEqual({
      bunnyVideoId: '3325bd10-e53b-4f22-a583-8eab05c07303',
      bunnyLibrary: '636615',
    });

    expect(sb.from).toHaveBeenCalledWith('videos_gerados');
    expect(sb.from).toHaveBeenCalledWith('videos_personalizados');
    expect(personalized.eq).toHaveBeenCalledWith('colaborador_id', 'bruna-1');
  });

  it('não consulta nem gera vídeo sem uma célula DISC válida', async () => {
    const sb = { from: vi.fn() };
    const result = await findReadyPersonalizedVideo(sb, {
      empresaId: 'empresa-1',
      colaboradorId: 'pessoa-1',
      cargo: 'Cargo',
      perfilDominante: '',
      moduloBaseId: 'modulo-1',
    });
    expect(result).toBeNull();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('explicita a saudação na capa e no leitor', () => {
    expect(personalizedGreetingCopy('Bruna Costa')).toEqual({
      title: 'Bruna, este vídeo é para você',
      description: 'Uma saudação pessoal para abrir o conteúdo da sua jornada de desenvolvimento.',
    });
  });
});
