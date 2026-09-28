/**
 * pt-PT do Simulador de liderança localizado de verdade (revisão de
 * 27/09/2026, L-14).
 *
 * Até então 109 das 127 strings do namespace eram cópia do pt-BR: "Carregando",
 * "tela", "Você", "Registre", "equipe", "rodada". Continuar igual ao pt-BR é
 * legítimo para boa parte delas ("Cancelar", "Encontro {n}"); o que este teste
 * recusa são as marcas do português do Brasil que o pt-PT não usa.
 *
 * Régua sem `\b` em texto acentuado: normaliza antes (em JavaScript, letra
 * acentuada não é caractere de palavra, e `/\bvocê\b/` nunca casa).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).SimuladorLideranca as Record<string, string>;
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavras e construções do pt-BR que o pt-PT troca (ecrã, equipa, registar, ronda, "a carregar"…). */
const MARCAS_PT_BR = /\b(voce|registre|registrar|registrad[oa]s?|equipe|tela|rodadas?|carregando|preparando|trilha)\b/;
/** Possessivo sem artigo no começo de frase ("Sua preparação"): no pt-PT é "A sua preparação". */
const POSSESSIVO_SEM_ARTIGO = /(^|[.;:?!] )(sua|seu|suas|seus) /;

describe('pt-PT do simulador de liderança', () => {
  const ptBR = ler('pt-BR');
  const ptPT = ler('pt-PT');

  it('tem as mesmas chaves do pt-BR', () => {
    expect(Object.keys(ptPT).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it('🔴 nenhuma string com marca do português do Brasil', () => {
    const marcadas = Object.entries(ptPT)
      .filter(([, v]) => MARCAS_PT_BR.test(normalizar(v)) || POSSESSIVO_SEM_ARTIGO.test(normalizar(v)))
      .map(([k, v]) => `${k}: ${v}`);
    expect(marcadas).toEqual([]);
  });

  it('a régua pega o que a revisão achou (ela sabe falhar)', () => {
    for (const texto of ['Carregando sua jornada…', 'Você pode aguardar nesta tela.', 'Sua preparação', 'Registrar e conversar', '{n} de {max} rodadas'])
      expect(MARCAS_PT_BR.test(normalizar(texto)) || POSSESSIVO_SEM_ARTIGO.test(normalizar(texto)), texto).toBe(true);
    for (const texto of ['A carregar a sua jornada…', 'Pode aguardar neste ecrã.', 'A sua preparação', 'Registar e conversar', '{n} de {max} rondas'])
      expect(MARCAS_PT_BR.test(normalizar(texto)) || POSSESSIVO_SEM_ARTIGO.test(normalizar(texto)), texto).toBe(false);
  });
});
