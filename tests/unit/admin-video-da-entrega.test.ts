import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { videoDaEntrega, videoPermitido } from '@/lib/season-engine/formato-anunciado';

/**
 * A tela "o que foi entregue" do admin mostra o vídeo que a SEMANA DA PESSOA mostra (18/10/2026, 4Life).
 *
 * Ela ligava o vídeo sempre que a célula (módulo × cargo × DISC) tinha deck pronto. A Eduarda, com o vídeo em último
 * entre as preferências (kit novo, `por_preferencia`), aparecia com case + texto + vídeo e o alerta "deck genérico —
 * sem a saudação nominal", e ela não recebe vídeo nenhum: o overlay marca `video_permitido: false` e a semana o esconde.
 */

const DECK = { bunny_video_id: 'deck-1', bunny_library: '636615' };
const PERSO = { bunny_video_id: 'perso-1', bunny_library: '636615' };

describe('videoDaEntrega', () => {
  it('fora dos 2 formatos preferidos (kit novo): sem vídeo e sem alerta de saudação, mesmo com o deck pronto', () => {
    expect(videoDaEntrega({ video_permitido: false }, DECK, null)).toEqual({
      tem_video: false,
      video_fora_da_preferencia: true,
      video_personalizado: false,
      video_embed: null,
    });
  });

  it('kit anterior (sem a marca): o vídeo da célula, com a saudação quando existe', () => {
    const r = videoDaEntrega({}, DECK, PERSO);
    expect(r).toMatchObject({ tem_video: true, video_fora_da_preferencia: false, video_personalizado: true });
    expect(r.video_embed).toBe('https://iframe.mediadelivery.net/embed/636615/perso-1?autoplay=false&responsive=true');
  });

  it('vídeo permitido sem saudação: o deck genérico (é aí que o alerta da tela vale)', () => {
    const r = videoDaEntrega({ video_permitido: true }, DECK, null);
    expect(r).toMatchObject({ tem_video: true, video_personalizado: false });
    expect(r.video_embed).toContain('/deck-1?');
  });

  it('célula sem deck: sem vídeo, e não é por preferência', () => {
    expect(videoDaEntrega({ video_permitido: false }, null, null)).toMatchObject({ tem_video: false, video_fora_da_preferencia: false });
  });

  it('só `false` fecha a porta', () => {
    expect(videoPermitido({ video_permitido: false })).toBe(false);
    expect(videoPermitido({})).toBe(true);
    expect(videoPermitido(null)).toBe(true);
  });
});

describe('uma régua só: a tela do admin e a semana da pessoa', () => {
  const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

  it('a anotação do admin passa pela régua (não liga o vídeo só porque a célula tem deck)', () => {
    const fonte = ler('actions/temporadas.ts');
    const corpo = fonte.slice(fonte.indexOf('async function anotarOrigemDisc'), fonte.indexOf('export async function listarTemporadasEmpresa'));
    expect(corpo.length, 'anotarOrigemDisc não encontrada').toBeGreaterThan(0);
    expect(corpo).toContain('videoDaEntrega(e.conteudo, vid, perso)');
    expect(corpo).not.toMatch(/tem_video\s*=\s*!!vid/);
  });

  it('a semana da pessoa esconde o vídeo pela mesma marca', () => {
    expect(ler('app/dashboard/temporada/semana/[week]/page.tsx')).toContain("conteudo?.video_permitido !== false");
  });
});
