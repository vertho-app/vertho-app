/**
 * Pré-requisitos do fluxo completo: o que PODE FALTAR antes de apertar "Rodar", dito em palavras, com quantos e como resolver.
 * Função PURA (sem rede): quem lê o banco e o ambiente é `prerequisitos-coleta.ts`, e este arquivo só decide.
 *
 * Por que existe (1º teste real, Boehringer, 03 a 06/10/2026): cinco coisas faltavam e cada uma só aparecia DEPOIS de gastar IA,
 * ou nem aparecia (pessoa sem DISC some do Kit sem aviso). A prévia diz quem está pronto por etapa; isto diz o que está
 * faltando NA BASE da empresa para o resultado sair do jeito esperado:
 *   1. módulo-base publicado para a competência foco (sem ele o Kit da competência falha);
 *   2. DISC das pessoas (sem DISC a pessoa fica fora do Kit, do vídeo e da saudação);
 *   3. programa da empresa × competências do cargo (DUO exige 2 competências resolvíveis no cargo);
 *   4. preferências de aprendizagem (quem não respondeu cai em texto + estudo de caso);
 *   5. infraestrutura de render (vídeo).
 *
 * Gravidade: `critico` = o que o item descreve VAI falhar para quem for afetado; `atencao` = roda, mas o resultado sai diferente do
 * esperado ou não deu para medir; `ok` = conferido. É AVISO, nunca recusa: o dono pode rodar mesmo assim (cargos sem o problema
 * seguem normalmente), e a tela só pede uma confirmação a mais. Item que NÃO foi possível medir nunca vira `ok`: desconhecido
 * não é zero.
 */
import { temPreferenciaDoKit, videoNoTopDois } from '@/lib/season-engine/kit/formatos-por-preferencia';

export type GravidadePrereq = 'ok' | 'atencao' | 'critico';
export type IdPrereq = 'modulo-base' | 'disc' | 'programa' | 'preferencias' | 'render';

export interface Prerequisito {
  id: IdPrereq;
  titulo: string;
  gravidade: GravidadePrereq;
  /** Uma frase com o veredito (já com os números). */
  resumo: string;
  /** Quantas pessoas, cargos ou competências o item afeta (0 quando está ok). */
  quantidade: number;
  /** Até `MAX_EXEMPLOS` nomes para a pessoa reconhecer o caso. */
  exemplos: string[];
  /** O que fazer para resolver; `null` quando está ok. */
  comoResolver: string | null;
}

export interface PrerequisitosFluxo {
  itens: Prerequisito[];
  criticos: number;
  atencoes: number;
}

export const MAX_EXEMPLOS = 5;

/** Uma pessoa do escopo, com as colunas que o Kit lê (`perfil_dominante` e `pref_*`) e o programa efetivo dela. */
export interface PessoaPrereq {
  id: string;
  nome: string;
  cargo: string | null;
  colab: { perfil_dominante?: string | null; [pref: string]: any };
  /**
   * Rótulo do programa EFETIVO da pessoa, na precedência da geração (participação, turma, pessoa, empresa): `jornada`,
   * `regular_duo`, `onboarding`... Vem de `carregarConfigsEfetivasEmLote`, a mesma leitura da prontidão da trilha.
   */
  modo: string;
  /** Quantas competências o DUO resolveria para ela (`competenciasQueODuoResolve`). Só pesa quando `modo` é `regular_duo`. */
  competenciasDuo: number;
}

/** Resultado da consulta de módulo-base de um par (cargo, competência foco). */
export interface ModuloBaseDoPar {
  cargo: string;
  competencia: string;
  achou: boolean;
}

/**
 * Quantas competências o Regular DUO resolve para uma pessoa: o foco do cargo (até 2), senão `competencias_regular_duo` da config
 * efetiva, senão o foco somado ao top 10 do cargo. É a mesma ordem de `gerarTemporadaRegularDuo` (trilha-core), em versão de
 * CONTAGEM: o DUO precisa de 2, e com menos o build ABORTA ("DUO indisponível"). Projeção, não a decisão: quem decide é a etapa
 * da trilha (que ainda exige avaliação nas duas competências).
 */
export function competenciasQueODuoResolve(f: { foco: string[]; regularDuo?: unknown; top10Nomes: string[] }): number {
  const doFoco = Math.min(2, f.foco.length);
  const config = Array.isArray(f.regularDuo) ? Math.min(2, f.regularDuo.filter(Boolean).length) : 0;
  const somadas = new Set([...f.foco, ...f.top10Nomes].filter(Boolean)).size;
  return Math.max(doFoco, config, Math.min(2, somadas));
}

export interface InfraRenderPrereq {
  temToken: boolean;
  temSnapshot: boolean;
  temDatabaseUrl: boolean;
}

export interface EntradaPrerequisitos {
  pessoas: PessoaPrereq[];
  cargos: Array<{ nome: string; foco: string[] }>;
  /** `{ erro }` = a leitura falhou (o item sai como "não deu para medir", nunca como ok). */
  moduloBase: ModuloBaseDoPar[] | { erro: string };
  /** A leitura do programa efetivo falhou: o item "programa" sai como não medido (as pessoas trazem `modo` de qualquer jeito). */
  programaErro?: string | null;
  /** Pessoas sem leitura das colunas (falha ao ler `colaboradores`): `perfil_dominante` e preferências não puderam ser medidos. */
  colaboradoresErro?: string | null;
  render: InfraRenderPrereq;
}

const ROTULO_MODO: Record<string, string> = {
  jornada: 'Jornada', regular_duo: 'Regular DUO', regular_single: 'Regular single', onboarding: 'Onboarding', piloto: 'Piloto', custom: 'Personalizado',
};

const lista = (itens: string[]) => itens.slice(0, MAX_EXEMPLOS);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const naoMediu = (id: IdPrereq, titulo: string, erro: string): Prerequisito => ({
  id, titulo, gravidade: 'atencao', quantidade: 1, exemplos: [],
  resumo: `Não foi possível medir: ${erro}`,
  comoResolver: 'Atualize a tela. Se persistir, o fluxo ainda pode rodar, mas este ponto não foi conferido.',
});

// 1) Módulo-base ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

function checarModuloBase(e: EntradaPrerequisitos): Prerequisito {
  const titulo = 'Módulo-base publicado para a competência foco';
  if ('erro' in e.moduloBase) return naoMediu('modulo-base', titulo, e.moduloBase.erro);
  const pares = e.moduloBase;
  if (pares.length === 0) {
    return {
      id: 'modulo-base', titulo, gravidade: 'atencao', quantidade: 0, exemplos: [],
      resumo: 'Nenhum cargo com gente no escopo tem competência foco definida, então não há módulo-base a conferir.',
      comoResolver: 'Defina o foco do cargo (competência foco) antes de rodar.',
    };
  }
  const faltam = pares.filter((p) => !p.achou);
  if (faltam.length === 0) {
    return { id: 'modulo-base', titulo, gravidade: 'ok', quantidade: 0, exemplos: [], resumo: `Conferido: as ${plural(pares.length, 'competência foco', 'competências foco')} do escopo têm módulo-base publicado.`, comoResolver: null };
  }
  return {
    id: 'modulo-base', titulo, gravidade: 'critico', quantidade: faltam.length,
    exemplos: lista(faltam.map((p) => `${p.cargo}: ${p.competencia}`)),
    resumo: `${plural(faltam.length, 'competência foco sem módulo-base publicado', 'competências foco sem módulo-base publicado')} (de ${pares.length}). O Kit dessas competências vai falhar com "publique um módulo-base".`,
    comoResolver: 'Publique o módulo-base da competência para esse cargo no catálogo de módulos (a trilha e a biblioteca saem sem ele, o Kit não). Depois atualize esta tela.',
  };
}

// 2) DISC ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const temDisc = (p: PessoaPrereq) => String(p.colab?.perfil_dominante || '').trim().length > 0;

function checarDisc(e: EntradaPrerequisitos): Prerequisito {
  const titulo = 'DISC das pessoas';
  if (e.colaboradoresErro) return naoMediu('disc', titulo, e.colaboradoresErro);
  const total = e.pessoas.length;
  const sem = e.pessoas.filter((p) => !temDisc(p));
  if (total === 0) {
    return { id: 'disc', titulo, gravidade: 'atencao', quantidade: 0, exemplos: [], resumo: 'Nenhuma pessoa no escopo.', comoResolver: 'Escolha a turma ou o cargo com gente.' };
  }
  if (sem.length === 0) {
    return { id: 'disc', titulo, gravidade: 'ok', quantidade: 0, exemplos: [], resumo: `Conferido: as ${total} pessoas do escopo têm DISC.`, comoResolver: null };
  }
  const todos = sem.length === total;
  return {
    id: 'disc', titulo, gravidade: todos ? 'critico' : 'atencao', quantidade: sem.length,
    exemplos: lista(sem.map((p) => p.nome)),
    resumo: todos
      ? `Ninguém no escopo tem DISC: o Kit, o vídeo e a saudação não saem para nenhuma das ${total} pessoas.`
      : `${sem.length} de ${total} pessoas sem DISC. Elas seguem no PDI e na trilha, mas ficam FORA do Kit, do vídeo e da saudação, sem nenhum aviso depois.`,
    comoResolver: 'Peça que façam o mapeamento comportamental (DISC), ou lance o perfil no cadastro da pessoa. Quem completar depois entra na próxima rodada.',
  };
}

// 3) Programa × competências do cargo ──────────────────────────────────────────────────────────────────────────────────────────

function checarPrograma(e: EntradaPrerequisitos): Prerequisito {
  const titulo = 'Programa × competências do cargo';
  if (e.programaErro) return naoMediu('programa', titulo, e.programaErro);
  if (e.pessoas.length === 0) {
    return { id: 'programa', titulo, gravidade: 'atencao', quantidade: 0, exemplos: [], resumo: 'Nenhuma pessoa no escopo.', comoResolver: 'Escolha a turma ou o cargo com gente.' };
  }
  const porModo = new Map<string, number>();
  for (const p of e.pessoas) porModo.set(p.modo, (porModo.get(p.modo) || 0) + 1);
  const distribuicao = [...porModo].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${ROTULO_MODO[m] || m} (${n})`).join(', ');
  const duo = e.pessoas.filter((p) => p.modo === 'regular_duo');
  const curtas = duo.filter((p) => p.competenciasDuo < 2);
  if (curtas.length === 0) {
    return {
      id: 'programa', titulo, gravidade: 'ok', quantidade: 0, exemplos: [],
      resumo: `Programa efetivo por pessoa: ${distribuicao}.${duo.length ? ' No DUO cada pessoa precisa de 2 competências; os cargos do escopo resolvem 2 (a avaliação das duas só se confirma na etapa da trilha).' : ''}`,
      comoResolver: null,
    };
  }
  const porCargo = new Map<string, { n: number; comps: number }>();
  for (const p of curtas) {
    const k = p.cargo || '(sem cargo)';
    const g = porCargo.get(k) || { n: 0, comps: p.competenciasDuo };
    g.n++;
    porCargo.set(k, g);
  }
  return {
    id: 'programa', titulo, gravidade: 'critico', quantidade: curtas.length,
    exemplos: lista([...porCargo].map(([c, g]) => `${c}: ${plural(g.n, 'pessoa', 'pessoas')}, o cargo resolve ${g.comps} competência(s)`)),
    resumo: `${plural(curtas.length, 'pessoa está', 'pessoas estão')} em programa DUO (2 competências), mas o cargo dela resolve menos de 2. A trilha dessas pessoas vai abortar com "DUO indisponível". Programa efetivo: ${distribuicao}.`,
    comoResolver: 'Troque o programa da empresa (ou da turma) para Jornada, que usa 1 competência por pessoa, ou cadastre a 2ª competência foco do cargo.',
  };
}

// 4) Preferências de aprendizagem ──────────────────────────────────────────────────────────────────────────────────────────────

function checarPreferencias(e: EntradaPrerequisitos): Prerequisito {
  const titulo = 'Preferências de aprendizagem';
  if (e.colaboradoresErro) return naoMediu('preferencias', titulo, e.colaboradoresErro);
  const total = e.pessoas.length;
  const sem = e.pessoas.filter((p) => !temPreferenciaDoKit(p.colab));
  if (total === 0) {
    return { id: 'preferencias', titulo, gravidade: 'atencao', quantidade: 0, exemplos: [], resumo: 'Nenhuma pessoa no escopo.', comoResolver: 'Escolha a turma ou o cargo com gente.' };
  }
  if (sem.length === 0) {
    return { id: 'preferencias', titulo, gravidade: 'ok', quantidade: 0, exemplos: [], resumo: `Conferido: as ${total} pessoas do escopo responderam as preferências.`, comoResolver: null };
  }
  return {
    id: 'preferencias', titulo, gravidade: 'atencao', quantidade: sem.length,
    exemplos: lista(sem.map((p) => p.nome)),
    resumo: `${sem.length} de ${total} pessoas não responderam as preferências. Elas recebem texto + estudo de caso, sem vídeo nem podcast, mesmo que prefiram outro formato.`,
    comoResolver: 'Peça que respondam a tela de preferências de aprendizagem antes da rodada. Quem responder depois só vê a mudança nos kits seguintes.',
  };
}

// 5) Render (vídeo) ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function checarRender(e: EntradaPrerequisitos): Prerequisito {
  const titulo = 'Infraestrutura de vídeo (render)';
  if (e.colaboradoresErro) return naoMediu('render', titulo, e.colaboradoresErro);
  const comVideo = e.pessoas.filter((p) => videoNoTopDois(p.colab));
  if (comVideo.length === 0) {
    return { id: 'render', titulo, gravidade: 'ok', quantidade: 0, exemplos: [], resumo: 'Ninguém no escopo tem vídeo entre os 2 formatos preferidos, então não há vídeo a renderizar.', comoResolver: null };
  }
  const faltando = [
    !e.render.temToken && 'HCLOUD_TOKEN',
    !e.render.temSnapshot && 'RENDER_SNAPSHOT_ID',
    !e.render.temDatabaseUrl && 'DATABASE_URL',
  ].filter(Boolean) as string[];
  if (faltando.length === 0) {
    return {
      id: 'render', titulo, gravidade: 'ok', quantidade: 0, exemplos: [],
      resumo: `${plural(comVideo.length, 'pessoa tem', 'pessoas têm')} vídeo entre os 2 formatos. As variáveis do render estão presentes na plataforma; as do Trigger.dev (onde o vídeo roda de fato) não são visíveis daqui.`,
      comoResolver: null,
    };
  }
  return {
    id: 'render', titulo, gravidade: 'atencao', quantidade: faltando.length,
    exemplos: faltando,
    resumo: `${plural(comVideo.length, 'pessoa tem', 'pessoas têm')} vídeo entre os 2 formatos, mas faltam na plataforma: ${faltando.join(', ')}. O vídeo roda no Trigger.dev, que tem as próprias variáveis; confira lá também.`,
    comoResolver: 'Confirme as variáveis do render na Vercel e no Trigger.dev (snapshot atual do worker). Sem elas o vídeo não é gerado e a entrega usa o vídeo genérico.',
  };
}

export function montarPrerequisitos(e: EntradaPrerequisitos): PrerequisitosFluxo {
  const itens = [checarModuloBase(e), checarPrograma(e), checarDisc(e), checarPreferencias(e), checarRender(e)];
  return {
    itens,
    criticos: itens.filter((i) => i.gravidade === 'critico').length,
    atencoes: itens.filter((i) => i.gravidade === 'atencao').length,
  };
}
