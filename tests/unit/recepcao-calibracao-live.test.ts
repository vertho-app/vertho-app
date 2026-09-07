// Opt-in pago (~US$ 2 para os 5 casos): mede a RÉGUA, não a pessoa. Diálogos sintéticos em memória;
// não cria sessão nem altera dados de usuários.
//
// RECEPCAO_CALIBRACAO_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-calibracao-live.test.ts --maxConcurrency=5
//
// Para cada caso 3.0 (variante 0): três conversas com a paciente real (secretária exemplar, mediana e
// fraca, falas fixas em recepcao-gabarito.ts), e cada conversa avaliada REPETICOES vezes. Responde:
//   1. qual nota o atendimento exemplar tira do avaliador real (o teto prático da régua);
//   2. qual o ruído do avaliador: amplitude das notas da MESMA conversa;
//   3. se os níveis se separam além do ruído.
// Os diálogos e as avaliações ficam em backups/recepcao-calibracao-*.json para inspeção semântica.
import { test, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { abrirSessao, responder, encerrar } from '@/lib/recepcao/core';
import { geradorRecepcao } from '@/lib/recepcao/gerador';
import { exemplar, mediana, fraca } from './recepcao-gabarito';
import type { Estado } from '@/lib/recepcao/model';

// Discriminado por CHAVE (`in`), não por booleano: com strict:false o ramo não estreita.
type Avaliacao = { relatorio: NonNullable<Estado['relatorio']> } | { erro: string; saidas: string[] };
const ATIVO = process.env.RECEPCAO_CALIBRACAO_LIVE === '1';
const REPETICOES = 3;
const NIVEIS = { exemplar: (id: string) => exemplar(id, 0), mediana, fraca } as const;
type Nivel = keyof typeof NIVEIS;
type Linha = { caso: string; nivel: Nivel; notas: Array<number | null>; falhas: string[]; desfechos: string[]; ocorrencias: string[]; instaveis: string[] };
const linhas: Linha[] = [];
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const numeros = (l: Linha) => l.notas.filter((x): x is number => x !== null);
const fmt = (n: number | null) => (n === null ? 'falha' : n.toFixed(1));

test.runIf(ATIVO).concurrent.each(catalogoLimites.map(c => ({ c, nome: c.id })))('$nome: nota do exemplar, ruído do avaliador e separação entre níveis', async ({ c }) => {
 const registro: unknown[] = [];
 for (const nivel of Object.keys(NIVEIS) as Nivel[]) {
  // Um gerador por conversa: a paciente responde às falas fixas; a conversa fica congelada antes das avaliações.
  const paciente = geradorRecepcao(null, null, true);
  let s = abrirSessao(c, 0);
  for (const [i, mensagem] of NIVEIS[nivel](c.id).entries()) s = (await responder(s, { requestId: `${nivel}-${i}`, mensagem }, paciente.gerar)).estado;
  // Um gerador por avaliação: o estado interno de telemetria não é compartilhado entre chamadas paralelas.
  const avaliacoes: Avaliacao[] = await Promise.all(Array.from({ length: REPETICOES }, async (): Promise<Avaliacao> => {
   const ai = geradorRecepcao(null, null, true);
   // Guarda as saídas brutas do avaliador: sem elas, uma recusa por citação não diz QUAL trecho veio.
   const saidas: string[] = [];
   const gerar: typeof ai.gerar = async args => { const r = await ai.gerar(args); saidas.push(r); return r; };
   try { const e = await encerrar(s, gerar, ai.validar); return { relatorio: e.relatorio! }; }
   catch (e) { return { erro: String((e as Error)?.message ?? e), saidas }; }
  }));
  const ok = avaliacoes.flatMap(a => ('relatorio' in a ? [a.relatorio] : []));
  const porDim = new Map<string, Set<string>>();
  for (const r of ok) for (const d of r.dimensoes) porDim.set(d.id, (porDim.get(d.id) || new Set()).add(d.classificacao));
  linhas.push({
   caso: c.id, nivel,
   notas: avaliacoes.map(a => ('relatorio' in a ? a.relatorio.nota : null)),
   falhas: avaliacoes.flatMap(a => ('erro' in a ? [a.erro] : [])),
   desfechos: ok.map(r => r.desfecho.tipo),
   ocorrencias: ok.map(r => r.ocorrencias.map(o => o.categoria).join('+') || 'nenhuma'),
   instaveis: [...porDim].filter(([, v]) => v.size > 1).map(([k]) => k),
  });
  registro.push({ nivel, conversa: s.historico, avaliacoes });
 }
 mkdirSync('backups', { recursive: true });
 writeFileSync(`backups/recepcao-calibracao-${carimbo}-${c.id}.json`, JSON.stringify({ caso: c.id, versao: c.versao, rubricaVersao: c.rubricaVersao, repeticoes: REPETICOES, registro }, null, 2));

 const doCaso = (n: Nivel) => linhas.find(l => l.caso === c.id && l.nivel === n)!;
 expect(linhas.filter(l => l.caso === c.id).flatMap(l => l.falhas)).toEqual([]);
 expect(media(numeros(doCaso('exemplar')))!).toBeGreaterThan(media(numeros(doCaso('fraca')))!);
 if (c.id === 'informacao-terceiro') expect(doCaso('fraca').ocorrencias.filter(o => o.includes('divulgacao_dado_terceiro')).length).toBeGreaterThan(0);
}, 600000);

afterAll(() => {
 if (!ATIVO || !linhas.length) return;
 const saida = [`\nCalibração do avaliador: ${REPETICOES} avaliações da MESMA conversa por nível, variante 0, catálogo ${catalogoLimites[0].versao}/${catalogoLimites[0].rubricaVersao}`];
 for (const caso of [...new Set(linhas.map(l => l.caso))]) {
  const porNivel = (n: Nivel) => linhas.find(l => l.caso === caso && l.nivel === n)!;
  const amplitude = (l: Linha) => { const v = numeros(l); return v.length ? Math.max(...v) - Math.min(...v) : null; };
  const ruido = Math.max(...(Object.keys(NIVEIS) as Nivel[]).map(n => amplitude(porNivel(n)) ?? 0));
  const separacao = (media(numeros(porNivel('exemplar'))) ?? 0) - (media(numeros(porNivel('fraca'))) ?? 0);
  saida.push(`\n${caso}: separação exemplar-fraca ${separacao.toFixed(1)} · ruído máximo ${ruido.toFixed(1)} → ${separacao > ruido ? 'separa' : 'NÃO separa: ruído >= efeito'}`);
  for (const n of Object.keys(NIVEIS) as Nivel[]) {
   const l = porNivel(n);
   saida.push(`  ${n.padEnd(8)} notas ${l.notas.map(fmt).join(' / ')} · média ${fmt(media(numeros(l)))} · amplitude ${fmt(amplitude(l))} · desfechos ${l.desfechos.join(',') || 'nenhum'} · ocorrências ${l.ocorrencias.join(' | ') || 'nenhuma'}${l.instaveis.length ? ` · classificação instável em ${l.instaveis.join(',')}` : ''}${l.falhas.length ? ` · FALHAS ${l.falhas.length}` : ''}`);
  }
 }
 console.log(saida.join('\n'));
});
