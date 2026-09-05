/**
 * Portão de deriva (lib/tts/deriva.ts): o teste PLANTA o defeito e exige que a régua o
 * pegue (asserção de presença). "Estável passa" sozinho seria verde com uma régua que
 * não mede nada — foi o que a fixture canônica já escondeu neste projeto.
 */
import { describe, it, expect } from 'vitest';
import { medirDeriva, avaliarDeriva, ALVO_F0_POR_VOZ } from '@/lib/tts/deriva';

const SR = 24000;

/** "Voz" sintética: harmônicos de f0 com envelope de sílabas (4/s) e pausas curtas. */
function voz(opts: { segundos: number; f0: number; ganhoFinalDb?: number; pesos?: (t: number) => number[] }): Buffer {
  const n = Math.floor(opts.segundos * SR);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const silaba = 0.55 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * 4 * t)); // pulsos de energia
    const pausa = (t % 5) > 4.6 ? 0 : 1; // 0,4 s de pausa a cada 5 s
    const rampa = opts.ganhoFinalDb ? 10 ** ((opts.ganhoFinalDb * t / opts.segundos) / 20) : 1;
    const pesos = opts.pesos ? opts.pesos(t) : [1, 0.6, 0.4, 0.3, 0.2, 0.15];
    let s = 0;
    for (let h = 0; h < pesos.length; h++) s += pesos[h] * Math.sin(2 * Math.PI * opts.f0 * (h + 1) * t);
    const v = 0.25 * silaba * pausa * rampa * s / pesos.reduce((a, b) => a + b, 0);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), i * 2);
  }
  return buf;
}

describe('portão de deriva', () => {
  it('voz estável passa, e o F0 medido é o F0 sintetizado', () => {
    const m = medirDeriva(voz({ segundos: 65, f0: 208 }), SR);
    expect(m.janelas).toBeGreaterThanOrEqual(3);
    expect(Math.abs(12 * Math.log2(m.f0MedHz / 208))).toBeLessThan(0.5);
    const v = avaliarDeriva(m, ALVO_F0_POR_VOZ.Aoede);
    expect(v.motivos).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('PEGA a rampa de volume plantada (−9 dB ao longo de 65 s)', () => {
    const m = medirDeriva(voz({ segundos: 65, f0: 208, ganhoFinalDb: -9 }), SR);
    expect(m.loudSlopeDbMin).toBeLessThan(-0.8);
    const v = avaliarDeriva(m, ALVO_F0_POR_VOZ.Aoede);
    expect(v.ok).toBe(false);
    expect(v.motivos.join(' ')).toMatch(/volume/);
  });

  it('PEGA o registro fora do alvo da voz (208 Hz numa voz cujo alvo é 144 Hz)', () => {
    const m = medirDeriva(voz({ segundos: 45, f0: 208 }), SR);
    const v = avaliarDeriva(m, ALVO_F0_POR_VOZ.Iapetus);
    expect(v.ok).toBe(false);
    expect(v.motivos.join(' ')).toMatch(/registro/);
    // e a MESMA medição passa no alvo certo
    expect(avaliarDeriva(m, ALVO_F0_POR_VOZ.Aoede).ok).toBe(true);
  });

  it('PEGA a troca de timbre plantada (espectro muda na 2ª metade, F0 e volume iguais)', () => {
    const claro = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
    const escuro = [1, 0.15, 0.05, 0.02, 0, 0, 0, 0];
    const m = medirDeriva(voz({ segundos: 85, f0: 144, pesos: (t) => (t < 42 ? claro : escuro) }), SR);
    expect(m.timbreMaxVs1a).toBeGreaterThan(0.35);
    const v = avaliarDeriva(m, ALVO_F0_POR_VOZ.Iapetus);
    expect(v.motivos.join(' ')).toMatch(/timbre/);
  });

  it('áudio curto (1 janela) só é julgado pelo registro', () => {
    const m = medirDeriva(voz({ segundos: 12, f0: 144, ganhoFinalDb: -9 }), SR);
    expect(avaliarDeriva(m, ALVO_F0_POR_VOZ.Iapetus).ok).toBe(true);
    expect(avaliarDeriva(m, null).ok).toBe(true);
  });
});
