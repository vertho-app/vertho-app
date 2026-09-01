import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_TENANT_PROFILES, resetPausadoAte } from '@/lib/demo/reset-acme-demo';

/**
 * Pausa do reset noturno de um ambiente de demonstração.
 *
 * O risco desta feature não é falhar em pausar — é pausar PARA SEMPRE. Uma
 * automação com data de fim que não se desliga sozinha é o modo de falha já
 * medido nesta base (os crons do CONARH seguiram disparando 48×/dia duas
 * semanas depois do evento acabar). Por isso o teste central é o da EXPIRAÇÃO,
 * e por isso existe o de ESTADO: nenhum ambiente pode amanhecer pausado sem
 * alguém ter decidido isso.
 *
 * Houve uma pausa real de 01/09 a 07/09/2026 (a experiência do Alpheu no Grupo
 * Sinal), removida a pedido do dono no mesmo dia. O mecanismo fica; a pausa,
 * não — é assim que ele não vira um reset desligado que ninguém religa.
 */

type Slug = keyof typeof DEMO_TENANT_PROFILES;
const SLUGS = Object.keys(DEMO_TENANT_PROFILES) as Slug[];
const AGORA = new Date();
const UMA_DATA = '2026-09-07T07:00:00.000Z';

/** Declara uma pausa só durante o teste, e devolve o perfil ao estado real. */
function comPausa<T>(slug: Slug, valor: string | null, fn: () => T): T {
  const perfil = DEMO_TENANT_PROFILES[slug] as any;
  const original = perfil.resetPausadoAte;
  perfil.resetPausadoAte = valor;
  try { return fn(); } finally { perfil.resetPausadoAte = original; }
}

describe('pausa do reset dos ambientes demo', () => {
  it('ESTADO: toda pausa vigente tem prazo CURTO — nenhuma é eterna', () => {
    // Pausar é decisão legítima (o `escolas-acme` está pausado enquanto o
    // fixture escolar não é congelado, senão o cron apaga o conteúdo de IA que
    // só vive no banco). O que não pode existir é pausa SEM fim prático: é ela
    // que vira reset desligado para sempre.
    const TETO_DIAS = 30;
    for (const slug of SLUGS) {
      const ate = resetPausadoAte(slug, AGORA);
      if (!ate) continue;
      const dias = (Date.parse(ate) - AGORA.getTime()) / 86_400_000;
      expect(dias, `${slug}: pausa até ${ate} é longa demais para ser uma janela`).toBeLessThan(TETO_DIAS);
    }
  });

  it('segura o reset enquanto a data declarada não chegou', () => {
    comPausa('gruposinal', UMA_DATA, () => {
      const antes = new Date(Date.parse(UMA_DATA) - 60_000);
      expect(resetPausadoAte('gruposinal', antes)).toBe(UMA_DATA);
    });
  });

  it('EXPIRA sozinha: no instante do limite o reset volta, sem intervenção', () => {
    comPausa('gruposinal', UMA_DATA, () => {
      expect(resetPausadoAte('gruposinal', new Date(Date.parse(UMA_DATA)))).toBeNull();
      expect(resetPausadoAte('gruposinal', new Date(Date.parse(UMA_DATA) + 60_000))).toBeNull();
    });
  });

  it('é POR AMBIENTE: pausar um não congela os outros', () => {
    const antes = new Date(Date.parse(UMA_DATA) - 60_000);
    comPausa('gruposinal', UMA_DATA, () => {
      expect(resetPausadoAte('gruposinal', antes)).toBe(UMA_DATA);
      for (const outro of SLUGS.filter((s) => s !== 'gruposinal')) {
        // pode ter pausa PRÓPRIA (o escolas-acme tem); o que não pode é herdar a do vizinho
        expect(resetPausadoAte(outro, antes)).not.toBe(UMA_DATA);
      }
    });
  });

  it('data inválida não vira pausa infinita', () => {
    comPausa('gruposinal', 'domingo que vem', () => {
      expect(resetPausadoAte('gruposinal', AGORA)).toBeNull();
    });
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
});
