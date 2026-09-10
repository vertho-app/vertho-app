import { describe, it, expect } from 'vitest';
import { ELENCO } from '@/lib/tts/elenco';
import { perfilTutorial, chaveNarracao, clipAtual, sha256, validarClipsTutorial, type TutorialAudioManifest } from '../../video-spike/tutorial/narration-config';

const flow = { id: 'disc', steps: [{ id: 'abertura', narration: 'Como usar a plataforma.' }] };
const bytes = Buffer.from('arquivo aprovado');
function fixture(): TutorialAudioManifest {
  const profile = perfilTutorial(flow.id), text = flow.steps[0].narration;
  const qa = { ok: true, motivos: [], tentativas: 1, metricas: {} };
  return { schema: 3, flow: flow.id, profile, source: {
    schema: 3, flow: flow.id, profile, text, key: chaveNarracao(flow.id, 'continuous', text),
    audio: 'source.mp3', seconds: 10, sha256: sha256(bytes), qa, createdAt: '2026-09-10',
  }, clips: [{
    id: 'abertura', audio: 'tutorial/disc/audio/take.mp3', seconds: 10,
    key: chaveNarracao(flow.id, 'abertura', flow.steps[0].narration), sha256: sha256(bytes),
    sourceSha256: sha256(bytes), sourceStart: 0, sourceEnd: 10,
    qa: { ok: true, motivos: [], tentativas: 1, metricas: {} }, createdAt: '2026-09-10',
  }] };
}
describe('TTS de tutoriais: elenco atual e cache aprovado', () => {
  it('usa o Beto e sua direção no Vertex, não o default antigo do script', () => {
    const p = perfilTutorial('disc');
    expect(p.voice).toBe(ELENCO.beto.voz);
    expect(p.model).toBe(ELENCO.beto.modeloVertex);
    expect(p.style).toBe(ELENCO.beto.direcao);
    expect(p.backend).toBe('vertex');
  });
  it('reutiliza somente um take aprovado e íntegro', () => {
    const c = fixture().clips[0];
    expect(clipAtual(c, c.key, bytes)).toBe(true);
    expect(clipAtual(c, c.key, Buffer.from('arquivo alterado'))).toBe(false);
    expect(clipAtual({ ...c, qa: { ...c.qa, ok: false } }, c.key, bytes)).toBe(false);
  });
  it('texto, voz/modelo/direção e versão invalidam o áudio congelado', () => {
    const p = perfilTutorial('disc'), old = fixture().clips[0].key;
    expect(chaveNarracao('disc', 'abertura', 'Texto novo')).not.toBe(old);
    for (const field of ['voice', 'model', 'style', 'backend', 'versao'] as const) {
      expect(chaveNarracao('disc', 'abertura', flow.steps[0].narration, { ...p, [field]: 'mudou' })).not.toBe(old);
    }
  });
  it('não renderiza manifesto legado, incompleto ou com reprovação', () => {
    const m = fixture();
    expect(validarClipsTutorial(flow, m).size).toBe(1);
    expect(() => validarClipsTutorial(flow, { ...m, schema: 1 } as any)).toThrow(/legado/);
    expect(() => validarClipsTutorial(flow, { ...m, clips: [] })).toThrow(/ausente/);
    m.clips[0].qa.ok = false;
    expect(() => validarClipsTutorial(flow, m)).toThrow(/reprovada/);
  });
  it('não aceita etapas repetidas nem tutorial trocado', () => {
    const m = fixture();
    expect(() => validarClipsTutorial(flow, { ...m, clips: [...m.clips, ...m.clips] })).toThrow(/duplicadas/);
    expect(() => validarClipsTutorial(flow, { ...m, flow: 'pdi' })).toThrow(/outro tutorial/);
  });
  it('rejeita uma fatia sem vínculo com o take contínuo aprovado', () => {
    const m = fixture();
    m.clips[0].sourceSha256 = 'outra-fonte';
    expect(() => validarClipsTutorial(flow, m)).toThrow(/reprovada/);
    m.clips[0].sourceSha256 = m.source.sha256;
    m.source.qa.ok = false;
    expect(() => validarClipsTutorial(flow, m)).toThrow(/origem/);
  });
});
