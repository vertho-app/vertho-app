import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_TENANT_PROFILES, resetPausadoAte } from '@/lib/demo/reset-acme-demo';

/**
 * Pausa do reset noturno de um ambiente de demonstração.
 *
 * O risco desta feature não é falhar em pausar — é pausar PARA SEMPRE. Uma
 * automação com data de fim que não se desliga sozinha é o modo de falha já
 * medido nesta base (os crons do CONARH seguiram disparando 48×/dia duas
 * semanas depois do evento acabar). Por isso o teste central aqui é o da
 * EXPIRAÇÃO, não o do bloqueio.
 */
describe('pausa do reset dos ambientes demo', () => {
  const slug = 'gruposinal' as const;
  const pausaDeclarada = DEMO_TENANT_PROFILES[slug].resetPausadoAte!;

  it('segura o reset enquanto a data não chegou', () => {
    const antes = new Date(Date.parse(pausaDeclarada) - 60_000);
    expect(resetPausadoAte(slug, antes)).toBe(pausaDeclarada);
  });

  it('EXPIRA sozinha: no instante do limite o reset volta, sem intervenção', () => {
    const noLimite = new Date(Date.parse(pausaDeclarada));
    const depois = new Date(Date.parse(pausaDeclarada) + 60_000);
    expect(resetPausadoAte(slug, noLimite)).toBeNull();
    expect(resetPausadoAte(slug, depois)).toBeNull();
  });

  it('a pausa tem prazo declarado e curto — não é um reset desligado', () => {
    const limite = Date.parse(pausaDeclarada);
    expect(Number.isFinite(limite)).toBe(true);
    // 30 dias é folgado para uma janela de demonstração e ainda assim fecha a
    // porta para "pausei e esqueci": passar disso é decisão, não descuido.
    const trintaDias = 30 * 24 * 60 * 60 * 1000;
    expect(limite - Date.parse('2026-09-01T00:00:00.000Z')).toBeLessThan(trintaDias);
  });

  it('ambiente sem pausa declarada nunca é pulado', () => {
    expect(DEMO_TENANT_PROFILES['acme-demo'].resetPausadoAte).toBeNull();
    expect(resetPausadoAte('acme-demo', new Date('2026-09-02T07:00:00.000Z'))).toBeNull();
  });

  it('data inválida não vira pausa infinita', () => {
    const perfil = DEMO_TENANT_PROFILES[slug] as any;
    const original = perfil.resetPausadoAte;
    try {
      perfil.resetPausadoAte = 'domingo que vem';
      expect(resetPausadoAte(slug, new Date('2026-09-02T07:00:00.000Z'))).toBeNull();
    } finally {
      perfil.resetPausadoAte = original;
    }
  });

  it('o ACME segue resetando todas as madrugadas da janela do Grupo Sinal', () => {
    // a pausa é POR AMBIENTE: pausar um não pode congelar o outro, que é onde
    // os passaportes do dia a dia são criados
    for (const dia of ['2026-09-02', '2026-09-04', '2026-09-06']) {
      expect(resetPausadoAte('acme-demo', new Date(`${dia}T07:00:00.000Z`))).toBeNull();
      expect(resetPausadoAte(slug, new Date(`${dia}T07:00:00.000Z`))).toBe(pausaDeclarada);
    }
  });

  it('a faxina de convidados vencidos roda ANTES da pausa, e não é pulada por ela', () => {
    // Invariante de ORDEM, por isso lida no fonte: a pausa segura a RECOMPOSIÇÃO
    // do ambiente, nunca a remoção de acesso de quem passou do prazo. Invertido,
    // um passaporte vencido continuaria entrando até a pausa expirar.
    const fonte = readFileSync('app/api/cron/route.ts', 'utf8');
    const inicio = fonte.indexOf('const slugsDemo');
    const fim = fonte.indexOf('reset do demo falhou');
    // as duas âncoras têm de EXISTIR: um recorte que não acha o alvo mede o
    // arquivo inteiro e passa por acidente
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);

    const bloco = fonte.slice(inicio, fim);
    const faxina = bloco.indexOf('cleanupExpiredDemoProspects(slug)');
    const pausa = bloco.indexOf('resetPausadoAte(slug)');
    expect(faxina).toBeGreaterThan(-1);
    expect(pausa).toBeGreaterThan(-1);
    expect(faxina).toBeLessThan(pausa);
  });

  it('cobre a janela pedida: nenhuma madrugada de terça a domingo recompõe o ambiente', () => {
    const madrugadas = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
    for (const dia of madrugadas) {
      expect(resetPausadoAte(slug, new Date(`${dia}T07:00:00.000Z`))).toBe(pausaDeclarada);
    }
    // e na segunda seguinte o ciclo normal volta
    expect(resetPausadoAte(slug, new Date('2026-09-07T07:00:00.000Z'))).toBeNull();
  });
});
