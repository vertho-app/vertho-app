// Ordem das checagens do convite de push (lib/notifications/estado-convite.ts).
//
// Existe por causa de um bug real de 05/08: checar suporte a PushManager antes
// de checar iOS-não-instalado fazia o componente renderizar NADA justamente para
// quem precisava da instrução de instalação — e matava o degrau do funil que
// mede a evasão na instalação, que é a única coisa que o spike existe para medir.
import { describe, expect, it } from 'vitest';
import { decidirEstadoConvite, type SinaisAmbiente } from '@/lib/notifications/estado-convite';

const base: SinaisAmbiente = {
  ehIOS: false,
  instalado: false,
  temPushManager: true,
  permissao: 'default',
  jaInscrito: false,
};

describe('decidirEstadoConvite', () => {
  // ── a invariante que o bug violou ──────────────────────────────────────────
  it('🔴 iOS sem instalar → precisa-instalar, MESMO sem PushManager', () => {
    // Este é literalmente o ambiente do Safari no iPhone: sem PushManager.
    // Se esta asserção quebrar, a instrução de instalação sumiu de novo.
    expect(decidirEstadoConvite({ ...base, ehIOS: true, instalado: false, temPushManager: false }))
      .toBe('precisa-instalar');
  });

  it('iOS instalado e com suporte → pode ativar', () => {
    expect(decidirEstadoConvite({ ...base, ehIOS: true, instalado: true, temPushManager: true }))
      .toBe('pode-ativar');
  });

  it('Android no Chrome (não instalado) → pode ativar, sem exigir instalação', () => {
    // O ritual de instalação é exclusividade do iOS; exigi-lo no Android
    // inventaria atrito onde não existe — e o Android é a maioria dos móveis.
    expect(decidirEstadoConvite({ ...base, ehIOS: false, instalado: false, temPushManager: true }))
      .toBe('pode-ativar');
  });

  it('sem PushManager fora do iOS → sem-suporte', () => {
    expect(decidirEstadoConvite({ ...base, temPushManager: false })).toBe('sem-suporte');
  });

  it('permissão negada → negado', () => {
    expect(decidirEstadoConvite({ ...base, permissao: 'denied' })).toBe('negado');
  });

  it('já inscrito → ativo', () => {
    expect(decidirEstadoConvite({ ...base, jaInscrito: true })).toBe('ativo');
  });

  it('negado tem precedência sobre já-inscrito (inscrição órfã não mente "ativo")', () => {
    expect(decidirEstadoConvite({ ...base, permissao: 'denied', jaInscrito: true })).toBe('negado');
  });
});
