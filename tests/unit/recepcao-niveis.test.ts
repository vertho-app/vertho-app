import { test, expect } from 'vitest';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { sugerirNivel, ordenarPorNivel, NOTA_PARA_SUBIR, promptPaciente, promptAvaliador, fichaPublica } from '@/lib/recepcao/core';
import { NIVEIS } from '@/lib/recepcao/schema';

test('cada catálogo carrega o próprio nível e a versão x.1 na ficha pública', () => {
  expect(catalogoInicial.map(c => [c.versao, c.publico.nivel])).toEqual(Array(5).fill(['1.1', 'introducao']));
  expect(catalogoDesafiador.map(c => [c.versao, c.publico.nivel])).toEqual(Array(5).fill(['2.1', 'pressao']));
  expect(catalogoLimites.map(c => [c.versao, c.publico.nivel])).toEqual(Array(5).fill(['3.1', 'limite']));
  // A rubrica não mudou entre x.0 e x.1: a identidade que agrupa notas no painel segue a mesma.
  expect(new Set(catalogoLimites.map(c => c.rubricaVersao))).toEqual(new Set(['3.0-limites']));
});

test('o nível chega à ficha da tela e fica FORA dos prompts (calibração de 06/09 continua valendo)', () => {
  const c = catalogoLimites[0];
  expect(fichaPublica(c).nivel).toBe('limite');
  expect(promptPaciente(c)).not.toMatch(/"nivel"/);
  expect(promptAvaliador(c)).not.toMatch(/"nivel"/);
  const semNivel = { ...c, publico: { ...c.publico, nivel: undefined } };
  expect(promptPaciente(c)).toBe(promptPaciente(semNivel));
  expect(promptAvaliador(c)).toBe(promptAvaliador(semNivel));
});

test('sugestão de nível: começa na introdução, sobe um degrau por nível vencido e para no último', () => {
  expect(sugerirNivel([])).toBe('introducao');
  expect(sugerirNivel([{ nivel: null, nota: 100 }])).toBe('introducao'); // snapshot anterior à escada não conta
  expect(sugerirNivel([{ nivel: 'introducao', nota: NOTA_PARA_SUBIR - 0.5 }])).toBe('introducao');
  expect(sugerirNivel([{ nivel: 'introducao', nota: NOTA_PARA_SUBIR }])).toBe('pressao');
  expect(sugerirNivel([{ nivel: 'introducao', nota: 30 }, { nivel: 'pressao', nota: 80 }])).toBe('limite');
  expect(sugerirNivel([{ nivel: 'limite', nota: 100 }])).toBe('limite');
  expect(sugerirNivel([{ nivel: 'limite', nota: null }])).toBe('introducao');
});

test('catálogo ordenado por degrau e título; caso sem nível vai para o fim', () => {
  const itens = [
    { id: 'c', ficha: { nivel: 'limite', titulo: 'B' } }, { id: 'd', ficha: { nivel: undefined, titulo: 'A' } },
    { id: 'a', ficha: { nivel: 'introducao', titulo: 'Z' } }, { id: 'b', ficha: { nivel: 'introducao', titulo: 'A' } },
    { id: 'e', ficha: { nivel: 'pressao', titulo: 'M' } },
  ];
  expect(ordenarPorNivel(itens).map(i => i.id)).toEqual(['b', 'a', 'e', 'c', 'd']);
  expect(NIVEIS).toEqual(['introducao', 'pressao', 'limite']);
});
