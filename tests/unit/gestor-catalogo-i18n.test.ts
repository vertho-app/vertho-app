/**
 * R-67 (04/10/2026): os catálogos novos do gestor e do RH (`ManagerErrors`, `ManagerAlerts`,
 * `ManagerEvolution`, `ManagerEngagement`, `EngagementSignals` e os que a onda acrescentar) dizem a
 * MESMA coisa nos 4 idiomas, sem português sobrando em en-US e es-ES, e os códigos de erro das actions
 * têm frase em todos.
 *
 * A paridade de CHAVES é do `i18n-paridade.test.ts`; aqui se confere o que ela não vê: os argumentos
 * de cada frase (um `{count}` esquecido numa língua mostra a chave crua na tela), a pontuação do
 * espanhol, e texto que ficou igual ao português.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHAVES_DE_ERRO_DO_GESTOR, CODIGOS_DE_ERRO_DO_GESTOR, chaveDoErroDoGestor, textoDoErroDoGestor,
} from '@/lib/gestor/codigos-de-erro';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const NAMESPACES = ['ManagerErrors', 'ManagerAlerts', 'ManagerEvolution', 'ManagerEngagement', 'EngagementSignals'];
const CAT: Record<string, any> = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]));

function folhas(o: any, p: string, out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof o === 'string') out.push([p, o]);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) folhas(v, p ? `${p}.${k}` : k, out);
  return out;
}

/**
 * Os argumentos de uma frase ICU, lidos com um parser mínimo de chaves: `{nome}` e `{nome, plural|select, chave {texto} ...}`
 * (o texto de cada ramo pode ter outros argumentos). Palavra solta dentro de um ramo (`{employees}`) NÃO é argumento.
 */
function argumentos(frase: string): string[] {
  const achados = new Set<string>();
  const casar = (texto: string, de: number): number => {
    let nivel = 0;
    for (let i = de; i < texto.length; i++) {
      if (texto[i] === '{') nivel++;
      else if (texto[i] === '}' && --nivel === 0) return i;
    }
    return texto.length - 1;
  };
  const andar = (texto: string) => {
    for (let i = 0; i < texto.length; i++) {
      if (texto[i] !== '{') continue;
      const fim = casar(texto, i);
      const interno = texto.slice(i + 1, fim);
      const simples = interno.match(/^\s*([A-Za-z_]\w*)\s*$/);
      const composto = interno.match(/^\s*([A-Za-z_]\w*)\s*,\s*(plural|select|selectordinal|number|date)\s*(?:,(.*))?$/s);
      if (simples) achados.add(simples[1]);
      else if (composto) {
        achados.add(composto[1]);
        // os ramos: `chave {corpo}`; cada corpo é uma frase
        const resto = composto[3] || '';
        for (let j = 0; j < resto.length; j++) {
          if (resto[j] !== '{') continue;
          const f = casar(resto, j);
          andar(resto.slice(j + 1, f));
          j = f;
        }
      }
      i = fim;
    }
  };
  andar(frase);
  return [...achados].sort();
}

/** As tags de destaque (`<strong>`): abrir e fechar em todos os idiomas. */
const tags = (frase: string): string[] => [...frase.matchAll(/<\/?([a-z]+)>/g)].map((m) => m[0]);

describe.each(NAMESPACES)('catálogo %s', (ns) => {
  const doPt = folhas(CAT['pt-BR'][ns], '');

  it('existe nos 4 idiomas e tem frases', () => {
    expect(doPt.length).toBeGreaterThan(3);
    for (const l of LOCALES) expect(folhas(CAT[l][ns], '').length, l).toBe(doPt.length);
  });

  it.each(['pt-PT', 'es-ES', 'en-US'])('%s: cada frase tem os MESMOS argumentos e tags que o pt-BR', (locale) => {
    const lado = new Map(folhas(CAT[locale][ns], ''));
    const divergentes: string[] = [];
    for (const [chave, frase] of doPt) {
      const outra = lado.get(chave) ?? '';
      if (argumentos(frase).join() !== argumentos(outra).join()) divergentes.push(`${chave}: ${argumentos(frase)} x ${argumentos(outra)}`);
      if (tags(frase).join() !== tags(outra).join()) divergentes.push(`${chave}: tags ${tags(frase)} x ${tags(outra)}`);
    }
    expect(divergentes).toEqual([]);
  });

  it('en-US não tem letra nem palavra de português (fora o nome de produto Tira-Dúvidas)', () => {
    const achados = folhas(CAT['en-US'][ns], '')
      .map(([chave, frase]) => [chave, frase.replace(/Tira-Dúvidas/g, '')] as const)
      .filter(([, frase]) => /[àáâãçéêíóôõúü]/i.test(frase) || /\b(não|você|jornada|equipe|semana|sem|para|com|pessoas?)\b/i.test(frase))
      .map(([chave]) => chave);
    expect(achados).toEqual([]);
  });

  it('en-US não deixa a frase igual à do português; es-ES não deixa FRASE (4 palavras ou mais) igual', () => {
    const pt = new Map(doPt);
    const palavras = (f: string) => f.replace(/\{[^}]*\}/g, ' ').split(/[^A-Za-zÀ-ÿ-]+/).filter(Boolean);
    const enIguais = folhas(CAT['en-US'][ns], '')
      .filter(([chave, frase]) => frase === pt.get(chave) && palavras(frase).filter((w) => !/^(PDF|Tira-Dúvidas)$/.test(w)).length > 0)
      .map(([chave]) => chave);
    expect(enIguais, 'en-US: frase igual ao pt-BR').toEqual([]);
    // palavra solta que é a mesma nos dois idiomas ("Todos", "Contexto", "Semana") é correta em espanhol
    const esIguais = folhas(CAT['es-ES'][ns], '')
      .filter(([chave, frase]) => frase === pt.get(chave) && palavras(frase).length >= 4)
      .map(([chave]) => chave);
    expect(esIguais, 'es-ES: frase igual ao pt-BR').toEqual([]);
  });

  it('es-ES abre a exclamação e a interrogação; nenhum idioma usa travessão', () => {
    for (const [chave, frase] of folhas(CAT['es-ES'][ns], '')) {
      if (/!/.test(frase)) expect(frase, `es-ES ${chave}`).toMatch(/¡/);
      if (/\?/.test(frase)) expect(frase, `es-ES ${chave}`).toMatch(/¿/);
    }
    for (const l of LOCALES) {
      const achados = folhas(CAT[l][ns], '').filter(([, f]) => /[–—]/.test(f)).map(([c]) => c);
      expect(achados, `${l}: travessão`).toEqual([]);
    }
  });

  it('en-US diz Employee e direct report, nunca "User"', () => {
    const usuario = folhas(CAT['en-US'][ns], '').filter(([, f]) => /\busers?\b/i.test(f)).map(([c]) => c);
    expect(usuario).toEqual([]);
  });
});

describe('códigos de erro das actions do gestor', () => {
  it('todo código tem chave, e a chave tem frase nos 4 idiomas', () => {
    expect(CODIGOS_DE_ERRO_DO_GESTOR.length).toBeGreaterThan(10);
    for (const codigo of CODIGOS_DE_ERRO_DO_GESTOR) {
      const chave = chaveDoErroDoGestor({ codigo });
      expect(chave, codigo).not.toBeNull();
      for (const l of LOCALES) expect(typeof CAT[l].ManagerErrors[chave!], `${l} ${codigo}`).toBe('string');
    }
    for (const chave of CHAVES_DE_ERRO_DO_GESTOR) {
      for (const l of LOCALES) expect(typeof CAT[l].ManagerErrors[chave], `${l} ${chave}`).toBe('string');
    }
  });

  it('código desconhecido, ausente ou nome de protótipo cai na frase genérica, nunca no texto da action', () => {
    expect(chaveDoErroDoGestor({ codigo: 'constructor' })).toBeNull();
    expect(chaveDoErroDoGestor({ codigo: 'toString' })).toBeNull();
    expect(chaveDoErroDoGestor({ error: 'Não autenticado' })).toBeNull();
    expect(chaveDoErroDoGestor(null)).toBeNull();
    const t = (chave: string) => `[${chave}]`;
    expect(textoDoErroDoGestor(t as any, { error: 'Não autenticado' })).toBe('[generic]');
    expect(textoDoErroDoGestor(t as any, { codigo: 'fora-do-escopo' })).toBe('[outOfScope]');
  });
});
