import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cenario } from '@/lib/recepcao/cenario.mjs';
import { abrirSessao, visaoPublica, responder, encerrar, consolidar, validarCenario, promptAvaliador } from '@/lib/recepcao/core.mjs';

import { executarExemplo, insumosExemplo } from './recepcao-fixtures.mjs';
const fala = async () => JSON.stringify({ fala: 'Pode explicar?' });

test('sessão completa: abertura, atendimento, aceitação e feedback', async () => {
  const s = await executarExemplo();
  assert.equal(s.status, 'concluida');
  assert.equal(s.historico.length, 7);
  assert.equal(s.relatorio.nota, 100);
  assert.equal(s.relatorio.coberturaPercentual, 100);
  assert.equal(s.relatorio.desfecho.tipo, 'remarcado');
  assert.equal(s.motivoFim, 'encerramento_usuario');
});
test('projeção pública não expõe gabarito ou estado reservado', () => {
  const s = abrirSessao(cenario), p = visaoPublica(s);
  assert.equal(p.cenario.paciente, undefined);
  assert.equal(p.recibos, undefined);
  assert.equal(p.cenario.rubrica, undefined);
  p.historico[0].content = 'alterado';
  assert.notEqual(s.historico[0].content, 'alterado');
  assert.ok(!promptAvaliador(cenario).includes(cenario.paciente.fatos[0]));
});
test('snapshot do cenário não muda ao editar a origem', () => {
  const c = structuredClone(cenario), s = abrirSessao(c);
  c.publico.titulo = 'editado';
  assert.equal(s.cenario.publico.titulo, cenario.publico.titulo);
});
test('retry confirmado reutiliza recibo sem nova chamada ou turno', async () => {
  let chamadas = 0;
  const provider = async () => { chamadas++; return fala(); };
  const req = { requestId: '1', mensagem: 'Olá' };
  const a = await responder(abrirSessao(cenario), req, provider);
  const b = await responder(a.estado, req, provider);
  assert.equal(chamadas, 1);
  assert.equal(b.repetido, true);
  assert.deepEqual(b.estado, a.estado);
  await assert.rejects(responder(a.estado, { ...req, mensagem: 'outro texto' }, provider), /outro conteúdo/);
});
test('falha da IA ou JSON inválido não altera o estado original', async () => {
  const s = abrirSessao(cenario), antes = structuredClone(s);
  const req = { requestId: '1', mensagem: 'Olá' };
  await assert.rejects(responder(s, req, async () => { throw new Error('indisponível'); }));
  await assert.rejects(responder(s, req, async () => 'não é JSON'));
  await assert.rejects(responder(s, req, async () => JSON.stringify({ fala: 'a'.repeat(801) })), /não será truncada/);
  assert.deepEqual(s, antes);
});
test('limite de respostas pausa sem fingir resolução', async () => {
  const s = abrirSessao({ ...cenario, limiteRespostas: 1 });
  const { estado } = await responder(s, { requestId: '1', mensagem: 'Olá' }, fala);
  assert.equal(estado.status, 'aguardando_avaliacao');
  assert.equal(estado.motivoFim, 'limite_respostas');
  assert.equal(estado.relatorio, null);
  await assert.rejects(responder(estado, { requestId: '2', mensagem: 'Olá' }, fala), /encerrada/);
});
test('mérito não pode usar citação inventada, vazia ou da paciente', async () => {
  const s = await executarExemplo();
  for (const ref of [
    { mensagemId: 'm1', trecho: 'fala que não existe' },
    { mensagemId: 'm1', trecho: ' ' },
    { mensagemId: 'm0', trecho: 'É a segunda vez' }
  ]) {
    const a = insumosExemplo(); a.dimensoes[0].evidencias = [ref];
    assert.throws(() => consolidar(s, a), /Citação/);
  }
});
test('peso parcial é calculado em código, ignorando média enviada pela IA', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  a.nota = 999; a.dimensoes[0].classificacao = 'parcial';
  assert.equal(consolidar(s, a).nota, 87.5);
});
test('ausência de oportunidade reduz cobertura; não vira reprovação', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  a.dimensoes[0] = { ...a.dimensoes[0], classificacao: 'nao_observavel', justificativa: 'Fixture de cobertura parcial.', evidencias: [], oportunidades: [] };
  const r = consolidar(s, a);
  assert.equal(r.nota, 100);
  assert.equal(r.coberturaPercentual, 75);
  assert.equal(r.situacao, 'avaliacao_parcial');
  // Este teste valida aritmética; a classificação semântica depende de calibração humana.
});
test('zero cobertura produz nota nula', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  a.dimensoes = a.dimensoes.map(d => ({ ...d, classificacao: 'nao_observavel', evidencias: [], oportunidades: [] }));
  assert.equal(consolidar(s, a).nota, null);
});
test('ocorrência crítica permanece sinalizada mesmo com nota alta', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  s.historico.push({ id: 'm7', role: 'user', content: 'Pare com essa reclamação idiota.' });
  a.ocorrencias = [{ categoria: 'desrespeito_grave', motivo: 'Ofensa à paciente.', evidencias: [{ mensagemId: 'm7', trecho: 'reclamação idiota' }] }];
  assert.equal(consolidar(s, a).situacao, 'atencao_critica');
});
test('resolução declarada exige referência à aceitação da paciente', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  a.desfecho.evidencias.pop();
  assert.throws(() => consolidar(s, a), /combinado e aceitação/);
});
test('encaminhamento autorizado é desfecho válido sem agendamento', async () => {
  const s = await executarExemplo(), a = insumosExemplo();
  s.historico.push({ id: 'm7', role: 'user', content: 'Posso pedir retorno da coordenação até hoje às 12h neste chat?' });
  s.historico.push({ id: 'm8', role: 'assistant', content: 'Sim, pode pedir esse retorno.' });
  a.desfecho = { tipo: 'encaminhado', justificativa: 'Encaminhamento autorizado.', evidencias: [
    { mensagemId: 'm7', trecho: s.historico[7].content }, { mensagemId: 'm8', trecho: s.historico[8].content }
  ] };
  assert.equal(consolidar(s, a).desfecho.tipo, 'encaminhado');
});
test('validação rejeita pesos inválidos e dimensões duplicadas', async () => {
  const c = structuredClone(cenario); c.rubrica[0].peso = 30;
  assert.throws(() => validarCenario(c), /somar 100/);
  const a = insumosExemplo(), s = await executarExemplo();
  a.dimensoes[1].id = a.dimensoes[0].id;
  assert.throws(() => consolidar(s, a), /duplicada/);
});
test('encerrar sem atendimento não atribui nota; encerramento repetido não chama IA', async () => {
  await assert.rejects(encerrar(abrirSessao(cenario), fala), /sem respostas/);
  const s = await executarExemplo();
  assert.deepEqual(await encerrar(s, async () => { throw new Error('não chamar'); }), s);
});
test('avaliação inválida tem uma correção limitada, preservando estado se ambas falharem', async () => {
  const original = await executarExemplo();
  const s = { ...original, status: 'em_andamento', relatorio: null };
  let chamadas = 0;
  const corrigido = await encerrar(s, async () => {
    chamadas++;
    return chamadas === 1 ? '{}' : JSON.stringify(insumosExemplo());
  });
  assert.equal(chamadas, 2); assert.equal(corrigido.status, 'concluida');
  chamadas = 0;
  await assert.rejects(encerrar(s, async () => { chamadas++; return '{}'; }));
  assert.equal(chamadas, 2); assert.equal(s.status, 'em_andamento'); assert.equal(s.relatorio, null);
});
