import { describe, it, expect } from 'vitest';
import { VIDEOS_PUBLICOS, isVideoPublico } from '@/lib/videos-publicos';

// GUIDs dos tutoriais que vivem DENTRO do produto (Bunny library 636615).
// Eles falam de PDI/jornada/semana pra quem já está logado — se algum cair na
// allowlist, o gate de sessão do /v/{guid} abre sem ninguém perceber.
const TUTORIAIS_PRIVADOS = [
  '89812149-0c2e-4299-b1ba-3f27013aba25', // disc-app
  'a352dbdf-4515-45ba-8797-72f62798402c', // disc-ajuda
  '4d17fac6-2dda-4c34-8436-bfe4c7f32f62', // jornada
  'b8a4534e-326a-4ba4-b638-befc63294dda', // pdi
  '80f4da74-4384-419f-aab8-89ed346e7b5b', // semana de missão
];

const BOASVINDAS_UNIANCHIETA = '3bb52aa2-1d63-4507-9bb1-028e9e7565e1';

describe('allowlist de vídeos públicos', () => {
  it('libera o vídeo de boas-vindas (quem recebe ainda não tem acesso)', () => {
    expect(isVideoPublico(BOASVINDAS_UNIANCHIETA)).toBe(true);
  });

  it('é indiferente a maiúsculas no GUID', () => {
    expect(isVideoPublico(BOASVINDAS_UNIANCHIETA.toUpperCase())).toBe(true);
  });

  it('mantém os tutoriais de dentro do produto atrás do login', () => {
    for (const guid of TUTORIAIS_PRIVADOS) {
      expect(isVideoPublico(guid), `${guid} não pode ser público`).toBe(false);
    }
  });

  it('não libera GUID desconhecido nem entrada vazia', () => {
    expect(isVideoPublico('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isVideoPublico('')).toBe(false);
  });

  it('não herda chaves do Object.prototype', () => {
    // `id in obj` diria true pra 'constructor'/'toString' e abriria o gate
    // com uma string qualquer — por isso o lookup usa hasOwnProperty.
    expect(isVideoPublico('constructor')).toBe(false);
    expect(isVideoPublico('toString')).toBe(false);
  });

  it('cada entrada da allowlist tem um rótulo dizendo por que é pública', () => {
    for (const [guid, rotulo] of Object.entries(VIDEOS_PUBLICOS)) {
      expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(rotulo.trim().length, `${guid} sem rótulo`).toBeGreaterThan(3);
    }
  });
});
