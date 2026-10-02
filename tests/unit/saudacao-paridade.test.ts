import { describe, it, expect } from 'vitest';
// @ts-ignore .mjs puro do worker da Hetzner
import { videoNoTopDois as noWorker, destinatariosDaSaudacao, COLUNAS_PREFERENCIA } from '../../worker-hetzner/saudacao.mjs';
import { videoNoTopDois as noApp, topDoisFormatos } from '@/lib/season-engine/kit/formatos-por-preferencia';
import { COLUNAS_PREFERENCIA_KIT } from '@/lib/season-engine/kit/formatos-por-preferencia';

/**
 * Quem recebe a saudação nominal numa célula de kit por preferência é decidido em DOIS lugares que não compartilham código:
 * o worker da Hetzner (.mjs puro, sem o TypeScript do app) e o app (reconciliação e Trigger). Divergir significa que o
 * render saudaria uma pessoa e a reconciliação decidiria o contrário, devolvendo a célula à fila para sempre.
 * Prova: TODAS as combinações de valores (0 a 7) das 5 colunas de preferência.
 */
describe('regra da saudação: worker e app dizem o mesmo', () => {
  it('as colunas lidas são as mesmas nos dois lados', () => {
    expect([...COLUNAS_PREFERENCIA].sort()).toEqual(COLUNAS_PREFERENCIA_KIT.split(', ').sort());
  });

  it('paridade em 8^5 = 32.768 combinações de preferência', () => {
    const v = [0, 1, 2, 3, 4, 5, 6, 7];
    let n = 0;
    for (const a of v) for (const b of v) for (const c of v) for (const d of v) for (const e of v) {
      const colab = { pref_video_curto: a, pref_video_longo: b, pref_texto: c, pref_audio: d, pref_estudo_caso: e };
      if (noWorker(colab) !== noApp(colab)) throw new Error(`diverge em ${JSON.stringify(colab)}: worker=${noWorker(colab)} app=${noApp(colab)}`);
      n++;
    }
    expect(n).toBe(32768);
  });

  it('casos de borda: sem preferência não tem vídeo; vídeo longo antigo conta; empate vai para o vídeo', () => {
    expect(noWorker({})).toBe(false);
    expect(noWorker({ pref_video_longo: 5, pref_texto: 3 })).toBe(true);
    expect(noWorker({ pref_video_curto: 4, pref_texto: 4, pref_audio: 4, pref_estudo_caso: 4 })).toBe(true);
    expect(noWorker({ pref_texto: 7, pref_estudo_caso: 6, pref_audio: 5, pref_video_curto: 4 })).toBe(false);
    expect(topDoisFormatos({ pref_video_curto: 6, pref_audio: 7 })).toEqual(['audio', 'video']);
  });

  it('destinatariosDaSaudacao: todos sem a marca; só quem tem vídeo no top 2 com a marca', () => {
    const q = { id: 'q', pref_video_curto: 7, pref_texto: 6 };
    const n = { id: 'n', pref_texto: 7, pref_estudo_caso: 6 };
    expect(destinatariosDaSaudacao([q, n], false).map((x: any) => x.id)).toEqual(['q', 'n']);
    expect(destinatariosDaSaudacao([q, n], true).map((x: any) => x.id)).toEqual(['q']);
  });
});

/**
 * Os dois executores de personalização (worker da Hetzner e task do Trigger) rodam fora do vitest. Aqui só se trava que
 * eles CONSULTAM a regra e a marca do kit: a regra existir num arquivo que ninguém chama é config sem consumidor.
 */
import { readFileSync } from 'node:fs';
describe('quem personaliza consome a regra', () => {
  const worker = readFileSync('worker-hetzner/worker.mjs', 'utf-8');
  const trigger = readFileSync('trigger/render-video.ts', 'utf-8');
  it.each([['worker da Hetzner', worker], ['task do Trigger', trigger]])('%s lê a marca do kit e filtra os destinatários', (_n, fonte) => {
    expect(fonte).toContain("destinatariosDaSaudacao(");
    expect(fonte).toMatch(/por_preferencia/);
    expect(fonte).toContain('kit_id');
    expect(fonte).toContain('COLUNAS_PREFERENCIA');
  });
});
