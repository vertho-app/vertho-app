import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argsDoCrossfade } from '../../../worker-hetzner/personalizar.mjs';

/**
 * O nominal é a saudação (Remotion) emendada no deck por `xfade`, que exige os dois lados iguais. `Medido 18/10/2026`: o
 * deck do formato novo sai do ffmpeg (yuv420p, base de tempo 1/15360) e a saudação do Remotion (yuvj420p, 1/90000), e os 5
 * nominais do piloto da 4Life falharam com "First input link main timebase (1/90000) do not match ... (1/15360)".
 */
describe('crossfade saudação → deck', () => {
  const base = { saudacao: 'g.mp4', deck: 'd.mp4', saida: 'o.mp4', T: 0.3, offset: '1.20', fps: 30, largura: 320, altura: 180 };

  it('normaliza os DOIS lados (tamanho, quadros, pixel, base de tempo e áudio) antes de juntar', () => {
    const a = argsDoCrossfade(base);
    const filtro = a[a.indexOf('-filter_complex') + 1];
    for (const pedaco of ['scale=320:180', 'fps=30', 'format=yuv420p', 'settb=AVTB', 'aresample=48000']) {
      expect(filtro.split(pedaco).length - 1, pedaco).toBe(2);
    }
    expect(filtro).toContain('[gv][dv]xfade=transition=fade:duration=0.3:offset=1.20[v]');
    expect(filtro).toContain('[ga][da]acrossfade=d=0.3[a]');
    expect(a.at(-1)).toBe('o.mp4');
  });

  const temFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  it.skipIf(!temFfmpeg)('de verdade: saudação do Remotion (yuvj420p, 1/90000) + deck emendado (yuv420p, 1/15360) sai inteiro', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xfade-'));
    const clipe = (nome: string, src: string, seg: number, pix: string, escala: string) => {
      const f = path.join(dir, nome);
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `${src}=size=320x180:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-t', String(seg), '-c:v', 'libx264', '-pix_fmt', pix, '-video_track_timescale', escala, '-c:a', 'aac', '-ac', '2', '-shortest', f], { stdio: 'ignore' });
      return f;
    };
    try {
      const saudacao = clipe('g.mp4', 'testsrc', 1.5, 'yuvj420p', '90000');
      const deck = clipe('d.mp4', 'testsrc2', 2, 'yuv420p', '15360');
      const saida = path.join(dir, 'o.mp4');
      execFileSync('ffmpeg', argsDoCrossfade({ ...base, saudacao, deck, saida }), { stdio: 'ignore' });
      const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', saida]).toString().trim());
      expect(dur).toBeGreaterThan(3.1); // 1,5 + 2 − 0,3 de sobreposição
      expect(dur).toBeLessThan(3.4);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
