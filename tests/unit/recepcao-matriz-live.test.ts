// Opt-in pago (~US$ 1): primeira medição REAL do avaliador de 30 descritores (matriz 5 × 6),
// que até 18/09/2026 nunca tinha rodado em produção (0 linhas `recepcao-avaliador-3.0` em
// recepcao_tentativas). Diálogos sintéticos em memória; não cria sessão nem altera dados.
//
// RECEPCAO_MATRIZ_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-matriz-live.test.ts --maxConcurrency=4
//
// Responde, para os casos com matriz (exemplar e mediana, variante 0, 1 avaliação cada):
//   1. quanto tempo o avaliador leva (o teto de 180 s da primeira tentativa cabe?);
//   2. quantas avaliações são recusadas e quantos descritores caem na tolerância de citação;
//   3. quantas competências passam da regra de cobertura (4 descritores observados) e se a
//      média geral existe (3 competências com nível). Se o exemplar não tiver média, a regra
//      é estrita demais para o atendimento, e isso é informação para o dono, não para o código.
// Saídas completas em backups/recepcao-matriz-*.json.
import { test, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { abrirSessao, responder, encerrar } from '@/lib/recepcao/core';
import { geradorRecepcao } from '@/lib/recepcao/gerador';
import { exemplar, mediana } from './recepcao-gabarito';

const ATIVO = process.env.RECEPCAO_MATRIZ_LIVE === '1';
const CASOS = ['remarcacao-02', 'informacao-terceiro'];
const linhas: string[] = [];
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

test.runIf(ATIVO).concurrent.each(
  CASOS.flatMap((id) => (['exemplar', 'mediana'] as const).map((nivel) => ({ id, nivel }))),
)('$id · $nivel: tempo, recusa e cobertura do avaliador de 30 descritores', async ({ id, nivel }) => {
  const c = aplicarMatrizAtendimento(catalogoLimites.find((x) => x.id === id)!);
  const paciente = geradorRecepcao(null, null, true);
  let s = abrirSessao(c, 0);
  const falas = nivel === 'exemplar' ? exemplar(id, 0) : mediana(id);
  for (const [i, mensagem] of falas.entries())
    s = (await responder(s, { requestId: `${nivel}-${i}`, mensagem }, paciente.gerar)).estado;
  const ai = geradorRecepcao(null, null, true);
  const saidas: string[] = [];
  const tempos: number[] = [];
  const gerar: typeof ai.gerar = async (args) => {
    const t0 = Date.now();
    try {
      const r = await ai.gerar(args);
      saidas.push(r);
      return r;
    } finally {
      tempos.push(Date.now() - t0);
    }
  };
  let resultado: Record<string, unknown>;
  try {
    const r = (await encerrar(s, gerar, ai.validar)).relatorio!;
    resultado = {
      nota: r.nota,
      competencias: r.competencias?.map((x) => `${x.codigo}:${x.observados}/${x.total}${x.nivel ? ` N${x.nivel}` : ' sem nível'}`),
      descartados: r.descartados || [],
      desfecho: r.desfecho.tipo,
      ocorrencias: r.ocorrencias.map((o) => o.categoria),
    };
  } catch (e) {
    resultado = { erro: String((e as Error)?.message ?? e).slice(0, 300) };
  }
  const linha = { caso: id, nivel, tentativas: tempos.length, tempos_s: tempos.map((t) => Math.round(t / 1000)), ...resultado };
  linhas.push(JSON.stringify(linha));
  mkdirSync('backups', { recursive: true });
  writeFileSync(
    `backups/recepcao-matriz-${carimbo}-${id}-${nivel}.json`,
    JSON.stringify({ linha, conversa: s.historico, saidas }, null, 2),
  );
}, 600000);

afterAll(() => {
  if (!ATIVO || !linhas.length) return;
  console.log(`\nAvaliador 30 descritores (${catalogoLimites[0].versao} + matriz):\n${linhas.join('\n')}`);
});
