import { expect, it } from 'vitest';
import { validarSugestaoTags } from '@/lib/conteudo-tags';
const tags = { pilar: null, competencia: 'Comunicação', descritor: 'Escuta ativa', nivel_min: 1, nivel_max: 2, contexto: 'corporativo', cargo: 'todos', setor: 'todos', tipo_conteudo: 'texto', confianca: 'alta', raciocinio: 'Ensina a confirmar o entendimento da demanda.' };
it('aceita somente nomes do catálogo e níveis válidos', () => {
  expect(validarSugestaoTags(tags, ['Comunicação'])).toEqual(tags);
  expect(() => validarSugestaoTags({ ...tags, competencia: 'Comunicação (Escuta ativa) [escopo: base]' }, ['Comunicação'])).toThrow('fora do catálogo');
  expect(() => validarSugestaoTags({ ...tags, nivel_min: 3, nivel_max: 2 }, ['Comunicação'])).toThrow();
  expect(() => validarSugestaoTags({ ...tags, confianca: 'inventada' }, ['Comunicação'])).toThrow();
  expect(() => validarSugestaoTags(null, ['Comunicação'])).toThrow();
});
