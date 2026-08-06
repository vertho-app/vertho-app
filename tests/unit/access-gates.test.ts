import { describe, expect, it } from 'vitest';
import { canAccessPerfilComportamental, canAccessMapeamentoCenarios } from '@/lib/access-gates';

describe('access-gates: perfil comportamental (fail-open)', () => {
  it('libera por padrão (config vazia)', () => {
    expect(canAccessPerfilComportamental({}).allowed).toBe(true);
    expect(canAccessPerfilComportamental(null).allowed).toBe(true);
    expect(canAccessPerfilComportamental(undefined).allowed).toBe(true);
  });

  it('bloqueia explícito com diagnóstico', () => {
    const r = canAccessPerfilComportamental({ perfil_comportamental_liberado: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('PERFIL_BLOQUEADO');
    expect(r.remediation).toBeTruthy();
  });

  it('bloqueia durante votação aberta sem liberação explícita', () => {
    const r = canAccessPerfilComportamental({ votacao_ativa: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('VOTACAO_ATIVA');
  });

  it('votação aberta + liberação explícita = liberado', () => {
    expect(canAccessPerfilComportamental({ votacao_ativa: true, perfil_comportamental_liberado: true }).allowed).toBe(true);
  });
});

describe('access-gates: mapeamento de cenários (fail-closed)', () => {
  it('bloqueia quando a flag está AUSENTE — mas agora COM diagnóstico (o bug)', () => {
    const r = canAccessMapeamentoCenarios({});
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('CENARIOS_BLOQUEADOS');
    expect(r.remediation).toMatch(/mapeamento_cenarios_liberado/);
  });

  it('libera com flag explícita (perfil ok por padrão)', () => {
    expect(canAccessMapeamentoCenarios({ mapeamento_cenarios_liberado: true }).allowed).toBe(true);
  });

  it('propaga o motivo do perfil quando o perfil é o pré-requisito que falta', () => {
    const r = canAccessMapeamentoCenarios({ perfil_comportamental_liberado: false, mapeamento_cenarios_liberado: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('PERFIL_BLOQUEADO');
  });

  it('votação aberta bloqueia cenários mesmo com a flag de cenários ligada', () => {
    const r = canAccessMapeamentoCenarios({ votacao_ativa: true, mapeamento_cenarios_liberado: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('VOTACAO_ATIVA');
  });
});

// Empresa com fonte externa de perfil (OPQ32/Hogan) não faz o DISC nativo: o
// perfil fica bloqueado PARA SEMPRE. Se ele fosse pré-requisito, os cenários
// seriam inalcançáveis nesses tenants (era o caso do Boehringer).
describe('access-gates: cenários com fonte EXTERNA de perfil', () => {
  const EXTERNO = { perfil_externo_fonte: 'opq32' };

  it('libera cenários com o perfil explicitamente bloqueado', () => {
    const r = canAccessMapeamentoCenarios({
      ...EXTERNO,
      perfil_comportamental_liberado: false,
      mapeamento_cenarios_liberado: true,
    });
    expect(r.allowed).toBe(true);
  });

  it('continua fail-closed: sem a flag de cenários, segue bloqueado', () => {
    const r = canAccessMapeamentoCenarios({ ...EXTERNO, perfil_comportamental_liberado: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('CENARIOS_BLOQUEADOS');
  });

  it('votação aberta ainda bloqueia (sem liberação explícita de cenários)', () => {
    const r = canAccessMapeamentoCenarios({ ...EXTERNO, votacao_ativa: true, perfil_comportamental_liberado: false });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('VOTACAO_ATIVA');
  });

  it('NÃO afeta o gate do próprio perfil — que segue bloqueado', () => {
    expect(canAccessPerfilComportamental({ ...EXTERNO, perfil_comportamental_liberado: false }).allowed).toBe(false);
  });
});
