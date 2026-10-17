/**
 * Plano visual do vídeo na biblioteca v7 (vertho.ai): as regras puras entre a resposta do Opus e a composição.
 *
 * Portado do preenchedor do protótipo validado nos vídeos de validação aprovados (Amazon e Macaé, 17/10/2026).
 * O Opus 5.5 recebe o catálogo (`CATALOGO_V7`) e as cenas com as frases cronometradas, e devolve, por cena, os
 * momentos: um modelo da biblioteca e os seus dados, com os tempos como ÂNCORAS nas frases ("@2+0.4"). Aqui:
 *
 * 1. `problemasDoPlano`: as regras GARANTIDAS, não só pedidas no prompt (medido: o catálogo pede e ainda assim 1
 *    plano em 3 repetiu um modelo). Momento com problema volta ao Opus por `pedidoDeAjuste` + `aplicarAjustes`:
 *    - modelo repetido no vídeo (exceto `imagem`);
 *    - `sob_medida` (decisão do dono, 17/10: "vamos sem momentos sob medida para não subir o custo");
 *    - modelo fora do catálogo (o `vago_preciso` saiu em 17/10: "ficou meio sem nexo");
 *    - momento longo e ESPARSO (mais de 16 s com um vazio de 6 s+ sem nada novo na tela): sem a divisão, 10,6% do
 *      vídeo ficava parado; com ela, 3,5% (medido nos dois vídeos de validação).
 * 2. `montarMomentos`: encadeia os momentos nas frases, calcula as durações, resolve as âncoras em segundos do
 *    momento (com os tetos de tempo das ações finais), confere os tetos de caracteres e devolve a lista que a
 *    composição (`worker-hetzner/video-v7/composicao.mjs`) renderiza.
 *
 * Nada aqui chama modelo de IA nem toca no disco: quem chama (o Trigger) faz as chamadas pelo wrapper de IA.
 */
import { MODELOS_CATALOGO_V7 } from './catalogo';

export type FraseCena = { i: number; de: number; ate: number; texto: string };
export type CenaPlano = { id: string; tipo?: string; dur: number; tela?: Record<string, unknown>; frases: FraseCena[] };
export type Fundo = 'navy' | 'claro' | 'branco';
export type MomentoBruto = { frases: [number, number]; tpl: string; fundo?: string; nome?: string; data?: Record<string, unknown> };
export type RespostaPlano = { cenas: { id: string; momentos: MomentoBruto[] }[]; ajuste?: string[]; ajustes_n?: number };
export type Problema = { cena: string; k: number; tpl: string; frases: [number, number]; dur: number; problema: string };
export type AjusteBruto = { cena: string; k: number; momentos: MomentoBruto[] };
export type PedidoImagem = { momento: string; nome: string; descricao: string; lado: 'cheia' | 'direita' | 'esquerda' };
export type MomentoFinal = {
  id: string; cena: string; tpl: string; nome: string; data: Record<string, unknown>; dur: number; fundo: Fundo; frases: [number, number];
};

/** Modelos sem a regra de "no máximo 1 vez por vídeo" (o catálogo pede exatamente 2 imagens). */
export const LIVRES: readonly string[] = ['imagem'];
/** No máximo 2 imagens por vídeo (decisão do dono, 16/10/2026). */
export const MAX_IMAGENS = 2;
/** Até 2 rodadas de ajuste por plano. */
export const MAX_RODADAS_AJUSTE = 2;
export const FUNDOS: readonly Fundo[] = ['navy', 'claro', 'branco'];

const ANCORA = /^@(\d+)(\$)?\s*([+-]\s*\d+(?:\.\d+)?)?$/;

/** Segundos da cena de uma âncora ("@k", "@k+0.6", "@k$", "@k$-0.3"), ou null se não for âncora válida. */
export function segundosDaAncora(v: unknown, frases: FraseCena[]): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(ANCORA);
  if (!m) return null;
  const f = frases[Number(m[1])];
  if (!f) return null;
  return (m[2] ? f.ate : f.de) + (m[3] ? Number(m[3].replace(/\s/g, '')) : 0);
}

function ancoras(v: unknown, frases: FraseCena[], out: number[]): number[] {
  const s = segundosDaAncora(v, frases);
  if (s != null) out.push(s);
  else if (Array.isArray(v)) v.forEach((x) => ancoras(x, frases, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => ancoras(x, frases, out));
  return out;
}

/**
 * Os momentos que precisam ser refeitos, com o motivo em inglês (vai no pedido ao Opus).
 * A ordem de varredura é a do vídeo: a primeira ocorrência de um modelo fica, as seguintes são "repetidas".
 */
export function problemasDoPlano(resp: RespostaPlano, cenas: CenaPlano[], modelos: readonly string[] = MODELOS_CATALOGO_V7): Problema[] {
  const vistos = new Set<string>(), problemas: Problema[] = [];
  for (const rc of resp.cenas || []) {
    const c = cenas.find((x) => x.id === rc.id);
    if (!c) continue;
    const ms = (rc.momentos || []).slice().sort((a, b) => a.frases[0] - b.frases[0]);
    ms.forEach((m, j) => {
      const k = rc.momentos.indexOf(m), nx = ms[j + 1];
      const ini = j === 0 ? 0 : c.frases[m.frases[0]]?.de ?? 0;
      const fim = nx && c.frases[nx.frases[0]] ? c.frases[nx.frases[0]].de : c.dur;
      const dur = fim - ini;
      const ts = ancoras(m.data || {}, c.frases, []).filter((x) => x > ini && x < fim).sort((a, b) => a - b);
      const pts = [ini, ...ts, fim - 1];
      const vazio = Math.max(0, ...pts.slice(1).map((x, i) => x - pts[i]));
      const p: string[] = [];
      if (m.tpl === 'sob_medida') p.push('uses `sob_medida`, which does not exist');
      else if (!modelos.includes(m.tpl)) p.push('uses `' + m.tpl + '`, which is not in the library');
      else if (!LIVRES.includes(m.tpl) && vistos.has(m.tpl)) p.push('repeats a template already used in the video');
      if (m.tpl !== 'imagem' && dur > 16 && vazio > 6) {
        p.push(`lasts ${dur.toFixed(1)} s with a ${vazio.toFixed(1)} s stretch where nothing new appears: SPLIT it into 2 or 3 consecutive moments along its phrases (each at most 14 s)`);
      }
      if (!LIVRES.includes(m.tpl) && m.tpl !== 'sob_medida') vistos.add(m.tpl);
      if (p.length) problemas.push({ cena: rc.id, k, tpl: m.tpl, frases: m.frases, dur: +dur.toFixed(1), problema: p.join('; ') });
    });
  }
  return problemas;
}

/** O contexto da empresa (em produção, o resumo do PPP que o roteiro já usa), no topo do pedido. */
function blocoContexto(contexto?: string | null): string {
  const c = (contexto || '').trim();
  return c ? 'CONTEXT of the video (company, workplace, role): ' + c + '\n\n' : '';
}

/** O pedido do plano (mensagem do usuário; o sistema é `CATALOGO_V7`). */
export function pedidoDoPlano(cenas: CenaPlano[], contexto?: string | null): string {
  return blocoContexto(contexto) + 'The scenes (times in scene-local seconds; phrase index i is what anchors refer to):\n' +
    JSON.stringify(cenas, null, 1) + '\n\nBuild the moments now.';
}

/** Os modelos usados pelos momentos que NÃO serão refeitos (proibidos na troca). */
export function modelosUsadosForaDosProblemas(resp: RespostaPlano, problemas: Problema[]): string[] {
  const usados = new Set<string>();
  for (const rc of resp.cenas || []) {
    rc.momentos.forEach((m, k) => {
      if (!problemas.some((x) => x.cena === rc.id && x.k === k) && !LIVRES.includes(m.tpl)) usados.add(m.tpl);
    });
  }
  return [...usados];
}

/** O pedido de ajuste: só as cenas com problema, os problemas e os modelos proibidos. */
export function pedidoDeAjuste(resp: RespostaPlano, cenas: CenaPlano[], problemas: Problema[], contexto?: string | null): string {
  const usados = modelosUsadosForaDosProblemas(resp, problemas);
  const so = cenas.filter((c) => problemas.some((x) => x.cena === c.id));
  return blocoContexto(contexto) + 'The scenes (times in scene-local seconds; phrase index i is what anchors refer to):\n' + JSON.stringify(so, null, 1) +
    '\n\nThese moments of the plan must be rewritten: ' + JSON.stringify(problemas) +
    '\nTemplates used by the OTHER moments of the video (forbidden here): ' + JSON.stringify(usados) +
    '\nRewrite ONLY those moments. Each replacement covers exactly the same phrases (when split, consecutive moments that together cover them), uses templates that are NOT in that list and are all different from each other, keeps the ground of the original moment and anchors every element to the phrase that says it.' +
    '\nAnswer JSON only: { "ajustes": [ { "cena": "scene-N", "k": index, "momentos": [ { "frases": [first, last], "tpl": "…", "fundo": "…", "nome": "…", "data": { … } } ] } ] }';
}

/**
 * Aplica a resposta do ajuste, recusando a troca que use modelo proibido, `sob_medida`, modelo fora do catálogo ou
 * o mesmo modelo duas vezes. Muda `resp` (os índices de cada cena são aplicados de trás para frente).
 */
export function aplicarAjustes(resp: RespostaPlano, problemas: Problema[], ajustes: AjusteBruto[], modelos: readonly string[] = MODELOS_CATALOGO_V7): { feitas: string[]; recusadas: number } {
  const usados = new Set(modelosUsadosForaDosProblemas(resp, problemas));
  const feitas: string[] = [];
  let recusadas = 0;
  const lista = (ajustes || []).slice().sort((a, b) => (a.cena === b.cena ? b.k - a.k : 0));
  for (const x of lista) {
    const rc = resp.cenas.find((cc) => cc.id === x.cena), alvo = problemas.find((pp) => pp.cena === x.cena && pp.k === x.k);
    const novos = (x.momentos || []).filter((m) => m && m.tpl && Array.isArray(m.frases));
    const ruim = novos.find((m) => usados.has(m.tpl) || m.tpl === 'sob_medida' || !modelos.includes(m.tpl) ||
      (!LIVRES.includes(m.tpl) && novos.filter((o) => o.tpl === m.tpl).length > 1));
    if (!rc || !alvo || !novos.length || ruim) { recusadas++; continue; }
    novos.sort((a, b) => a.frases[0] - b.frases[0]);
    novos[0].frases[0] = alvo.frases[0];
    novos[novos.length - 1].frases[1] = alvo.frases[1];   // cobre exatamente as frases do original
    rc.momentos.splice(x.k, 1, ...novos);
    novos.forEach((m) => { if (!LIVRES.includes(m.tpl)) usados.add(m.tpl); });
    feitas.push(`${x.cena}/${x.k}: ${alvo.tpl} (${alvo.dur} s) → ${novos.map((m) => m.tpl).join(' + ')}`);
  }
  resp.ajustes_n = (resp.ajustes_n || (resp.ajuste ? 1 : 0)) + 1;
  resp.ajuste = [...(resp.ajuste || []), ...feitas];
  return { feitas, recusadas };
}

/** Se ainda cabe uma rodada de ajuste neste plano. */
export function cabeAjuste(resp: RespostaPlano): boolean {
  return (resp.ajustes_n || (resp.ajuste ? 1 : 0)) < MAX_RODADAS_AJUSTE;
}

// ── Tetos de caracteres (os mesmos do catálogo). Passar do teto não quebra: o modelo encolhe a letra. ─────────────
export const TETO: Record<string, number> = {
  texto_fala: 48, over: 20, rotulo_dest: 24, rotulos: 14, itens: 22, criterio: 28, esq: 16, dir: 16, legenda: 44, titulo: 24, rotulo: 16, valor: 34,
  carimbo: 12, tag: 16, card: 30, inicio: 16, fim: 16, parada: 18, lacuna: 24, linha: 36, lateral: 34, citacao: 70, seta: 18, nova: 24, obstaculo: 20,
  desvio: 20, frase: 70, sub: 60, rotulo_item: 16, ponto: 36, legenda2: 48,
  degrau: 18, rotulo_esc: 44, rotulo_med: 24, marca_med: 12, dia: 6, contador: 16, legenda_cal: 40, lugar: 14, centro_mesa: 24, balao: 16, mensagem: 44,
  nome: 14, ind_rotulo: 18, ind_valor: 8, ad_titulo: 16, ad_item: 26, coluna: 14, cartao: 20, estado: 22, etapa: 18, centro_ciclo: 20, num_valor: 8,
  num_rotulo: 40, contexto: 40, pergunta: 70, opcao: 28, no: 14, centro_rede: 12,
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): unknown => (v && typeof v === 'object' ? (v as Obj).texto : v);

/** Os textos que passam do teto do catálogo ("onde: n/teto "texto""). */
export function conferirTetos(id: string, tpl: string, d: Obj): string[] {
  const excessos: string[] = [];
  const confere = (onde: string, s: unknown, teto: number) => { if (s != null && String(s).length > teto) excessos.push(`${onde}: ${String(s).length}/${teto} "${String(s)}"`); };
  const c = (k: string, s: unknown) => confere(id + ' ' + k, s, TETO[k]);
  for (const f of arr(d.falas)) { confere(id + ' fala', obj(f).texto, TETO.texto_fala); confere(id + ' over', obj(f).over, TETO.over); }
  if (tpl === 'icones') { c('rotulo_dest', obj(d.destaque).rotulo); arr(d.rotulos).forEach((s) => c('rotulos', s)); arr(d.itens).forEach((x) => c('rotulo_item', obj(x).rotulo)); }
  if (tpl === 'imagem') { arr(d.pontos).forEach((x) => c('ponto', obj(x).texto)); c('legenda2', obj(d.legenda).texto); }
  if (tpl === 'filtro') { arr(d.itens).forEach((s) => c('itens', s)); arr(d.criterios).forEach((x) => c('criterio', obj(x).texto)); }
  if (tpl === 'balanca') { c('esq', d.esq); c('dir', d.dir); c('legenda', obj(d.legenda).texto); }
  if (tpl === 'formulario') { c('titulo', d.titulo); arr(d.campos).forEach((x) => { c('rotulo', obj(x).rotulo); c('valor', obj(x).valor); }); c('carimbo', obj(d.carimbo).texto); }
  if (tpl === 'fluxo') { for (const k of ['de', 'para', 'troca']) if (d[k]) { c('tag', obj(d[k]).tag); c('card', obj(d[k]).texto); } }
  if (tpl === 'trajeto') { c('inicio', d.inicio); c('fim', d.fim); arr(d.paradas).forEach((x) => c('parada', obj(x).texto)); c('lacuna', obj(d.lacuna).texto); }
  if (tpl === 'caderno') { c('titulo', d.titulo); arr(d.linhas).forEach((x) => c('linha', obj(x).texto)); c('tag', obj(d.lateral).tag); c('lateral', obj(d.lateral).texto); }
  if (tpl === 'citacao') { c('citacao', d.texto); c('seta', obj(d.seta).rotulo); c('nova', obj(d.troca).nova); }
  if (tpl === 'desvio') { c('obstaculo', d.obstaculo); arr(d.desvios).forEach((x) => c('desvio', obj(x).texto)); }
  if (tpl === 'frase') { c('frase', d.texto); c('sub', obj(d.sub).texto); }
  if (tpl === 'escada') { const ds = arr(d.degraus); ds.forEach((x) => confere(id + ' degrau', txt(x), ds.length >= 5 ? 12 : TETO.degrau)); c('rotulo_esc', obj(d.rotulo).texto); }
  if (tpl === 'medidor') { c('rotulo_med', d.rotulo); c('marca_med', obj(d.marcas).min); c('marca_med', obj(d.marcas).max); }
  if (tpl === 'calendario') { arr(d.dias).forEach((x) => c('dia', txt(x))); c('contador', obj(d.contador).texto); c('legenda_cal', obj(d.legenda).texto); }
  if (tpl === 'reuniao') { arr(d.lugares).forEach((x) => c('lugar', txt(x))); c('centro_mesa', obj(d.centro).texto); }
  if (tpl === 'vozes') { arr(d.baloes).forEach((x) => c('balao', obj(x).texto)); c('rotulo_dest', obj(d.destaque).rotulo); }
  if (tpl === 'conversa') { arr(d.mensagens).forEach((x) => c('mensagem', obj(x).texto)); c('nome', obj(d.nomes).esq); c('nome', obj(d.nomes).dir); }
  if (tpl === 'painel') arr(d.indicadores).forEach((x) => { c('ind_rotulo', obj(x).rotulo); c('ind_valor', obj(x).valor); });
  if (tpl === 'antes_depois') for (const k of ['antes', 'depois']) if (d[k]) { c('ad_titulo', obj(d[k]).titulo); arr(obj(d[k]).itens).forEach((x) => c('ad_item', txt(x))); }
  if (tpl === 'quadro') { arr(d.colunas).forEach((x) => c('coluna', txt(x))); arr(d.cartoes).forEach((x) => c('cartao', obj(x).texto)); }
  if (tpl === 'semaforo') arr(d.estados).forEach((x) => c('estado', txt(x)));
  if (tpl === 'ciclo') { arr(d.etapas).forEach((x) => c('etapa', obj(x).texto)); c('centro_ciclo', obj(d.centro).texto); }
  if (tpl === 'numero') { c('num_valor', d.valor); c('num_rotulo', d.rotulo); c('contexto', obj(d.contexto).texto); }
  if (tpl === 'pergunta') { c('pergunta', d.pergunta); arr(d.opcoes).forEach((x) => c('opcao', txt(x))); }
  if (tpl === 'rede') { c('centro_rede', obj(d.centro).texto); arr(d.nos).forEach((x) => c('no', obj(x).texto)); }
  return excessos;
}

// Ações finais precisam de tempo para acontecer antes de os objetos saírem (a saída começa 0,6 s antes do fim);
// elementos curtos (destaques, trocas) também. O caminho de item de lista vem como "cartoes[0]": sem o índice.
const ACOES = ['tPassa', 'tPesa', 'tMuda', 'some', 'saem', 'tSobe', 'tMove', 'tTroca'];
const CURTAS = ['troca', 'risco', 'carimbo', 'alvo', 'seta', 'lacuna', 'destaque', 'marca', 'escolha', 'alerta', 'contador', 'cartoes'];
export function tetoDeTempo(onde: string, dur: number): number {
  const p = onde.split('.').map((x) => x.replace(/\[\d+\]$/, ''));
  return ACOES.includes(p[p.length - 1]) ? dur - 1.9 : p.some((x) => CURTAS.includes(x)) ? dur - 1.3 : dur - 0.7;
}

/**
 * Da resposta (já ajustada) aos momentos finais, em ordem: encadeia os momentos nas frases, calcula durações,
 * resolve as âncoras e aplica os limites (modelo inexistente e `sob_medida` viram `frase`; a 3ª imagem também).
 * A imagem sai com `arquivo` = `<id>.png` e um pedido de geração em `imagens` (quem chama gera e grava).
 */
export function montarMomentos(resp: RespostaPlano, cenas: CenaPlano[], modelos: readonly string[] = MODELOS_CATALOGO_V7): {
  momentos: MomentoFinal[]; imagens: PedidoImagem[]; avisos: string[]; excessos: string[];
} {
  const momentos: MomentoFinal[] = [], imagens: PedidoImagem[] = [], avisos: string[] = [], excessos: string[] = [];
  const uso: Record<string, number> = {};
  let nImagens = 0;
  for (const c of cenas) {
    const rc = (resp.cenas || []).find((x) => x.id === c.id);
    if (!rc || !rc.momentos?.length) throw new Error('plano sem momentos para ' + c.id);
    const ms = rc.momentos.slice().sort((a, b) => a.frases[0] - b.frases[0]).map((m) => ({ ...m, frases: [m.frases[0], m.frases[1]] as [number, number] }));
    // encadeamento: cada momento começa na frase seguinte ao anterior; o primeiro na 0; o último vai até a última
    ms.forEach((m, k) => {
      const ini = k === 0 ? 0 : ms[k - 1].frases[1] + 1;
      if (m.frases[0] !== ini) avisos.push(`${c.id} momento ${k}: começava na frase ${m.frases[0]}, ajustado para ${ini}`);
      m.frases[0] = ini;
    });
    const ult = c.frases.length - 1;
    if (ms[ms.length - 1].frases[1] !== ult) { avisos.push(`${c.id}: último momento terminava na frase ${ms[ms.length - 1].frases[1]}, ajustado para ${ult}`); ms[ms.length - 1].frases[1] = ult; }
    // o momento começa no meio da pausa antes da sua primeira frase
    const inicios = ms.map((m, k) => {
      if (k === 0) return 0;
      const a = c.frases[m.frases[0]], p = c.frases[m.frases[0] - 1];
      return +Math.max(p.ate, (p.ate + a.de) / 2).toFixed(3);
    });
    ms.forEach((m, k) => {
      const ini = inicios[k], fim = k + 1 < ms.length ? inicios[k + 1] : c.dur, dur = +(fim - ini).toFixed(3);
      let tpl = m.tpl, bruto: Obj = obj(m.data);
      if (tpl === 'sob_medida' || !modelos.includes(tpl)) {
        avisos.push(`${c.id} momento ${k}: modelo "${tpl}" fora da biblioteca, virou frase`);
        const telas = arr(bruto.telas);
        tpl = 'frase'; bruto = { t: '@' + m.frases[0], texto: telas[0] || bruto.texto || bruto.titulo || m.nome || '' };
      }
      if (tpl === 'imagem' && ++nImagens > MAX_IMAGENS) {
        avisos.push(`${c.id} momento ${k}: passou de ${MAX_IMAGENS} imagens, virou frase`);
        const f0 = obj(arr(bruto.falas)[0]);
        tpl = 'frase'; bruto = { t: f0.t || '@' + m.frases[0], texto: f0.texto || m.nome || '', falas: [] };
      }
      const fundo: Fundo = tpl !== 'imagem' && FUNDOS.includes(m.fundo as Fundo) ? (m.fundo as Fundo) : 'navy';
      uso[tpl] = (uso[tpl] || 0) + 1;
      if (dur > 16) avisos.push(`${c.id} momento ${k}: ${dur.toFixed(1)} s (catálogo: no máximo 16 s)`);
      if (uso[tpl] > 1 && !LIVRES.includes(tpl)) avisos.push(`${c.id} momento ${k}: modelo "${tpl}" repetido no vídeo`);
      const id = `${c.id.replace('scene-', 's')}-${k + 1}-${tpl.replace('_', '-')}`;
      const resolve = (v: unknown, onde: string): unknown => {
        if (typeof v === 'string' && ANCORA.test(v)) {
          const n = Number(v.match(ANCORA)![1]);
          const s = segundosDaAncora(v, c.frases);
          if (s == null) { avisos.push(`${onde}: frase ${n} não existe`); return 0.3; }
          if (n < m.frases[0] || n > m.frases[1]) avisos.push(`${onde}: âncora na frase ${n}, fora do momento (${m.frases.join('–')})`);
          return +Math.max(0.15, Math.min(tetoDeTempo(onde, dur), s - ini)).toFixed(2);
        }
        if (Array.isArray(v)) return v.map((x, i) => resolve(x, onde + '[' + i + ']'));
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, resolve(x, onde + '.' + kk)]));
        return v;
      };
      const data = resolve(bruto, id) as Obj;
      excessos.push(...conferirTetos(id, tpl, data));
      if (tpl === 'imagem') {
        const im = obj(data.imagem), lado = (['cheia', 'direita', 'esquerda'].includes(String(data.lado)) ? data.lado : 'cheia') as PedidoImagem['lado'];
        if (im.descricao) { const nome = id + '.png'; imagens.push({ momento: id, nome, descricao: String(im.descricao), lado }); data.arquivo = nome; }
        else avisos.push(`${id}: modelo imagem sem descrição de imagem`);
        delete data.imagem;
      }
      momentos.push({ id, cena: c.id, tpl, nome: m.nome || tpl, data, dur, fundo, frases: m.frases });
    });
  }
  if (nImagens < MAX_IMAGENS) avisos.push(`só ${nImagens} imagem(ns): o catálogo pede ${MAX_IMAGENS}`);
  return { momentos, imagens, avisos, excessos };
}

/** O prompt da ilustração (sempre ilustração, nunca foto: decisão do dono, 16/10/2026), com o local da empresa. */
export function promptDaIlustracao(p: PedidoImagem, contexto?: string | null): string {
  const c = (contexto || '').trim();
  return [
    'Premium EDITORIAL ILLUSTRATION for a corporate microlearning video, 16:9 frame. Deep navy (#142F57) dominant palette with cyan (#34C5CC) and soft purple (#9E4EDD) accents; refined modern illustration / subtle 3D, minimal and atmospheric.',
    'Subject: ' + p.descricao.slice(0, 400),
    c ? 'The place must be clearly recognizable as this workplace (context, in Portuguese): ' + c.slice(0, 300) : '',
    p.lado === 'cheia' ? 'Composition: keep the LEFT 45% calm and dark, almost solid navy (text will be placed there); the subject lives on the RIGHT half.' : 'Composition: the subject centered with breathing room, so it still reads when cropped to a near-square panel.',
    'STRICTLY NO text, NO letters, NO numbers, NO words, NO signage, NO logos, NO brand names, NO watermarks, NO screens with readable content.',
    'NO faces in close-up, NO cartoon, NO clipart, NO childish style.',
  ].filter(Boolean).join(' ');
}
