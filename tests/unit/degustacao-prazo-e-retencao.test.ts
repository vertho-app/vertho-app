import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEGUSTACAO_DIAS_DE_VALIDADE,
  acmeProspectExpiresAt,
} from '@/lib/demo/acme-prospect-config';
import { DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS } from '@/lib/demo/presentation-ticket';

/**
 * Prazo do passaporte e o que acontece DEPOIS dele (03/09/2026).
 *
 * Mudaram três coisas de uma vez, e elas se sustentam mutuamente:
 *   1. a validade foi de 2 para 10 dias;
 *   2. vencer passou a revogar o ACESSO, não a apagar o trabalho;
 *   3. o convidado atravessa o reset, então o ambiente volta ao estado-base
 *      toda noite sem levar junto o que a pessoa fez.
 *
 * O que este arquivo protege é o encaixe entre elas — cada uma sozinha
 * funciona, e a combinação errada produz ou dado eterno ou dado que some.
 */
describe('prazo e retenção da degustação', () => {
  it('o passe vale 10 dias, às 04h BRT', () => {
    const criado = new Date('2026-09-03T18:30:00.000Z'); // 15h30 BRT
    const expira = new Date(acmeProspectExpiresAt(criado));

    expect(DEGUSTACAO_DIAS_DE_VALIDADE).toBe(10);
    expect(expira.toISOString()).toBe('2026-09-13T07:00:00.000Z');
    const dias = (expira.getTime() - criado.getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(9);
    expect(dias).toBeLessThan(11);
  });

  it('criação depois das 21h BRT não perde um dia por causa da data UTC', () => {
    // 22h BRT de 03/09 é 01h UTC de 04/09: sem o deslocamento do relógio, a
    // conta partiria do dia 4 e a pessoa ganharia um dia a mais
    const criado = new Date('2026-09-04T01:00:00.000Z');
    expect(acmeProspectExpiresAt(criado)).toBe('2026-09-13T07:00:00.000Z');
  });

  it('o teto do passe da apresentação COMPORTA a validade do passaporte', () => {
    // sem isto, criar o passaporte falha em "validade do passe inválida" — o
    // teto é o que barra, e ele é invisível para quem só mexeu no prazo
    const criado = new Date('2026-09-03T18:30:00.000Z');
    const janelaSegundos = (Date.parse(acmeProspectExpiresAt(criado)) - criado.getTime()) / 1000;
    expect(janelaSegundos).toBeLessThanOrEqual(DEMO_PROSPECT_PRESENTATION_MAX_TTL_SECONDS);
  });

  it('vencer revoga o acesso e NÃO apaga o colaborador', () => {
    const fonte = readFileSync('lib/demo/acme-prospect-tracking.ts', 'utf8');
    const laco = fonte.slice(
      fonte.indexOf('for (const row of expiredRows)'),
      fonte.indexOf('FAXINA DE RETENÇÃO'),
    );
    expect(laco.length).toBeGreaterThan(0);
    // a conta do Auth sai (o acesso morre)…
    expect(laco).toContain('auth.admin.deleteUser');
    // …e o colaborador fica: é ele que guarda o DISC em colunas próprias
    expect(laco).not.toContain('deleteGuestCollaborator');
  });

  it('a faxina de retenção usa access_closed_at, não a data de criação', () => {
    // apagar por idade da CRIAÇÃO derrubaria quem criou o passaporte cedo e só
    // fez a experiência semanas depois — a contagem começa quando o acesso fecha
    const fonte = readFileSync('lib/demo/acme-prospect-tracking.ts', 'utf8');
    const bloco = fonte.slice(fonte.indexOf('FAXINA DE RETENÇÃO'));
    expect(bloco).toContain("lt('access_closed_at'");
    expect(bloco).toContain('deleteGuestCollaborator');
  });

  it('o reset solta o cenário ANTES de apagar o catálogo (FK RESTRICT)', () => {
    // `respostas_cenario_id_fkey` é ON DELETE RESTRICT: preservar a resposta sem
    // soltar o ponteiro faz o delete de banco_cenarios violar a FK e derrubar o
    // reset inteiro, de madrugada, sem ninguém olhando
    const fonte = readFileSync('lib/demo/reset-acme-demo.ts', 'utf8');
    const corpo = fonte.slice(fonte.indexOf('async function resetTenant'));
    const soltar = corpo.indexOf('soltarCenarioDasRespostasPreservadas');
    const wipe = corpo.indexOf('for (const table of DEMO_RESET_TABLES)');
    expect(soltar).toBeGreaterThan(-1);
    expect(wipe).toBeGreaterThan(-1);
    expect(soltar).toBeLessThan(wipe);
  });

  it('o reset preserva o convidado, e o adiamento por convidado ativo saiu', () => {
    const reset = readFileSync('lib/demo/reset-acme-demo.ts', 'utf8');
    expect(reset).toContain('convidadosPreservados');
    // o filtro precisa existir nas duas frentes: a pessoa e o que ela respondeu
    expect(reset).toMatch(/table === 'colaboradores'[\s\S]{0,120}not\('id', 'in'/);
    expect(reset).toMatch(/TABELAS_DO_CONVIDADO\.has\(table\)[\s\S]{0,120}not\('colaborador_id', 'in'/);

    const cron = readFileSync('app/api/cron/route.ts', 'utf8');
    expect(cron).not.toContain('lifecycle.activeCount > 0');
  });
});
