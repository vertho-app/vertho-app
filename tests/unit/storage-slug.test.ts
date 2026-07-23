import { describe, expect, it } from 'vitest';
import { storageSlug } from '@/lib/storage-slug';

describe('storageSlug (key de storage sempre ASCII)', () => {
  it('remove acentos (caso real: Corrêa)', () => {
    expect(storageSlug('Daniela Oliveira dos Santos Corrêa')).toBe('daniela-oliveira-dos-santos-correa');
  });

  it('remove acentos variados (caso real: Elizângela)', () => {
    expect(storageSlug('Elizângela')).toBe('elizangela');
  });

  it('qualquer não-alfanumérico vira hífen', () => {
    expect(storageSlug('Diretor(a) Escolar — Manhã/Tarde')).toBe('diretor-a-escolar-manhã-tarde'.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  });

  it('faz trim de hífens e colapsa repetições', () => {
    expect(storageSlug('  --João   da  Silva-- ')).toBe('joao-da-silva');
  });

  it('saída é sempre ASCII imprimível', () => {
    for (const n of ['À ñ õ Ç ü ÿ', '日本語', '***']) {
      const s = storageSlug(n, 'x');
      expect(s).toMatch(/^[\x21-\x7E]+$/);
    }
  });

  it('vazio/nulo cai no fallback', () => {
    expect(storageSlug('')).toBe('arquivo');
    expect(storageSlug(null)).toBe('arquivo');
    expect(storageSlug(undefined)).toBe('arquivo');
    expect(storageSlug('!!!', 'relatorio')).toBe('relatorio');
  });
});
