/**
 * Fase 4 do plano de deriva (06/09/2026): veredito persistido → regras R18 (taxa de
 * retake) e R19 (canário semanal), e a assinatura de timbre que mede identidade da
 * locutora entre takes e modelos. Cada caso planta a condição e exige o achado (ou
 * exige silêncio onde silêncio é o correto: amostra pequena, semana sem geração).
 */
import { describe, it, expect } from 'vitest';
import { checarTaxaRetakeTts, checarCanarioTts, TTS_RETAKE_AMOSTRA_MINIMA, TTS_CANARIO_TIMBRE_MAX, type RetakeTtsAgregado, type CanarioObservado } from '@/lib/pipeline-health/regras';
import { assinaturaTimbre, distanciaTimbre, combinarAssinaturas, medirDeriva } from '@/lib/tts/deriva';

const SR = 24000;
/** "Voz" sintética: harmônicos de f0 com pesos dados (o timbre é o perfil de pesos). */
function voz(segundos: number, f0: number, pesos: number[]): Buffer {
  const n = Math.floor(segundos * SR), buf = Buffer.alloc(n * 2);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR; fase += 2 * Math.PI * f0 / SR;
    const silaba = 0.55 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * 4 * t));
    const pausa = (t % 5) > 4.6 ? 0 : 1;
    let s = 0; for (let h = 0; h < pesos.length; h++) s += pesos[h] * Math.sin(fase * (h + 1));
    const v = 0.25 * silaba * pausa * s / pesos.reduce((a, b) => a + b, 0);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), i * 2);
  }
  return buf;
}
const agregado = (p: Partial<RetakeTtsAgregado>): RetakeTtsAgregado => ({ feature: 'tts_podcast', voz: 'Aoede', sinteses: 10, tentativas: 11, reprovadas: 1, publicadasReprovadas: 0, ...p });
const canario = (p: Partial<CanarioObservado>): CanarioObservado => ({ voz: 'Aoede', em: '2026-09-06T06:20:00Z', ok: true, motivos: [], f0MedHz: 210, timbreVsRef: 0.12, ...p });

describe('R18 · taxa de retake do portão', () => {
  it('semana normal (7 % de retake, nada publicado reprovado) NÃO é achado', () => {
    expect(checarTaxaRetakeTts([agregado({ sinteses: 14, tentativas: 15, reprovadas: 1 })])).toBeNull();
  });
  it('taxa alta com amostra pequena NÃO é achado (não sustenta conclusão)', () => {
    expect(checarTaxaRetakeTts([agregado({ sinteses: TTS_RETAKE_AMOSTRA_MINIMA - 1, tentativas: 8, reprovadas: 5 })])).toBeNull();
  });
  it('taxa acima de 40 % com amostra suficiente vira AVISO, com a linha na amostra', () => {
    const a = checarTaxaRetakeTts([agregado({ sinteses: 10, tentativas: 20, reprovadas: 10 })])!;
    expect(a).not.toBeNull();
    expect(a.severidade).toBe('aviso');
    expect(a.amostra?.[0]).toContain('Aoede');
  });
  it('áudio reprovado PUBLICADO é achado mesmo com taxa baixa; 5 ou mais vira CRÍTICO', () => {
    const um = checarTaxaRetakeTts([agregado({ publicadasReprovadas: 1, reprovadas: 2, tentativas: 12 })])!;
    expect(um.severidade).toBe('aviso');
    expect(um.amostra?.[0]).toContain('REPROVADA');
    const cinco = checarTaxaRetakeTts([agregado({ publicadasReprovadas: 5, reprovadas: 6, tentativas: 16 })])!;
    expect(cinco.severidade).toBe('critico');
  });
});

describe('R19 · canário semanal', () => {
  it('canário ok e perto da assinatura em todas as vozes → nada', () => {
    expect(checarCanarioTts([canario({}), canario({ voz: 'Iapetus', f0MedHz: 145 })], ['Aoede', 'Iapetus'])).toBeNull();
  });
  it('voz sem canário na janela → AVISO (o cron não rodou)', () => {
    const a = checarCanarioTts([canario({})], ['Aoede', 'Iapetus'])!;
    expect(a.severidade).toBe('aviso');
    expect(a.amostra?.[0]).toContain('Iapetus');
  });
  it('canário reprovado ou longe da assinatura → CRÍTICO (a voz mudou por baixo)', () => {
    const rep = checarCanarioTts([canario({ ok: false, motivos: ['registro +2.3 st do alvo'] })], ['Aoede'])!;
    expect(rep.severidade).toBe('critico');
    expect(rep.amostra?.[0]).toContain('REPROVA');
    const longe = checarCanarioTts([canario({ timbreVsRef: TTS_CANARIO_TIMBRE_MAX + 0.2 })], ['Aoede'])!;
    expect(longe.severidade).toBe('critico');
    expect(longe.amostra?.[0]).toContain('assinatura');
  });
  it('usa a linha MAIS RECENTE da voz, não a primeira', () => {
    const velhaRuim = canario({ em: '2026-09-01T06:20:00Z', ok: false, motivos: ['x'] });
    const novaBoa = canario({ em: '2026-09-06T06:20:00Z' });
    expect(checarCanarioTts([velhaRuim, novaBoa], ['Aoede'])).toBeNull();
  });
});

describe('assinatura de timbre: identidade da locutora', () => {
  const clara = [1, 0.6, 0.4, 0.3, 0.2, 0.15];
  const escura = [1, 0.2, 0.05, 0.02, 0.01, 0.005];
  it('o mesmo timbre fica perto da própria assinatura e um timbre diferente fica longe', () => {
    // A referência combina takes em vários registros (como os 12 takes reais): é o
    // σ deles que dá a escala. `Medido` no sintético: mesma voz 0,21σ, outro timbre 3,7σ.
    const ref = combinarAssinaturas([200, 205, 210, 215].map((f) => assinaturaTimbre(voz(20, f, clara), SR)!));
    const mesma = distanciaTimbre(ref, assinaturaTimbre(voz(20, 208, clara), SR)!.media);
    const outra = distanciaTimbre(ref, assinaturaTimbre(voz(20, 208, escura), SR)!.media);
    expect(mesma).toBeLessThan(TTS_CANARIO_TIMBRE_MAX);
    expect(outra).toBeGreaterThan(mesma * 3);
  });
  it('medirDeriva com referência preenche timbreVsRefSigma; sem referência, não', () => {
    const ref = combinarAssinaturas([200, 205, 210, 215].map((f) => assinaturaTimbre(voz(20, f, clara), SR)!));
    const com = medirDeriva(voz(25, 208, clara), SR, ref);
    expect(com.timbreVsRefSigma).toBeDefined();
    expect(com.timbreVsRefSigma!).toBeLessThan(medirDeriva(voz(25, 208, escura), SR, ref).timbreVsRefSigma!);
    expect(medirDeriva(voz(25, 208, clara), SR).timbreVsRefSigma).toBeUndefined();
  });
});
