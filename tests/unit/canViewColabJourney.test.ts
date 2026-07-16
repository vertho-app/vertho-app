import { describe, it, expect } from 'vitest';
import { canViewColabJourney } from '@/lib/authz';

/**
 * Regra de posse da jornada, em UM lugar (as actions consomem daqui).
 * Dono, RH do mesmo tenant, gestor da mesma área, tutor do tutorado e platform
 * admin passam. Cross-tenant nunca — exceto platform admin.
 */
const ALVO = { id: 'colab-alvo', empresa_id: 'emp-A', area_depto: 'Pedagógico' };

const ctx = (over: any = {}) => ({
  colaborador: null, role: 'colaborador', empresaId: 'emp-A', isPlatformAdmin: false, platformAdminRole: null,
  ...over,
}) as any;

describe('canViewColabJourney', () => {
  it('o próprio colaborador vê a sua jornada', () => {
    expect(canViewColabJourney(ctx({ colaborador: { id: 'colab-alvo' } }), ALVO)).toBe(true);
  });

  it('platform admin vê qualquer um, inclusive de outro tenant', () => {
    expect(canViewColabJourney(ctx({ isPlatformAdmin: true, empresaId: null }), ALVO)).toBe(true);
  });

  it('RH do MESMO tenant vê', () => {
    expect(canViewColabJourney(ctx({ role: 'rh', colaborador: { id: 'rh-1' } }), ALVO)).toBe(true);
  });

  it('RH de OUTRO tenant NÃO vê', () => {
    expect(canViewColabJourney(ctx({ role: 'rh', empresaId: 'emp-B', colaborador: { id: 'rh-2' } }), ALVO)).toBe(false);
  });

  it('gestor da MESMA área vê o liderado', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-1', area_depto: 'Pedagógico' } });
    expect(canViewColabJourney(g, ALVO)).toBe(true);
  });

  it('gestor de OUTRA área NÃO vê', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-2', area_depto: 'Financeiro' } });
    expect(canViewColabJourney(g, ALVO)).toBe(false);
  });

  it('gestor da mesma área mas de OUTRO tenant NÃO vê', () => {
    const g = ctx({ role: 'gestor', empresaId: 'emp-B', colaborador: { id: 'g-3', area_depto: 'Pedagógico' } });
    expect(canViewColabJourney(g, ALVO)).toBe(false);
  });

  it('gestor sem área definida NÃO vê (área vazia não casa com todo mundo)', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-4', area_depto: null } });
    expect(canViewColabJourney(g, { ...ALVO, area_depto: null })).toBe(false);
  });

  it('tutor vê o tutorado, e só ele', () => {
    const t = ctx({ role: 'tutor', colaborador: { id: 't-1', tutorados_ids: ['colab-alvo'] } });
    expect(canViewColabJourney(t, ALVO)).toBe(true);
    const t2 = ctx({ role: 'tutor', colaborador: { id: 't-2', tutorados_ids: ['outro'] } });
    expect(canViewColabJourney(t2, ALVO)).toBe(false);
  });

  it('colega comum do mesmo tenant NÃO vê', () => {
    expect(canViewColabJourney(ctx({ colaborador: { id: 'colega' } }), ALVO)).toBe(false);
  });

  it('fail-closed: sem ctx, sem colab, ou colab sem tenant', () => {
    expect(canViewColabJourney(null, ALVO)).toBe(false);
    expect(canViewColabJourney(ctx({ role: 'rh' }), null)).toBe(false);
    expect(canViewColabJourney(ctx({ role: 'rh' }), { id: 'x', empresa_id: null })).toBe(false);
  });
});
