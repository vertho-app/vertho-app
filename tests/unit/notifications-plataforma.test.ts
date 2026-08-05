// Classificação de plataforma (lib/notifications/plataforma.ts).
//
// Importa porque o funil de adesão é lido SEGMENTADO por plataforma: iOS exige
// instalar o PWA antes de poder pedir permissão, Android não. Misturar os dois
// esconde as duas realidades numa média que não descreve ninguém.
import { describe, expect, it } from 'vitest';
import { detectarPlataforma } from '@/lib/notifications/plataforma';

describe('detectarPlataforma', () => {
  it('iPhone → ios', () => {
    expect(detectarPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
  });

  it('iPad clássico → ios', () => {
    expect(detectarPlataforma('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
  });

  it('iPadOS 13+ se disfarça de Macintosh — o "Mobile" denuncia', () => {
    // Sem esta regra o iPad cairia em 'web' e o funil de iOS mostraria menos
    // gente do que de fato tentou instalar.
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(detectarPlataforma(ua)).toBe('ios');
  });

  it('Mac de verdade (sem Mobile) → web, não ios', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
    expect(detectarPlataforma(ua)).toBe('web');
  });

  it('Android → android', () => {
    expect(detectarPlataforma('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('android');
  });

  it('desktop Windows → web', () => {
    expect(detectarPlataforma('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36')).toBe('web');
  });

  it('ausente/vazio → web (nunca lança)', () => {
    expect(detectarPlataforma('')).toBe('web');
    expect(detectarPlataforma(null)).toBe('web');
    expect(detectarPlataforma(undefined)).toBe('web');
  });
});
