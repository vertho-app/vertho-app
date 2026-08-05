/**
 * Entrega do KIT na semana (Fase 4): faz o overlay do conteúdo do kit no
 * `conteudo` da semana — os formatos (texto/caso/áudio do kit, por DISC) viram
 * os `formatos_disponiveis`, o `formato_core` vira o formato PREFERIDO da pessoa
 * (principal; os outros = apoio, via switch que já existe), e o `desafio_texto`
 * vira o desafio do kit. O VÍDEO segue resolvido pelo pipeline de célula
 * (resolverVideoDaSemana) — só preservamos a entrada dele. Aditivo: sem kit, o
 * conteúdo antigo (buildSeason) permanece. Ver docs/KIT-SEMANAL.md.
 */
import { resolverDesafioDoKit, cargoServe } from './desafio-semana';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { normDescritor } from '@/lib/blueprint/to-descriptors';

const FMTS = ['video', 'audio', 'texto', 'case'] as const;
export type Formato = (typeof FMTS)[number];

/** Formato de aprendizagem PREFERIDO do colaborador (entre os 4 do kit). */
export function formatoPreferido(colab: any): Formato {
  const scores: Record<Formato, number> = {
    video: Math.max(Number(colab?.pref_video_curto) || 0, Number(colab?.pref_video_longo) || 0),
    audio: Number(colab?.pref_audio) || 0,
    texto: Number(colab?.pref_texto) || 0,
    case: Number(colab?.pref_estudo_caso) || 0,
  };
  // Default = video quando nada está setado (bestN começa em 0; só prefs > 0 ganham).
  let best: Formato = 'video';
  let bestN = 0;
  for (const f of FMTS) if (scores[f] > bestN) { bestN = scores[f]; best = f; }
  return best;
}

/** Resolve o kit (por DISC) e seus formatos de leitura/áudio (micro_conteudos). */
export async function resolverKitDaSemana(
  sb: any,
  args: { empresaId: string | null; competencia: string | null; descritor: string | null; disc: string | null; cargo?: string | null },
): Promise<{ kitId: string; desafio: any; formatos: Record<string, { id: string; url: string | null; titulo: string }> } | null> {
  const d = await resolverDesafioDoKit(sb, args);
  if (!d) return null;
  // ORDEM DETERMINÍSTICA: re-runs de geração empilham cópias do MESMO formato sob o
  // mesmo kit_id (a idempotência é pulada quando vem de kit — FMEA-PIPELINE 1.5), e
  // sem ORDER BY o merge abaixo servia uma cópia ARBITRÁRIA (ordem do Postgres).
  // Regra: a cópia mais RECENTE vence (created_at desc, desempate por id desc) — a
  // mesma que a entrega de vídeo já usa (gerar-video.ts:136 `.order('created_at',
  // desc).limit(1)`): a geração mais nova é a que o admin refez por último. Como o
  // merge é "primeiro que chega fica", a ordem desc garante o mais recente. MESMA
  // regra em `precarregarKits` — os dois resolvedores precisam escolher a mesma cópia.
  const { data: conteudos } = await sb.from('micro_conteudos')
    .select('id, formato, url, titulo').eq('kit_id', d.kitId)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  const formatos: Record<string, { id: string; url: string | null; titulo: string }> = {};
  for (const c of conteudos || []) {
    if (c.formato === 'video') continue; // vídeo é do pipeline de célula (resolverVideoDaSemana)
    if (formatos[c.formato]) continue; // duplicata de kit: a mais recente (1ª na ordem) já ficou
    // A entrega é por ID, não por url — MESMA regra de `precarregarKits` (ver o
    // comentário longo lá). Este caminho exigia `url` para texto/case e, por isso,
    // escondia formato válido: `gerarConteudoIA` grava url=null quando o PDF headless
    // falha, e a tela abre `/api/conteudo/{id}/pdf`, que renderiza no runtime. Os dois
    // resolvedores precisam concordar: este é o fallback de `overlayConteudo` quando
    // o pré-carregamento falha (temporadas.ts:488 tem `.catch(() => undefined)`), e
    // divergir fazia a mesma pessoa ver 3 formatos ou 1 dependendo de uma query.
    formatos[c.formato] = { id: c.id, url: c.url ?? null, titulo: c.titulo };
  }
  return { kitId: d.kitId, desafio: { desafio_texto: d.desafio_texto, acao_observavel: d.acao_observavel, criterio_de_execucao: d.criterio_de_execucao }, formatos };
}

/** Tipo do resolvedor em memória (pré-carregado): (competência:::descritor) → kit. */
export type KitsCache = Map<string, {
  kitId: string | null;
  desafio: any;
  formatos: Record<string, { id: string; url: string | null; titulo: string }>;
  /** Preenchido quando havia kit do tema+DISC, mas só de outro cargo (barrado). */
  barradoPorCargo?: string;
}>;
/**
 * Chave do cache. O descritor passa por `normDescritor` — a MESMA tolerância que
 * `resolverDesafioDoKit` já aplicava (tira prefixo "COO03_D3 — ", acentos, caixa).
 *
 * Sem isso os dois resolvedores discordavam justamente onde importa: o cache era
 * montado com o descritor do BRIEF ("Limites profissionais") e consultado com o do
 * PLANO ("COO03_D3 — Limites profissionais"), dando miss e caindo no genérico com o
 * kit existindo. E como o overlay real SEMPRE tem cache (temporadas.ts pré-carrega),
 * o caminho tolerante nunca rodava em produção: a correção estava no resolvedor que
 * ninguém executa. Medido 29/07 no degradacao_log: 29 ocorrências / 2 pessoas de
 * ibipeba recebendo conteúdo genérico com o kit publicado do DISC delas na prateleira.
 */
const cacheKey = (competencia: string | null, descritor: string | null) => `${competencia || ''} ::: ${normDescritor(descritor || '')}`;

/**
 * Pré-carrega TODOS os kits de uma trilha em 3 queries (evita o N+1 do overlay,
 * que fazia 2-3 queries POR semana). Casa por (competência:::descritor) com a
 * MESMA preferência da leitura individual: cargo do colab > exclusivo da empresa
 * > fallback. Retorna um Map consultado em memória pelo overlay.
 */
export async function precarregarKits(
  sb: any,
  args: { empresaId: string | null; disc: string | null; cargo?: string | null },
): Promise<KitsCache> {
  const out: KitsCache = new Map();
  const disc = String(args.disc || '').trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(disc)) return out;

  // ⚠️ Os três `error` abaixo são PROPAGADOS (throw), não engolidos — F-C4 do
  // docs/FMEA-PIPELINE.md, causa-raiz do episódio de 16/07.
  //
  // Antes, um `{data: null, error}` (timeout, pool esgotado, reload de schema) caía
  // no `if (!x?.length) return out` e devolvia um Map VAZIO MAS TRUTHY. O
  // `overlayConteudo` testa `args.kitsCache ? cache.get(...) : resolverKitDaSemana(...)`
  // — cache truthy vence, o `.get()` devolve undefined, `if (!kit) return` mantém o
  // conteúdo do build, e a personalização da COORTE INTEIRA some de uma vez. Sem erro,
  // sem alerta: o `catch` de `aplicarOverlayKit` engole. Se o `core_id` do build
  // apontasse para conteúdo já apagado, a pessoa ficava sem core em todas as semanas.
  //
  // Lançando, o chamador (`temporadas.ts`, que faz `.catch(() => undefined)`) recebe
  // `undefined` e o overlay cai no caminho LIVE `resolverKitDaSemana` — que consulta
  // de novo e degrada bem. A distinção que importa: "não há kits" (Map vazio legítimo)
  // ≠ "não consegui saber se há kits" (falha de infraestrutura).
  const falhou = (etapa: string, error: any) => {
    throw new Error(`precarregarKits: ${etapa} falhou (${error?.message || error}) — cache abortado para não desligar o overlay em silêncio`);
  };

  // 1) briefs (empresa + global) — conjunto pequeno por empresa.
  let bq = sb.from('kit_briefs').select('id, competencia, descritor, cargo, empresa_id');
  bq = args.empresaId ? bq.or(`empresa_id.eq.${args.empresaId},empresa_id.is.null`) : bq.is('empresa_id', null);
  const { data: briefs, error: errBriefs } = await bq;
  if (errBriefs) falhou('briefs', errBriefs);
  if (!briefs?.length) return out;

  // 2) kits publicados do DISC. 3) conteúdos desses kits.
  const { data: kitsRows, error: errKits } = await sb.from('kits')
    .select('id, brief_id, desafio, created_at').in('brief_id', briefs.map((b: any) => b.id)).eq('disc', disc).eq('status', 'published');
  if (errKits) falhou('kits', errKits);
  if (!kitsRows?.length) return out;
  const kitByBrief = new Map(kitsRows.map((k: any) => [k.brief_id, k]));
  const { data: conteudos, error: errConteudos } = await sb.from('micro_conteudos')
    .select('id, kit_id, formato, url, titulo').in('kit_id', kitsRows.map((k: any) => k.id))
    // MESMA regra determinística de `resolverKitDaSemana` (ver o comentário longo lá):
    // duplicatas do mesmo kit+formato (re-runs de geração) resolvem para a cópia mais
    // RECENTE (created_at desc, desempate id desc), como a entrega de vídeo já faz.
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (errConteudos) falhou('micro_conteudos', errConteudos);
  const conteudosByKit = new Map<string, any[]>();
  for (const c of conteudos || []) { (conteudosByKit.get(c.kit_id) || conteudosByKit.set(c.kit_id, []).get(c.kit_id))!.push(c); }

  // Casa por (comp:::desc) escolhendo o melhor brief: cargo certo (2) + empresa (1).
  const cargoColab = String(args.cargo || '').trim().toLowerCase();
  /** Desempate determinístico entre kits de mesmo score: mais recente, depois id desc. */
  const maisNovo = (a: any, b: any) => {
    const ta = Date.parse(a?.created_at || '') || 0;
    const tb = Date.parse(b?.created_at || '') || 0;
    return ta !== tb ? ta > tb : String(a?.id || '') > String(b?.id || '');
  };
  const best = new Map<string, { kit: any; score: number }>();
  const barrados = new Map<string, string>(); // chave → cargo do brief recusado
  for (const b of briefs) {
    const kit = kitByBrief.get(b.id); if (!kit) continue;
    const key = cacheKey(b.competencia, b.descritor);
    // Cargo é FILTRO, não desempate (ver `cargoServe`). Guarda-se o recusado para o
    // overlay poder registrar "existe, mas do cargo errado" em vez de "não existe" —
    // a diferença entre gerar uma célula e investigar um tema inteiro.
    if (!cargoServe(b.cargo, args.cargo)) { barrados.set(key, String(b.cargo || '')); continue; }
    const score = (cargoColab && String(b.cargo || '').toLowerCase() === cargoColab ? 2 : 0) + (b.empresa_id ? 1 : 0);
    const prev = best.get(key);
    // Empate de score é REAL desde que a chave é normalizada: o mesmo tema existe
    // gravado nas duas grafias (medido em ibipeba: "COO03_D5 — Protagonismo do
    // bem-estar" e "Protagonismo do bem-estar", mesmo cargo e mesma empresa). Sem
    // critério, quem ganhava era a ordem que o Postgres devolveu — a mesma pessoa
    // podia receber um kit hoje e outro amanhã. Desempate: kit mais RECENTE vence
    // (id desc como último recurso), a mesma regra que o resto do arquivo usa para
    // duplicatas.
    if (!prev || score > prev.score || (score === prev.score && maisNovo(kit, prev.kit))) best.set(key, { kit, score });
  }
  for (const [key, { kit }] of best) {
    const formatos: Record<string, { id: string; url: string | null; titulo: string }> = {};
    for (const c of conteudosByKit.get(kit.id) || []) {
      if (c.formato === 'video') continue;
      if (formatos[c.formato]) continue; // duplicata de kit: a mais recente (1ª na ordem) já ficou
      // A entrega é por ID, não por url: a tela abre `/api/conteudo/{id}/pdf` (que
      // renderiza personalizado no runtime) e só cai no `url` como fallback. Exigir
      // `url` aqui EXCLUÍA conteúdo válido — `gerarConteudoIA` grava url=null quando o
      // PDF headless falha (pegadinha do tsx: fonte registrada em outra instância), e
      // aí o overlay não servia texto/case do kit. Medido 16/07: deixou 6 pessoas SEM
      // core na semana 2 (o core_id antigo apontava p/ conteúdo já apagado).
      formatos[c.formato] = { id: c.id, url: c.url ?? null, titulo: c.titulo };
    }
    out.set(key, { kitId: kit.id, desafio: kit.desafio || {}, formatos });
  }
  // Marcador só onde NÃO houve kit válido: um brief do cargo certo sempre vence.
  for (const [key, cargo] of barrados) {
    if (!out.has(key)) out.set(key, { kitId: null, desafio: {}, formatos: {}, barradoPorCargo: cargo });
  }
  return out;
}

/**
 * Deixa a semana com UM desafio só (jornada): mantém o da primeira entrega que
 * REALMENTE tem desafio e limpa o das demais — conteúdo, formatos e vídeo
 * seguem intactos, porque o que ficou único é a tarefa, não a pílula.
 *
 * "A primeira que tem" e não "a primeira": se o kit da entrega 1 não estiver
 * publicado e o da 2 estiver, escolher cegamente a 1 deixaria a semana SEM
 * tarefa nenhuma — a falha silenciosa clássica desta camada, que já custou 29
 * leituras no genérico com kit na prateleira (29/07).
 */
export function manterUmDesafio(entregas: any[]): void {
  const CAMPOS = ['desafio_texto', 'acao_observavel', 'criterio_de_execucao'] as const;
  const principal = entregas.findIndex((e) => e?.conteudo?.desafio_texto);
  if (principal < 0) return; // nenhuma tem desafio: não há o que unificar
  entregas.forEach((e, i) => {
    if (i === principal || !e?.conteudo) return;
    for (const campo of CAMPOS) delete e.conteudo[campo];
  });
}

/** Aplica o kit num objeto `conteudo` (mutação): formatos + core preferido + desafio. */
async function overlayConteudo(sb: any, conteudo: any, args: { empresaId: string | null; competencia: string | null; descritor: string | null; disc: string | null; cargo?: string | null; formatoPref: Formato; kitsCache?: KitsCache; colaboradorId?: string; semana?: number }) {
  if (!conteudo) return;
  // Com cache pré-carregado: consulta em memória (sem query). Sem cache: resolve 1×.
  let kit: { kitId: string; desafio: any; formatos: Record<string, { id: string; url: string | null; titulo: string }> } | null;
  let barradoPorCargo: string | undefined;
  if (args.kitsCache) {
    const entrada = args.kitsCache.get(cacheKey(args.competencia, args.descritor)) || null;
    // Entrada com kitId null é o MARCADOR de "existe, mas do cargo errado" — não é kit.
    kit = entrada?.kitId ? (entrada as { kitId: string; desafio: any; formatos: any }) : null;
    barradoPorCargo = entrada?.barradoPorCargo;
  } else {
    try {
      kit = await resolverKitDaSemana(sb, args);
    } catch (e: any) {
      // Erro de INFRA (banco) não é "kit ausente": registrar como tal misturava
      // falha de infra com ausência legítima na telemetria de degradação.
      // Mantém o conteúdo antigo e loga — a falha de banco aparece por outros canais.
      console.error('[overlayKit] resolverKitDaSemana falhou:', e?.message || e);
      return;
    }
  }
  if (!kit) {
    // sem kit → mantém o conteúdo antigo. FMEA §3.3: a degradação NÃO pode ser
    // invisível — registra UMA vez por (colaborador × semana) (dedup da mig 194;
    // roda a cada leitura de página, e sem o UNIQUE o log viraria ruído). Só
    // registra quando o caller identifica a pessoa: a prévia do health-check
    // (coleta.ts, sem colaboradorId) é simulação e não pode poluir o log.
    if (args.colaboradorId && args.semana != null) {
      await registrarDegradacao({
        fluxo: 'overlay',
        // Dois motivos, duas ações: "não existe kit deste tema/DISC" (escrever o tema)
        // ≠ "existe, mas do cargo errado" (gerar só a célula do cargo certo).
        tipo: barradoPorCargo ? DEGRADACAO.KIT_CARGO_DIVERGENTE : DEGRADACAO.KIT_AUSENTE_DISC,
        chave: `${args.colaboradorId}:${args.semana}`,
        empresaId: args.empresaId, colaboradorId: args.colaboradorId,
        detalhe: {
          disc: args.disc, cargo: args.cargo ?? null, competencia: args.competencia, descritor: args.descritor,
          ...(barradoPorCargo ? { kit_existe_no_cargo: barradoPorCargo } : {}),
        },
      }, sb);
    }
    return;
  }
  conteudo.kit_id = kit.kitId;
  conteudo.formatos_disponiveis = { ...(conteudo.formatos_disponiveis || {}), ...kit.formatos }; // mantém vídeo existente
  // formato_core = preferido se disponível; senão o 1º disponível.
  const disp = Object.keys(conteudo.formatos_disponiveis || {});
  conteudo.formato_core = disp.includes(args.formatoPref) ? args.formatoPref : (disp[0] || conteudo.formato_core);
  conteudo.core_id = conteudo.formatos_disponiveis?.[conteudo.formato_core]?.id || conteudo.core_id;
  conteudo.core_url = conteudo.formatos_disponiveis?.[conteudo.formato_core]?.url ?? conteudo.core_url;
  conteudo.core_titulo = conteudo.formatos_disponiveis?.[conteudo.formato_core]?.titulo || conteudo.core_titulo;
  if (kit.desafio.desafio_texto) {
    conteudo.desafio_texto = kit.desafio.desafio_texto;
    conteudo.acao_observavel = kit.desafio.acao_observavel || conteudo.acao_observavel;
    conteudo.criterio_de_execucao = kit.desafio.criterio_de_execucao || conteudo.criterio_de_execucao;
  }
}

/** Overlay do kit numa semana do plano (trata single e DUO via conteudos_dia). */
export async function overlayKitNaSemana(
  sb: any,
  semanaPlan: any,
  args: {
    empresaId: string | null;
    disc: string | null;
    cargo?: string | null;
    formatoPref: Formato;
    competenciaFoco: string | null;
    kitsCache?: KitsCache;
    colaboradorId?: string;
    /**
     * Jornada (05/08/2026): UMA tarefa por semana, cobrindo as duas pílulas.
     * O conteúdo continua sendo dois; o que passa a ser único é o desafio.
     * Sem o flag, nada muda — os modos de 14 semanas seguem com um desafio
     * por entrega, que é como as 47 trilhas em andamento foram geradas.
     */
    desafioUnicoPorSemana?: boolean;
  },
) {
  if (!semanaPlan || semanaPlan.tipo !== 'conteudo') return;
  if (Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length) {
    for (const e of semanaPlan.conteudos_dia) {
      await overlayConteudo(sb, e.conteudo, { empresaId: args.empresaId, competencia: e.competencia || args.competenciaFoco, descritor: e.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref, kitsCache: args.kitsCache, colaboradorId: args.colaboradorId, semana: semanaPlan.semana });
    }
    if (args.desafioUnicoPorSemana) manterUmDesafio(semanaPlan.conteudos_dia);
  } else {
    await overlayConteudo(sb, semanaPlan.conteudo, { empresaId: args.empresaId, competencia: args.competenciaFoco, descritor: semanaPlan.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref, kitsCache: args.kitsCache, colaboradorId: args.colaboradorId, semana: semanaPlan.semana });
  }
}
