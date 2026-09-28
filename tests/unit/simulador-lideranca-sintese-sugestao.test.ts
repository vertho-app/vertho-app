/**
 * Sugestão de repetição no fim da jornada (revisão de 27/09/2026, L-12 e L-13).
 *
 * A síntese diz, em uma frase, o que falta demonstrar na competência sugerida,
 * e aponta o encontro a repetir (o botão "Repetir o encontro N").
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import SinteseJornadaView from '@/components/simulador-lideranca/sintese';
import { gravarAvaliacao, linhasDoEncontro, sinteseDaJornada } from '@/lib/simulador-lideranca/avaliacao';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { estado, episodio, FALA } from '../fixtures/simulador-lideranca';

const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
const PRIORIZACAO = 'Priorização e Tomada de Decisão';
const html = (sintese: ReturnType<typeof sinteseDaJornada>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'pt-BR',
      messages: pt,
      timeZone: 'America/Sao_Paulo',
      children: createElement(SinteseJornadaView, { sintese, onRepetir: () => {} }),
    }),
  );

/** Cinco encontros concluídos; `nivel(nome)` decide o nível de cada competência (null = sem evidência). */
function jornada(nivel: (nome: string) => number | null) {
  const matriz = estado().matriz;
  const eps = [0, 1, 2, 3, 4].map((i) => {
    const linhas = linhasDoEncontro(matriz, i);
    const ep = episodio(i);
    const avaliacao = gravarAvaliacao(
      {
        sintese: 's',
        proximaPratica: 'p',
        descritores: linhas.map((l) => {
          const n = nivel(l.nome);
          return {
            codigo: l.cod_desc,
            nivel: n,
            justificativa: 'j',
            evidencias: n === null ? [] : [{ fonte: 'fala' as const, turno: 1, trecho: FALA }],
          };
        }),
      },
      ep,
      linhas,
    );
    return { ...ep, encerradoEm: `2026-09-2${i}T12:00:00Z`, avaliacao };
  });
  return sinteseDaJornada(eps, matriz, 5);
}

describe('síntese do fim da jornada: o que falta demonstrar', () => {
  it('competência com nível abaixo de 3: diz o nível a alcançar e o maior até aqui', () => {
    const s = jornada((nome) => (nome === PRIORIZACAO ? 2 : 3));
    expect(s.sugestaoRepetir).toBe(EPISODIOS.findIndex((e) => e.nome === PRIORIZACAO));
    const saida = html(s);
    expect(saida).toContain(`Falta chegar ao Nível 3 em ${PRIORIZACAO}: o maior nível até aqui é o 2.`);
    expect(saida).toContain(`Repetir o encontro ${s.sugestaoRepetir! + 1}`);
  });

  it('competência sem nível: diz quantos comportamentos no mesmo encontro dão nível', () => {
    const s = jornada((nome) => (nome === PRIORIZACAO ? null : 3));
    expect(s.sugestaoRepetir).toBe(EPISODIOS.findIndex((e) => e.nome === PRIORIZACAO));
    expect(html(s)).toContain(
      `Falta demonstrar ${PRIORIZACAO}: ela recebe nível quando pelo menos 4 comportamentos aparecem no mesmo encontro.`,
    );
  });
});
