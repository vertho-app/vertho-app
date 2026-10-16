/**
 * Etapa CONTEÚDOS do fluxo completo: a biblioteca (conteúdo-base, `kit_id` nulo) que a TRILHA precisa antes de ser montada.
 *
 * Por que existe (1º teste real, Boehringer, 03/10/2026): a montagem da trilha aborta com "Sem conteúdo para <competência> ×
 * <descritor> × <cargo>" quando a biblioteca da competência está vazia para o cargo, e o fluxo só gerava o Kit DEPOIS da trilha.
 * Conteúdo de kit não serve à montagem de propósito (é de um DISC, entregue por cima na leitura), então numa empresa nova
 * a trilha nunca passava. O que sobra de lacuna aqui é só a ordem: a biblioteca precisa existir antes da trilha.
 *
 * REGRAS (decisão do dono, 03/10):
 *  - gera SÓ o que falta: um descritor da competência foco (a da pessoa, ou a do cargo) que não tem nenhum conteúdo
 *    servível ao cargo;
 *  - nos formatos que as pessoas precisam, não por reflexo: a UNIÃO dos 2 primeiros formatos (sem o vídeo, que vem do
 *    pipeline de célula) de quem vai receber a trilha neste cargo; sem preferência = texto + estudo de caso;
 *  - é a biblioteca de quem vai ter a trilha MONTADA nesta rodada (`idsTrilhaProntos`), a mesma fila da etapa seguinte.
 * "Existe" usa os MESMOS helpers de cargo da montagem (`conteudosDoBuild` + `conteudosServiveisPorCargo`), com conteúdo ATIVO
 * da empresa ou do catálogo global. Áudio só vira ativo com o MP3, então o gerador renderiza o áudio.
 *
 * Descritor que NINGUÉM do par vai estudar (nota ≥ 3.0, sem pílula pela regra do dono de 15/10) não entra na fila
 * (pedido do dono, 16/10/2026: na Amazon a biblioteca gerava os 6 descritores de cada competência, inclusive o que
 * estava em N3). O corte é conservador: ver `descritoresSemPilula`.
 */
import { conteudosDoBuild, conteudosServiveisPorCargo } from '@/lib/season-engine/build-season';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
import { LIMIAR_SEM_LACUNA } from '@/lib/season-engine/select-descriptors';
import { getProgramaConfigDaGeracao, normalizarModoPrograma } from '@/lib/season-engine/programa-config';
import { carregarConfigsEfetivasEmLote } from '@/lib/turmas/contexto';
import {
  COLUNAS_PREFERENCIA_KIT, FORMATOS_SEM_PREFERENCIA, ORDEM_FORMATOS_KIT, topDoisFormatos, type FormatoKit,
} from '@/lib/season-engine/kit/formatos-por-preferencia';
import { coletarEntradaPrevia, lerTudoPaginado } from './coletar';
import { focoEfetivo, idsTrilhaProntos, type EntradaPrevia } from './previa';
import type { ConteudoItem } from './executor';

/** Formatos de biblioteca de um cargo: união dos 2 primeiros de cada pessoa, SEM o vídeo; sem preferência = texto + caso. */
export function formatosDaBiblioteca(pessoas: any[]): FormatoKit[] {
  const conjunto = new Set<FormatoKit>();
  for (const p of pessoas) {
    const top = topDoisFormatos(p);
    if (!top) { for (const f of FORMATOS_SEM_PREFERENCIA) conjunto.add(f); continue; }
    for (const f of top) if (f !== 'video') conjunto.add(f);
  }
  // Quem só tem vídeo e um formato fora do kit... não existe: o top 2 sempre traz ao menos um formato de conteúdo.
  if (!conjunto.size) for (const f of FORMATOS_SEM_PREFERENCIA) conjunto.add(f);
  return ORDEM_FORMATOS_KIT.filter((f) => conjunto.has(f));
}

const chave = (comp: string, desc: string, cargo: string) => `${comp}\u0001${normDescritor(desc)}\u0001${cargo}`;

/**
 * Descritores (normalizados) que a montagem da trilha NÃO vai usar para UMA pessoa numa competência: os de nota ≥ 3.0
 * (N3/N4 não têm pílula, regra do dono de 15/10/2026).
 *
 * CONSERVADOR de propósito. Cortar um descritor que a trilha usa faz a montagem abortar ("Sem conteúdo para ..."), e
 * rodar de novo não conserta, porque a fila cortaria o mesmo descritor. Então só corta quando TODOS os seletores
 * garantem que ele sai:
 *  - Piloto: não corta (`selectDescriptorsPiloto` completa as vagas com descritores sem lacuna);
 *  - menos de 2 descritores com lacuna (ou menos que os conteúdos por semana do programa): não corta. O adapter do
 *    blueprint e o Onboarding deixam o sem-lacuna na semana quando não há outro com lacuna para pôr no lugar, e o
 *    `selectDescriptors` puxa proficiente quando não há lacuna nenhuma;
 *  - descritor com nota não numérica, ou com linhas que divergem (uma < 3.0 e outra ≥ 3.0): não corta, nem conta como
 *    lacuna.
 * A nota é lida como a trilha lê (`Number(nota)`: vazia vira 0, que é lacuna). O teste roda os seletores de verdade
 * sobre estes casos (`conteudo-corte.test.ts`).
 */
export function descritoresSemPilula(
  notas: Array<{ descritor: string; nota: unknown }>,
  ctx: { modo: string; conteudosPorSemana?: number | null },
): Set<string> {
  if (ctx.modo === 'piloto' || !notas.length) return new Set();
  const porDescritor = new Map<string, number[]>();
  for (const n of notas) {
    const k = normDescritor(String(n.descritor || ''));
    if (!k) continue;
    const lista = porDescritor.get(k) || porDescritor.set(k, []).get(k)!;
    lista.push(Number(n.nota));
  }
  const listas = [...porDescritor.entries()];
  const comLacuna = listas.filter(([, ns]) => ns.every((x) => x < LIMIAR_SEM_LACUNA)).length;
  if (comLacuna < Math.max(2, Number(ctx.conteudosPorSemana) || 1)) return new Set();
  return new Set(listas.filter(([, ns]) => ns.every((x) => x >= LIMIAR_SEM_LACUNA)).map(([k]) => k));
}

/**
 * `descritoresSemPilula` de cada pessoa em cada competência, com o programa resolvido como a GERAÇÃO resolve
 * (participação, turma, pessoa, empresa). Falha de qualquer leitura devolve `null` (não corta nada, a biblioteca sai
 * completa como antes): a falha de uma economia não pode travar a biblioteca de todo mundo.
 */
async function lerSemPilula(tdb: any, empresaId: string, ids: string[], comps: string[]): Promise<Map<string, Map<string, Set<string>>> | null> {
  try {
    const notas: any[] = [];
    const modoBruto = new Map<string, string | null>();
    for (let i = 0; i < ids.length; i += 150) {
      const lote = ids.slice(i, i + 150);
      const q = await lerTudoPaginado((de, ate) => tdb.from('descriptor_assessments').select('id, colaborador_id, competencia, descritor, nota')
        .in('colaborador_id', lote).in('competencia', comps).order('id').range(de, ate));
      if (q.error) throw new Error(`notas dos descritores: ${q.error}`);
      notas.push(...q.data);
      const { data, error } = await tdb.from('colaboradores').select('id, programa_modo').in('id', lote);
      if (error) throw new Error(`programa das pessoas: ${error.message}`);
      for (const c of data || []) modoBruto.set(c.id, c.programa_modo ?? null);
    }
    const { data: emp, error: errEmp } = await tdb.raw.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
    if (errEmp) throw new Error(`configuração da empresa: ${errEmp.message}`);
    const configs = await carregarConfigsEfetivasEmLote(tdb.raw, empresaId, ids.map((id) => ({ id, programa_modo: modoBruto.get(id) ?? null })), emp?.sys_config || {});

    const notasDe = new Map<string, any[]>();
    for (const n of notas) {
      const k = `${n.colaborador_id}\u0001${n.competencia}`;
      (notasDe.get(k) || notasDe.set(k, []).get(k)!).push(n);
    }
    const out = new Map<string, Map<string, Set<string>>>();
    for (const id of ids) {
      const cfg = configs.get(id);
      if (!cfg) continue; // programa não resolvido: não corta nada desta pessoa
      const ctx = { modo: normalizarModoPrograma(cfg.programa_modo), conteudosPorSemana: getProgramaConfigDaGeracao(cfg).conteudosPorSemana };
      out.set(id, new Map(comps.map((comp) => [comp, descritoresSemPilula(notasDe.get(`${id}\u0001${comp}`) || [], ctx)])));
    }
    return out;
  } catch (e: any) {
    console.warn(`[fluxo/conteúdos] corte dos descritores sem pílula desligado nesta leitura (a biblioteca sai completa): ${e?.message || e}`);
    return null;
  }
}

/**
 * @param tdb escopado ao tenant (leituras da empresa); `tdb.raw` lê o catálogo GLOBAL (`empresa_id` nulo), que também serve à montagem.
 */
export async function filaConteudoEscopo(
  tdb: any,
  /** `empresaId` liga o corte dos descritores sem pílula (sem ele, a fila sai como antes, com todos os descritores). */
  escopo: { permitidos: Set<string> | null; cargos?: string[]; incluirInternos?: string[]; empresaId?: string },
  /** A prévia já coletou o estado da empresa: reaproveita em vez de ler tudo duas vezes. */
  entradaPronta?: EntradaPrevia,
): Promise<ConteudoItem[]> {
  let entrada = entradaPronta;
  if (!entrada) {
    const c = await coletarEntradaPrevia(tdb, { permitidos: escopo.permitidos, cargos: escopo.cargos, incluirInternos: escopo.incluirInternos });
    if (c.error || !c.entrada) throw new Error(`fila de conteúdos: ${c.error || 'sem dados'}`);
    entrada = c.entrada;
  }

  const prontos = new Set(idsTrilhaProntos(entrada));
  if (prontos.size === 0) return [];
  const pessoasProntas = entrada.pessoas.filter((p) => prontos.has(p.id));

  // Preferências de quem vai ter trilha montada (as pessoas do `coletar` não carregam as colunas pref_*).
  const idsProntos = [...prontos];
  const prefs: any[] = [];
  for (let i = 0; i < idsProntos.length; i += 150) {
    const { data, error } = await tdb.from('colaboradores').select(`id, ${COLUNAS_PREFERENCIA_KIT}`).in('id', idsProntos.slice(i, i + 150));
    if (error) throw new Error(`preferências das pessoas: ${error.message}`);
    prefs.push(...(data || []));
  }
  const prefDe = new Map<string, any>(prefs.map((p) => [p.id, p]));

  // Por PAR (cargo × competência): a competência de CADA pessoa (a dela vence a do cargo, `focoEfetivo`) e os formatos
  // da biblioteca de quem vai receber aquela competência naquele cargo. Iterar por cargo lendo o foco do cargo deixava
  // de fora quem tem foco próprio (Amazon, 15/10/2026: 4 pessoas no mesmo cargo, competências diferentes). Com o foco
  // só do cargo, todo mundo do cargo cai nos mesmos pares e o resultado é o de antes.
  const cargoPorNome = new Map(entrada.cargos.map((x) => [x.nome, x]));
  const porPar = new Map<string, { cargo: string; comp: string; pessoas: any[]; ids: string[] }>();
  for (const p of pessoasProntas) {
    if (!p.cargo) continue;
    for (const comp of focoEfetivo(p, cargoPorNome)) {
      const k = `${p.cargo}\u0001${comp}`;
      const par = porPar.get(k) || porPar.set(k, { cargo: p.cargo, comp, pessoas: [], ids: [] }).get(k)!;
      par.pessoas.push(prefDe.get(p.id) || {});
      par.ids.push(p.id);
    }
  }
  const comps = new Set<string>([...porPar.values()].map((x) => x.comp));
  if (comps.size === 0) return [];

  // Descritor que NINGUÉM do par vai estudar sai da fila: o corte do par é a INTERSEÇÃO dos cortes das pessoas (basta
  // uma precisar do descritor para ele ficar). Sem `empresaId` ou com falha de leitura, não corta nada.
  const semPilula = escopo.empresaId ? await lerSemPilula(tdb, escopo.empresaId, idsProntos, [...comps]) : null;
  const corteDoPar = (par: { comp: string; ids: string[] }): Set<string> => {
    if (!semPilula) return new Set();
    let inter: Set<string> | null = null;
    for (const id of par.ids) {
      const s = semPilula.get(id)?.get(par.comp);
      if (!s || s.size === 0) return new Set();
      inter = inter ? new Set([...inter].filter((x) => s.has(x))) : new Set(s);
    }
    return inter || new Set();
  };

  // Descritores de cada competência POR CARGO (o catálogo é por cargo); sem linha da empresa, cai no catálogo base.
  const compsArr = [...comps];
  const empQ = await lerTudoPaginado((de, ate) => tdb.from('competencias').select('nome, cargo, nome_curto').in('nome', compsArr).not('nome_curto', 'is', null).order('id').range(de, ate));
  if (empQ.error) throw new Error(`competências: ${empQ.error}`);
  const descritoresDe = (comp: string, cargo: string): string[] => {
    const doCargo = empQ.data.filter((r: any) => r.nome === comp && String(r.cargo || '').trim() === cargo).map((r: any) => String(r.nome_curto));
    return [...new Set(doCargo)];
  };
  const semLinha = compsArr.filter((comp) => !empQ.data.some((r: any) => r.nome === comp));
  const base: any[] = [];
  if (semLinha.length) {
    const { data, error } = await tdb.raw.from('competencias_base').select('nome, nome_curto').in('nome', semLinha).not('nome_curto', 'is', null);
    if (error) throw new Error(`competências base: ${error.message}`);
    base.push(...(data || []));
  }
  const descritoresBase = (comp: string) => [...new Set(base.filter((r) => r.nome === comp).map((r) => String(r.nome_curto)))];

  // O que JÁ existe: conteúdo ativo, de biblioteca, da empresa ou global (a mesma leitura da montagem, sem o recorte por nível).
  const empC = await lerTudoPaginado((de, ate) => tdb.from('micro_conteudos').select('competencia, descritor, cargo, kit_id, disc')
    .eq('ativo', true).is('kit_id', null).is('disc', null).in('competencia', compsArr).order('id').range(de, ate));
  if (empC.error) throw new Error(`conteúdos da empresa: ${empC.error}`);
  const gloC = await lerTudoPaginado((de, ate) => tdb.raw.from('micro_conteudos').select('competencia, descritor, cargo, kit_id, disc')
    .eq('ativo', true).is('kit_id', null).is('disc', null).is('empresa_id', null).in('competencia', compsArr).order('id').range(de, ate));
  if (gloC.error) throw new Error(`conteúdos globais: ${gloC.error}`);
  const existentes = [...empC.data, ...gloC.data];

  const itens: ConteudoItem[] = [];
  const vistos = new Set<string>();
  for (const par of porPar.values()) {
    const { cargo, comp, pessoas } = par;
    const formatos = formatosDaBiblioteca(pessoas);
    const descritores = descritoresDe(comp, cargo).length ? descritoresDe(comp, cargo) : descritoresBase(comp);
    const corte = corteDoPar(par);
    for (const desc of descritores) {
      if (corte.has(normDescritor(desc))) continue;
      const servem = conteudosServiveisPorCargo(conteudosDoBuild(existentes.filter((x: any) => x.competencia === comp && normDescritor(String(x.descritor || '')) === normDescritor(desc))), cargo);
      if (servem.length > 0) continue;
      for (const formato of formatos) {
        const k = `${chave(comp, desc, cargo)}\u0001${formato}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        itens.push({ competencia: comp, descritor: desc, cargo, formato });
      }
    }
  }
  return itens;
}
