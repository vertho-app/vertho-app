/**
 * A-15 da revisão de 27/09/2026: textos de "clínica" e "paciente" para empresas de
 * outros segmentos.
 *
 * O simulador de atendimento serve recepção médica, atendimento geral, secretaria
 * escolar e loja (`lib/recepcao/dominio.ts`), mas o servidor dizia "habilitado para
 * sua clínica", a gestão mostrava "Da clínica" e "N pacientes", o editor pedia
 * "Clínica fictícia" e a aba Competências mostrava sempre a matriz médica.
 *
 * Duas provas: a aba Competências renderizada no segmento de loja não fala de
 * orientação clínica (e no médico fala: controle), e uma varredura do texto que a
 * pessoa lê nos arquivos da gestão, do editor e das mensagens do servidor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CompetenciasRecepcao from '@/components/recepcao/competencias';

const render = (dominio: string) =>
  renderToStaticMarkup(createElement(CompetenciasRecepcao, { empresaId: 'e', admin: true, dominio }));

/** Só o que vira texto para a pessoa: literais de string e texto de JSX, sem comentários. */
function textoVisivel(arquivo: string) {
  const src = readFileSync(arquivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const literais = [...src.matchAll(/'([^'\n]*)'|`([^`]*)`|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const jsx = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  return [...literais, ...jsx].filter((t) => /\s/.test(t.trim()) || /^[A-ZÁÉÍÓÚ]/.test(t.trim()));
}
const MEDICO = /cl[ií]nica|pacientes?\b/i;

describe('A-15: texto pelo segmento', () => {
  it('a aba Competências mostra a matriz do segmento da empresa', () => {
    expect(render('recepcao_medica')).toMatch(/orientação clínica/);
    const loja = render('atendimento_loja');
    expect(loja).not.toMatch(/orientação clínica/);
    expect(loja).toMatch(/orientação técnica fora da sua função/);
  });

  it.each([
    'components/recepcao/gestao.tsx',
    'components/recepcao/editor.tsx',
    'lib/recepcao/access.ts',
    'app/api/recepcao/config/route.ts',
    'app/api/recepcao/voz/route.ts',
  ])('%s não fala de clínica nem de paciente para quem lê', (arquivo) => {
    expect(textoVisivel(arquivo).filter((t) => MEDICO.test(t))).toEqual([]);
  });
});
