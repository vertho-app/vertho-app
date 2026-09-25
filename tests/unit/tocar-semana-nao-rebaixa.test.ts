import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusAoTocarSemana } from '@/lib/season-engine/progresso-semana';
import { PROGRESSO } from '@/lib/status';

/**
 * Tocar uma semana (abrir o conteúdo, escolher o modo da missão) nunca rebaixa
 * uma semana `concluido`.
 *
 * Medido em 25/09/2026, Macaé: 3 diretoras concluíram a conversa, clicaram num
 * formato do conteúdo da mesma semana 1 a 2 minutos depois, e
 * `marcarConteudoConsumido` gravou `em_andamento` por cima. O gate sequencial
 * trancou a semana seguinte e a conversa encerrada não regrava o status. A
 * queixa chegou como "fiz a semana 5 e não aparece".
 *
 * As asserções sobre os escritores são estáticas (mesmo padrão de
 * `semana-gates-tela`): montar a action exige sessão e Supabase, e o que
 * precisa ficar travado é que o status gravado passe pela régua.
 */

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8');

/** Corpo de `marcarConteudoConsumido`, até a próxima função exportada. */
function corpoDaAction(): string {
  const fonte = ler('actions/temporadas.ts');
  const inicio = fonte.indexOf('export async function marcarConteudoConsumido');
  expect(inicio).toBeGreaterThan(-1);
  const fim = fonte.indexOf('\nexport ', inicio + 1);
  return fonte.slice(inicio, fim === -1 ? undefined : fim);
}

const STATUS_FIXO = /status:\s*PROGRESSO\.EM_ANDAMENTO/;

describe('statusAoTocarSemana', () => {
  it('semana concluída continua concluída', () => {
    expect(statusAoTocarSemana(PROGRESSO.CONCLUIDO)).toBe(PROGRESSO.CONCLUIDO);
  });

  it('pendente, em andamento ou linha sem status vão para em andamento', () => {
    expect(statusAoTocarSemana(PROGRESSO.PENDENTE)).toBe(PROGRESSO.EM_ANDAMENTO);
    expect(statusAoTocarSemana(PROGRESSO.EM_ANDAMENTO)).toBe(PROGRESSO.EM_ANDAMENTO);
    expect(statusAoTocarSemana(null)).toBe(PROGRESSO.EM_ANDAMENTO);
    expect(statusAoTocarSemana(undefined)).toBe(PROGRESSO.EM_ANDAMENTO);
  });
});

describe('marcarConteudoConsumido não reabre semana concluída', () => {
  const corpo = corpoDaAction();

  it('lê o status atual da linha', () => {
    // Sem `status` no select, `existente?.status` é sempre undefined e a régua
    // devolve `em_andamento` para todo mundo: o bug volta sem nenhum erro.
    const select = corpo.match(/from\('temporada_semana_progresso'\)\s*\.select\('([^']*)'\)/);
    expect(select?.[1].split(',').map((c) => c.trim())).toContain('status');
  });

  it('grava o status pela régua, não fixo', () => {
    expect(corpo).toContain('status: statusAoTocarSemana(existente?.status)');
    expect(corpo).not.toMatch(STATUS_FIXO);
  });
});

describe('rota da missão não reabre semana concluída', () => {
  const rota = ler('app/api/temporada/missao/route.ts');

  it('grava o status pela régua, não fixo', () => {
    expect(rota).toContain('status: statusAoTocarSemana(prog?.status)');
    expect(rota).not.toMatch(STATUS_FIXO);
    // A linha vem de `select('*')`, então o status está lá.
    expect(rota).toMatch(/from\('temporada_semana_progresso'\)\s*\.select\('\*'\)/);
  });
});
