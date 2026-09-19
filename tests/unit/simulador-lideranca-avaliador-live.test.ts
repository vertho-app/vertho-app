// Opt-in pago (~US$ 0,20): primeira medição REAL do avaliador da liderança v2 (18 descritores
// por encontro: foco + 2 secundárias), que substituiu o de 6 descritores em 18/09/2026.
// Conversas sintéticas em memória; não cria jornada nem grava nada.
//
// LIDERANCA_AVALIADOR_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/simulador-lideranca-avaliador-live.test.ts
//
// Responde: quanto tempo o avaliador leva (o teto de 115 s por tentativa cabe?), se a saída
// passa na validação estrutural, quantos descritores caem na tolerância de citação e quantos
// comportamentos são observados por competência (a regra de 4 dá nível?).
import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { PROMPTS } from '@/lib/simulador-lideranca/prompts';
import { SAIDAS } from '@/lib/simulador-lideranca/schema';
import {
  diagnosticarAvaliacao,
  gravarAvaliacao,
  linhasDoEncontro,
  resumoAvaliacao,
} from '@/lib/simulador-lideranca/avaliacao';

const ATIVO = process.env.LIDERANCA_AVALIADOR_LIVE === '1';
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

// Encontro 1 (Diagnosticar, com Ana). Uma condução razoável: pergunta, escuta, testa hipótese.
const plano =
  'Quero entender por que as entregas atrasaram antes de propor qualquer mudança. Vou perguntar à Ana como o trabalho chega, onde trava e o que ela já tentou. Minha hipótese é que as prioridades mudam no meio da semana, mas preciso confirmar com dados. Vou combinar com ela um próximo passo concreto.';
const falas = [
  ['lider', 'Ana, obrigado por parar um pouco. Quero entender os atrasos antes de mudar qualquer coisa. Como as demandas chegam para vocês hoje?'],
  ['personagem', 'Chegam de todo lado: e-mail, mensagem, alguém que passa na mesa. Muitas vezes a mesma coisa vem duas vezes com prazos diferentes.'],
  ['lider', 'Isso ajuda. Nas três entregas que atrasaram no mês, o que aconteceu em cada uma? Quero ver se é o mesmo motivo.'],
  ['personagem', 'Em duas, a prioridade mudou no meio da semana e ninguém avisou a equipe inteira. Na terceira, faltou uma informação do cliente interno.'],
  ['lider', 'Então minha hipótese de que a prioridade muda sem aviso parece se confirmar em duas de três. O que você acha que faltou para a equipe saber a tempo?'],
  ['personagem', 'Um lugar só onde as prioridades ficassem registradas. E alguém dizendo o que sai quando entra algo novo.'],
  ['lider', 'Faz sentido. Proponho que a gente teste por duas semanas um quadro único de prioridades, revisado toda segunda com vocês. Você topa me ajudar a montar e me dizer na sexta se melhorou?'],
  ['personagem', 'Topo, desde que o quadro seja respeitado por quem manda demanda de fora também.'],
] as const;
const reflexao =
  'Percebi que eu tinha uma hipótese pronta e consegui testá-la com casos concretos. Poderia ter perguntado mais sobre a entrega que atrasou por falta de informação.';

test.runIf(ATIVO)('encontro 1: tempo, validação e cobertura do avaliador de 18 descritores', async () => {
  const matriz = linhasDaVariante('lider');
  const linhas = linhasDoEncontro(matriz, 0);
  const encontro = EPISODIOS[0];
  const mensagens = falas.map(([autor, texto], i) => ({ turno: Math.floor(i / 2) + 1, autor, texto }));
  const ativo: any = { indice: 0, plano, mensagens, reflexao, antecedentes: [] };
  const dados = {
    competenciaFoco: encontro.nome,
    competenciasSecundarias: encontro.secundarias,
    matriz: linhas,
    antecedentes: [],
    planejamento: plano,
    mensagens,
    reflexao,
  };
  const jsonSchema = z.toJSONSchema(SAIDAS.avaliador, { target: 'draft-7' }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const model = await getModelForTask(null, 'sim_lideranca_avaliador');
  const inicio = Date.now();
  const raw = await callAI(PROMPTS.avaliador, JSON.stringify(dados), { model }, 16000, {
    taskKey: 'sim_lideranca_avaliador',
    locale: 'pt-BR',
    timeoutMs: 240000,
    maxRetries: 0,
    responses: { format: { name: 'lideranca_avaliador', strict: true, schema: jsonSchema } },
  });
  const segundos = Math.round((Date.now() - inicio) / 1000);
  const valor = SAIDAS.avaliador.parse(JSON.parse(raw));
  let diagnostico = 'ok';
  try {
    diagnosticarAvaliacao(valor, ativo, linhas);
  } catch (e) {
    diagnostico = String((e as Error).message).slice(0, 200);
  }
  const gravada = gravarAvaliacao(valor, ativo, linhas);
  const resumo = resumoAvaliacao(gravada, matriz, 0);
  const linha = {
    modelo: model,
    segundos,
    diagnostico,
    descartados: gravada.descartados || [],
    competencias: resumo.competencias.map((c) => `${c.nome}: ${c.observados}/${c.total}${c.nivel ? ` N${c.nivel}` : ' sem nível'}`),
    media: resumo.media,
  };
  mkdirSync('backups', { recursive: true });
  writeFileSync(`backups/lideranca-avaliador-${carimbo}.json`, JSON.stringify({ linha, dados, valor }, null, 2));
  console.log(JSON.stringify(linha));
  expect(diagnostico).toBe('ok');
}, 300000);
