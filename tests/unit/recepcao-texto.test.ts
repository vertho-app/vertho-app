import { test, expect } from 'vitest';
import { descreverMensagem, humanizarReferencias, type MensagemRef } from '@/lib/recepcao/texto';
import { consolidar, promptAvaliador } from '@/lib/recepcao/core';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { executarExemplo, insumosExemplo } from './recepcao-fixtures.mjs';

const hist: MensagemRef[] = [{ id: 'm0', role: 'assistant' }, { id: 'm1', role: 'user' }, { id: 'm2', role: 'assistant' }, { id: 'm3', role: 'user' }, { id: 'm4', role: 'assistant' }, { id: 'm5', role: 'user' }];

test('id de mensagem vira posição: com a pessoa por padrão, em terceira pessoa para a revisão', () => {
  expect(descreverMensagem(hist, 'm0', 'Marina')).toBe('1ª fala de Marina');
  expect(descreverMensagem(hist, 'm5', 'Marina')).toBe('sua 3ª resposta');
  expect(descreverMensagem(hist, 'm5', 'Marina', 'terceira')).toBe('3ª resposta da secretária');
  expect(descreverMensagem(hist, 'm4')).toBe('3ª fala da paciente');
  expect(descreverMensagem(hist, 'm9', 'Marina')).toBeNull();
});

test('texto livre sai sem identificadores; preposição e maiúscula preservadas; id desconhecido fica', () => {
  expect(humanizarReferencias('Em m5, ao dizer "x", manteve a posição. Já em m0 a paciente pediu.', hist, 'Marina'))
    .toBe('Na sua 3ª resposta, ao dizer "x", manteve a posição. Já na 1ª fala de Marina a paciente pediu.');
  expect(humanizarReferencias('Citação (m3) e m4: repetiu.', hist, 'Marina')).toBe('Citação (sua 2ª resposta) e 3ª fala de Marina: repetiu.');
  expect(humanizarReferencias('Em m3 firmou.', hist, 'Marina', 'terceira')).toBe('Na 2ª resposta da secretária firmou.');
  expect(humanizarReferencias('id desconhecido m42 fica; 10m2 não é id.', hist, 'Marina')).toBe('id desconhecido m42 fica; 10m2 não é id.');
});

test('relatório consolidado fala com a pessoa e não carrega m0, m1… em justificativa, motivo, desfecho nem feedback', async () => {
  const s = await executarExemplo();
  const a = insumosExemplo();
  a.feedback.acerto = 'Em m1 acolheu; em m5 confirmou.';
  a.dimensoes[0].justificativa = 'Ver m1.';
  a.desfecho.justificativa = 'Aceite em m4.';
  const r = consolidar(s, a)!;
  for (const t of [r.feedback.acerto, r.feedback.melhoria, r.dimensoes[0].justificativa, r.desfecho.justificativa]) expect(t).not.toMatch(/\bm\d+\b/);
  expect(r.feedback.acerto).toBe('Na sua 1ª resposta acolheu; na sua 3ª resposta confirmou.');
  expect(r.desfecho.justificativa).toMatch(/^Aceite na 3ª fala de /);
  expect(promptAvaliador(catalogoLimites[0])).toMatch(/fale COM a secretária, em segunda pessoa/);
});
