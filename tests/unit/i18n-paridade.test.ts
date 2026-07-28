import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Paridade de locales (guard da varredura de 28/07): `SeasonWeek.pdi` foi
 * adicionado em pt-BR/pt-PT/es-ES e esquecido em en-US — a página da semana
 * quebrava em runtime SÓ em inglês, e nada no CI olhava. next-intl lança
 * MISSING_MESSAGE quando a chave não existe no locale ativo, então paridade
 * de CHAVES (não de valores) é invariante de build, não cosmético.
 */

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];

function chaves(obj: Record<string, unknown>, prefixo = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? chaves(v as Record<string, unknown>, `${prefixo}${k}.`)
      : [`${prefixo}${k}`],
  );
}

const mensagens = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    new Set(chaves(JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')))),
  ]),
);

describe('i18n — os 4 locales têm exatamente as mesmas chaves', () => {
  for (const locale of LOCALES) {
    it(`${locale} não tem chave faltando nem sobrando`, () => {
      const minhas = mensagens[locale];
      const faltando: string[] = [];
      const sobrando: string[] = [];
      for (const outro of LOCALES) {
        if (outro === locale) continue;
        for (const k of mensagens[outro]) if (!minhas.has(k)) faltando.push(`${k} (existe em ${outro})`);
        for (const k of minhas) if (!mensagens[outro].has(k)) sobrando.push(`${k} (falta em ${outro})`);
      }
      expect([...new Set(faltando)], `chaves faltando em ${locale}`).toEqual([]);
      expect([...new Set(sobrando)], `chaves sobrando em ${locale}`).toEqual([]);
    });
  }
});
