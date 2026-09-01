import { describe, it, expect } from 'vitest';
import {
  getDemoPresentationRoleFromHostname,
  listarPapeisDeApresentacao,
} from '@/lib/demo/presentation';

/**
 * O papel da sala de apresentação alimenta o `getSnapshot` de um
 * `useSyncExternalStore` (`PresentationEnvironment`). O React compara snapshots
 * com `Object.is`: se a leitura devolve uma referência NOVA a cada chamada, ele
 * conclui que a store mudou e força outro render, que lê de novo — laço até
 * "Maximum update depth exceeded" (React #185).
 *
 * `Medido:` 01/09/2026 — o dashboard inteiro caiu em `rh-demo.vertho.ai`, e só
 * nos domínios de apresentação, porque só neles esse componente monta. Nada no
 * typecheck ou na suíte acusava: a função estava correta em VALOR e errada em
 * IDENTIDADE, e é a identidade que o React usa.
 *
 * Por isso as asserções abaixo usam `toBe` (identidade) e não `toEqual`
 * (estrutura). Um teste com `toEqual` aqui passaria com o bug no lugar.
 */
describe('Snapshot do papel de apresentação', () => {
  it('devolve a MESMA REFERÊNCIA para o mesmo hostname', () => {
    const a = getDemoPresentationRoleFromHostname('rh-demo.vertho.ai');
    const b = getDemoPresentationRoleFromHostname('rh-demo.vertho.ai');
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('reproduz a comparação que o React faz entre commits', () => {
    // É literalmente o `checkIfSnapshotChanged` do useSyncExternalStore: se
    // isto for false, o React agenda re-render, e o ciclo recomeça.
    const snapshot = () => getDemoPresentationRoleFromHostname('gestor-demo.vertho.ai');
    expect(Object.is(snapshot(), snapshot())).toBe(true);
  });

  it('mantém a identidade em hostnames equivalentes e com porta', () => {
    expect(getDemoPresentationRoleFromHostname('RH-DEMO.vertho.ai'))
      .toBe(getDemoPresentationRoleFromHostname('rh-demo.vertho.ai:443'));
  });

  it('a lista inteira também é estável', () => {
    expect(listarPapeisDeApresentacao()).toBe(listarPapeisDeApresentacao());
  });

  it('segue devolvendo null fora das salas', () => {
    // A correção não pode transformar "não é sala de apresentação" em algum
    // papel: é isso que decide se o switcher monta no domínio de um cliente.
    expect(getDemoPresentationRoleFromHostname('app.vertho.ai')).toBeNull();
    expect(getDemoPresentationRoleFromHostname('macae.vertho.ai')).toBeNull();
    expect(getDemoPresentationRoleFromHostname('')).toBeNull();
  });

  it('cada papel continua sabendo de que ambiente é', () => {
    const papeis = listarPapeisDeApresentacao();
    expect(papeis.length).toBeGreaterThan(0);
    for (const papel of papeis) {
      expect(papel.tenantSlug).toBeTruthy();
      expect(papel.hostSlug).toBeTruthy();
    }
  });
});
