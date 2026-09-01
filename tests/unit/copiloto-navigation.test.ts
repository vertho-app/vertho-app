import { describe, expect, it } from 'vitest';
import { resolveCopilotHomeHref } from '@/lib/copiloto/navigation';

describe('resolveCopilotHomeHref', () => {
  it('retorna o admin híbrido ao painel administrativo', () => {
    expect(resolveCopilotHomeHref('representative', true)).toBe('/admin/dashboard');
  });

  it('mantém o representante sem acesso admin no portal comercial', () => {
    expect(resolveCopilotHomeHref('representative', false)).toBe('/representante');
  });

  it('mantém o admin sem cadastro de representante no painel administrativo', () => {
    expect(resolveCopilotHomeHref('admin', true)).toBe('/admin/dashboard');
  });
});
