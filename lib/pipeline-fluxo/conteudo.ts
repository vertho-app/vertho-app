/**
 * Etapa CONTEÚDOS do fluxo completo: a biblioteca (conteúdo-base, `kit_id` nulo) que a TRILHA precisa antes de ser montada.
 *
 * Por que existe (1º teste real, Boehringer, 03/10/2026): a montagem da trilha aborta com "Sem conteúdo para <competência> ×
 * <descritor> × <cargo>" quando a biblioteca da competência está vazia para o cargo, e o fluxo só gerava o Kit DEPOIS da trilha.
 * Conteúdo de kit não serve à montagem de propósito (é de um DISC, entregue por cima na leitura), então numa empresa nova
 * a trilha nunca passava. O que sobra de lacuna aqui é só a ordem: a biblioteca precisa existir antes da trilha.
 *
 * REGRAS (decisão do dono, 03/10):
 *  - gera SÓ o que falta: um descritor da competência foco do cargo que não tem nenhum conteúdo servível ao cargo;
 *  - nos formatos que as pessoas precisam, não por reflexo: a UNIÃO dos 2 primeiros formatos (sem o vídeo, que vem do
 *    pipeline de célula) de quem vai receber a trilha neste cargo; sem preferência = texto + estudo de caso;
 *  - é a biblioteca de quem vai ter a trilha MONTADA nesta rodada (`idsTrilhaProntos`), a mesma fila da etapa seguinte.
 * "Existe" usa os MESMOS helpers de cargo da montagem (`conteudosDoBuild` + `conteudosServiveisPorCargo`), com conteúdo ATIVO
 * da empresa ou do catálogo global. Áudio só vira ativo com o MP3, então o gerador renderiza o áudio.
 */
import { conteudosDoBuild, conteudosServiveisPorCargo } from '@/lib/season-engine/build-season';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
import {
  COLUNAS_PREFERENCIA_KIT, FORMATOS_SEM_PREFERENCIA, ORDEM_FORMATOS_KIT, topDoisFormatos, type FormatoKit,
} from '@/lib/season-engine/kit/formatos-por-preferencia';
import { coletarEntradaPrevia, lerTudoPaginado } from './coletar';
import { idsTrilhaProntos, type EntradaPrevia } from './previa';
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
 * @param tdb escopado ao tenant (leituras da empresa); `tdb.raw` lê o catálogo GLOBAL (`empresa_id` nulo), que também serve à montagem.
 */
export async function filaConteudoEscopo(
  tdb: any,
  escopo: { permitidos: Set<string> | null; cargos?: string[]; incluirInternos?: string[] },
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

  // Por cargo: competências foco, formatos da biblioteca.
  const cargoPorNome = new Map(entrada.cargos.map((x) => [x.nome, x]));
  const porCargo = new Map<string, any[]>();
  for (const p of pessoasProntas) {
    if (!p.cargo) continue;
    (porCargo.get(p.cargo) || porCargo.set(p.cargo, []).get(p.cargo)!).push(prefDe.get(p.id) || {});
  }
  const comps = new Set<string>();
  for (const cargo of porCargo.keys()) for (const f of cargoPorNome.get(cargo)?.foco || []) comps.add(f);
  if (comps.size === 0) return [];

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
  for (const [cargo, pessoas] of porCargo) {
    const formatos = formatosDaBiblioteca(pessoas);
    for (const comp of cargoPorNome.get(cargo)?.foco || []) {
      const descritores = descritoresDe(comp, cargo).length ? descritoresDe(comp, cargo) : descritoresBase(comp);
      for (const desc of descritores) {
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
  }
  return itens;
}
