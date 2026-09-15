// Opt-in pago (~US$ 3,5): compara o AVALIADOR em dois modelos sobre a MESMA conversa.
//
// RECEPCAO_MODELO_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-modelo-live.test.ts
//
// Desenho PAREADO, e é o ponto do ensaio: a conversa de cada nível é gerada UMA vez (paciente no
// modelo de produção) e congelada; os dois braços avaliam exatamente o mesmo texto. Sem isso, a
// diferença entre modelos viria misturada com a variação da paciente, que roda a 0.6 de temperatura.
//
// Cada braço avalia REPETICOES vezes a mesma conversa: a amplitude dentro do braço é o RUÍDO do
// avaliador, e nenhuma diferença entre modelos significa nada antes de ser maior que ele
// (o par exemplar/fraca de 06/09 já mostrou ruído de até 17,5 pontos na mesma conversa).
//
// ⚠️ Assimetria conhecida entre os braços, medida em `actions/ai-client.ts`: a geração 5 REMOVE
// `temperature`, então o `temperature: 0` que o avaliador pede vale no 4.6 e é descartado no
// Sonnet 5. O ruído de cada braço é medido justamente para expor o efeito disso.
//
// Os diálogos e as avaliações dos dois braços ficam em backups/recepcao-modelo-*.json.
import { test, expect, afterAll, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';

// O braço é trocado por uma variável de processo, então os casos rodam em SÉRIE (sem `.concurrent`):
// dois casos em paralelo leriam o mesmo ponteiro e um avaliaria no modelo do outro.
const controle = vi.hoisted(() => ({ modeloAvaliador: null as string | null, effort: null as string | null, maxTokens: 0 }));
const TIMEOUT_MS = vi.hoisted(() => Number(process.env.RECEPCAO_MODELO_TIMEOUT_MS || 0));
vi.mock('@/lib/ai-tasks', async original => {
 const real = await original<typeof import('@/lib/ai-tasks')>();
 return {
  ...real,
  // Só o avaliador troca. A paciente fica no modelo de produção nos dois braços, senão a conversa
  // congelada não seria mais a mesma entrada.
  getModelForTask: async (empresaId: any, taskKey: any) =>
   taskKey === 'recepcao_avaliacao' && controle.modeloAvaliador
    ? controle.modeloAvaliador
    : real.getModelForTask(empresaId, taskKey),
 };
});
// O effort não é resolvível por task (`getModelForTask` devolve só o id), e o gerador não passa
// `reasoningEffort` — então o braço `modelo:effort` injeta a opção aqui, sem tocar no produto.
// Só vale na geração 5: em `aplicarThinkingClaude` o 4.6 ignora `output_config.effort`.
vi.mock('@/actions/ai-client', async original => {
 const real = await original<typeof import('@/actions/ai-client')>();
 return {
  ...real,
  // O teto também é do braço: `max_tokens` do avaliador (8.000) foi dimensionado para um modelo que
  // NÃO raciocina, e todo modelo com thinking o divide com o raciocínio. Medido 15/09: sonnet-5 em
  // `high` truncou o JSON em 14 de 69 chamadas; muse-spark em `xhigh` gastou 7.997 de 8.000 pensando
  // e devolveu VAZIO; gemini-3.8-flash em `high`, 7.996. Sem esta variável o ensaio compara o teto,
  // não o modelo.
  // `RECEPCAO_MODELO_TIMEOUT_MS` afrouxa o relógio do avaliador (100 s) só no ensaio, para separar
  // "o modelo não consegue" de "o call-site cortou". ⚠️ Ler o resultado com a rota em mente: ela tem
  // `maxDuration` de 300 s e o core tenta 2×, então um braço que só passa com 200 s por chamada
  // respondeu à pergunta errada — consegue, mas não cabe no produto.
  callAIChat: (system: any, messages: any, cfg: any, maxTokens: any, opts: any) => {
   if (opts?.taskKey !== 'recepcao_avaliacao') return real.callAIChat(system, messages, cfg, maxTokens, opts);
   const extra: any = { ...opts };
   if (controle.effort) extra.reasoningEffort = controle.effort;
   if (TIMEOUT_MS) extra.timeoutMs = TIMEOUT_MS;
   return real.callAIChat(system, messages, cfg, controle.maxTokens || maxTokens, extra);
  },
 };
});

import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { abrirSessao, responder, encerrar } from '@/lib/recepcao/core';
import { geradorRecepcao } from '@/lib/recepcao/gerador';
import { exemplar, mediana, fraca } from './recepcao-gabarito';
import type { Estado } from '@/lib/recepcao/model';

// Discriminado por CHAVE (`in`), não por booleano: com strict:false o ramo não estreita.
type Avaliacao = { relatorio: NonNullable<Estado['relatorio']> } | { erro: string; saidas: string[] };
const ATIVO = process.env.RECEPCAO_MODELO_LIVE === '1';
// Baixar para 1 serve ao ensaio seco que prova que o braço realmente troca o modelo (a conferência
// é no ledger, não aqui); a medição de ruído precisa de 3.
const REPETICOES = Number(process.env.RECEPCAO_MODELO_REPETICOES || 3);
const BRACOS = (process.env.RECEPCAO_MODELO_BRACOS || 'claude-sonnet-4-6,claude-sonnet-5').split(',');
const NIVEIS = { exemplar: (id: string) => exemplar(id, 0), mediana, fraca } as const;
type Nivel = keyof typeof NIVEIS;
type Linha = { caso: string; nivel: Nivel; modelo: string; notas: Array<number | null>; falhas: string[]; desfechos: string[]; ocorrencias: string[]; instaveis: string[]; ms: number[] };
const linhas: Linha[] = [];
const carimbo = new Date().toISOString().replace(/[:.]/g, '-');

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const numeros = (l: Linha) => l.notas.filter((x): x is number => x !== null);
const amplitude = (l: Linha) => { const v = numeros(l); return v.length ? Math.max(...v) - Math.min(...v) : null; };
const fmt = (n: number | null) => (n === null ? 'falha' : n.toFixed(1));

test.runIf(ATIVO).each(catalogoLimites.map(c => ({ c, nome: c.id })))('$nome: mesma conversa avaliada pelos dois modelos', async ({ c }) => {
 const registro: unknown[] = [];
 for (const nivel of Object.keys(NIVEIS) as Nivel[]) {
  // Conversa gerada UMA vez, no modelo de produção da paciente, e congelada para os dois braços.
  controle.modeloAvaliador = null; controle.effort = null; controle.maxTokens = 0;
  const paciente = geradorRecepcao(null, null, true);
  let s = abrirSessao(c, 0);
  for (const [i, mensagem] of NIVEIS[nivel](c.id).entries()) s = (await responder(s, { requestId: `${nivel}-${i}`, mensagem }, paciente.gerar)).estado;

  for (const braco of BRACOS) {
   // `claude-sonnet-5:low:24000` = modelo + effort + teto de saída. Sem os sufixos, valem o default
   // do provedor e o `max_tokens` do call-site.
   const [modelo, effort, teto] = braco.split(':');
   controle.modeloAvaliador = modelo;
   controle.effort = effort || null;
   controle.maxTokens = Number(teto) || 0;
   const ms: number[] = [];
   // Repetições em paralelo (o braço inteiro roda no mesmo modelo, então o ponteiro não corre risco).
   // A latência limpa por modelo sai do ledger, não daqui.
   const avaliacoes: Avaliacao[] = await Promise.all(Array.from({ length: REPETICOES }, async (): Promise<Avaliacao> => {
    const ai = geradorRecepcao(null, null, true);
    const saidas: string[] = [];
    const gerar: typeof ai.gerar = async args => { const out = await ai.gerar(args); saidas.push(out); return out; };
    const t0 = Date.now();
    try { const e = await encerrar(s, gerar, ai.validar); ms.push(Date.now() - t0); return { relatorio: e.relatorio! }; }
    catch (e) { ms.push(Date.now() - t0); return { erro: String((e as Error)?.message ?? e), saidas }; }
   }));
   const ok = avaliacoes.flatMap(a => ('relatorio' in a ? [a.relatorio] : []));
   const porDim = new Map<string, Set<string>>();
   for (const r of ok) for (const d of r.dimensoes) porDim.set(d.id, (porDim.get(d.id) || new Set()).add(d.classificacao));
   linhas.push({
    caso: c.id, nivel, modelo: braco,
    notas: avaliacoes.map(a => ('relatorio' in a ? a.relatorio.nota : null)),
    falhas: avaliacoes.flatMap(a => ('erro' in a ? [a.erro] : [])),
    desfechos: ok.map(r => r.desfecho.tipo),
    ocorrencias: ok.map(r => r.ocorrencias.map(o => o.categoria).join('+') || 'nenhuma'),
    instaveis: [...porDim].filter(([, v]) => v.size > 1).map(([k]) => k),
    ms,
   });
   registro.push({ nivel, braco, conversa: s.historico, avaliacoes });
  }
 }
 controle.modeloAvaliador = null; controle.effort = null; controle.maxTokens = 0;
 mkdirSync('backups', { recursive: true });
 writeFileSync(`backups/recepcao-modelo-${carimbo}-${c.id}.json`, JSON.stringify({ caso: c.id, versao: c.versao, rubricaVersao: c.rubricaVersao, repeticoes: REPETICOES, bracos: BRACOS, registro }, null, 2));

 // Sanidade da RÉGUA em cada braço (a comparação entre modelos é o resultado, não a asserção):
 // um avaliador que não separa exemplar de fraca não serve, seja qual for o modelo.
 for (const modelo of BRACOS) {
  const doNivel = (n: Nivel) => linhas.find(l => l.caso === c.id && l.nivel === n && l.modelo === modelo)!;
  expect(media(numeros(doNivel('exemplar'))), `${modelo} sem nota no exemplar`).not.toBeNull();
  expect(media(numeros(doNivel('exemplar')))!, `${modelo} não separa exemplar de fraca`).toBeGreaterThan(media(numeros(doNivel('fraca')))!);
 }
}, 1800000);

afterAll(() => {
 if (!ATIVO || !linhas.length) return;
 const saida = [`\nAvaliador por modelo: ${REPETICOES} avaliações da MESMA conversa por nível e braço, variante 0, catálogo ${catalogoLimites[0].versao}/${catalogoLimites[0].rubricaVersao}`,
  `Braços: ${BRACOS.join(' vs ')}`];
 const deltas: number[] = [];
 const ruidos: number[] = [];
 for (const caso of [...new Set(linhas.map(l => l.caso))]) {
  saida.push(`\n${caso}`);
  for (const n of Object.keys(NIVEIS) as Nivel[]) {
   const medias: Array<number | null> = [];
   for (const modelo of BRACOS) {
    const l = linhas.find(x => x.caso === caso && x.nivel === n && x.modelo === modelo);
    if (!l) continue;
    medias.push(media(numeros(l)));
    if (amplitude(l) !== null) ruidos.push(amplitude(l)!);
    saida.push(`  ${n.padEnd(8)} ${modelo.padEnd(18)} notas ${l.notas.map(fmt).join(' / ')} · média ${fmt(media(numeros(l)))} · amplitude ${fmt(amplitude(l))} · ${Math.round(media(l.ms)! / 1000)}s · desfechos ${l.desfechos.join(',') || 'nenhum'} · ocorrências ${l.ocorrencias.join(' | ') || 'nenhuma'}${l.instaveis.length ? ` · classificação instável em ${l.instaveis.join(',')}` : ''}${l.falhas.length ? ` · FALHAS ${l.falhas.length}` : ''}`);
   }
   // Delta contra o PRIMEIRO braço, que é o controle por convenção do comando — com três ou mais
   // braços (sweep de effort) comparar só dois deixaria o resto sem leitura.
   if (medias.length > 1 && medias[0] !== null) {
    const contra = medias.slice(1).map((m, i) => {
     if (m === null) return `${BRACOS[i + 1]} falha`;
     const d = m - medias[0]!;
     deltas.push(d);
     return `${BRACOS[i + 1]} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
    });
    saida.push(`  ${' '.repeat(8)} ${`delta vs ${BRACOS[0]}`.padEnd(18)} ${contra.join(' · ')}`);
   }
  }
 }
 if (deltas.length) {
  const ruidoMax = Math.max(...ruidos, 0);
  const maiorDelta = Math.max(...deltas.map(Math.abs));
  const medioDelta = media(deltas)!;
  saida.push(`\nResumo: delta médio ${medioDelta >= 0 ? '+' : ''}${medioDelta.toFixed(1)} · maior |delta| ${maiorDelta.toFixed(1)} · ruído máximo dentro de um braço ${ruidoMax.toFixed(1)}`);
  saida.push(maiorDelta > ruidoMax
   ? `Há célula em que a diferença entre modelos supera o ruído do instrumento: olhe a LISTA por caso, não a média.`
   : `Nenhuma célula separa os modelos além do ruído do próprio avaliador (${ruidoMax.toFixed(1)} pontos): as notas são indistinguíveis neste n.`);
 }
 // Arquivo além do console: o `console.log` de um `afterAll` não apareceu no stdout do runner
 // (medido 15/09), e uma tabela que custou US$ 5 não pode depender do reporter.
 mkdirSync('backups', { recursive: true });
 writeFileSync(`backups/recepcao-modelo-${carimbo}-TABELA.txt`, saida.join('\n'));
 console.log(saida.join('\n'));
});
