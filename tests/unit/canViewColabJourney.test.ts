import { describe, it, expect } from 'vitest';
import { canViewColabJourney } from '@/lib/authz';

/**
 * Regra de posse da jornada, em UM lugar (as actions consomem daqui).
 * Dono, RH do mesmo tenant, **gestor DELE** (`gestor_email`), tutor do tutorado
 * e platform admin passam. Cross-tenant nunca — exceto platform admin.
 *
 * ⚠️ A régua do gestor era `area_depto` até 10/08/2026 (F4). Medido em produção:
 * dos 295 pares gestor→liderado, **3 passavam — os 3 do `acme-demo`**, o tenant
 * de demonstração. Macaé 0/280. E não era dado faltando: lá os gestores com
 * `area_depto` têm "Vertho" e os liderados têm NULL.
 */
const ALVO = { id: 'colab-alvo', empresa_id: 'emp-A', area_depto: 'Pedagógico', gestor_email: 'chefe@x.com' };

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

  it('o gestor DELE vê — e a área não entra na conta', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-1', email: 'chefe@x.com', area_depto: 'Financeiro' } });
    expect(canViewColabJourney(g, ALVO)).toBe(true);
  });

  it('e-mail case/espaço não muda a resposta (igualdade em código, nunca ilike)', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-1', email: '  CHEFE@X.com ' } });
    expect(canViewColabJourney(g, ALVO)).toBe(true);
  });

  it('outro gestor do mesmo tenant NÃO vê', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-2', email: 'outro.chefe@x.com' } });
    expect(canViewColabJourney(g, ALVO)).toBe(false);
  });

  it('o gestor dele, mas de OUTRO tenant, NÃO vê', () => {
    const g = ctx({ role: 'gestor', empresaId: 'emp-B', colaborador: { id: 'g-3', email: 'chefe@x.com' } });
    expect(canViewColabJourney(g, ALVO)).toBe(false);
  });

  it('liderado sem gestor definido: ninguém passa por essa via', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-4', email: 'chefe@x.com' } });
    expect(canViewColabJourney(g, { ...ALVO, gestor_email: null })).toBe(false);
    expect(canViewColabJourney(g, { ...ALVO, gestor_email: '' })).toBe(false);
  });

  it('coluna AUSENTE no select nega — e avisa, para não virar tela vazia sem erro', () => {
    const g = ctx({ role: 'gestor', colaborador: { id: 'g-5', email: 'chefe@x.com' } });
    const avisos: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => { avisos.push(String(m)); };
    try {
      // `{ gestor_email }` fora do objeto = call-site que esqueceu a coluna
      expect(canViewColabJourney(g, { id: 'colab-alvo', empresa_id: 'emp-A' })).toBe(false);
    } finally { console.warn = orig; }
    expect(avisos.join(' ')).toMatch(/gestor_email/);
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
