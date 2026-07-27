/**
 * Entrega do KIT na semana (Fase 4): faz o overlay do conteúdo do kit no
 * `conteudo` da semana — os formatos (texto/caso/áudio do kit, por DISC) viram
 * os `formatos_disponiveis`, o `formato_core` vira o formato PREFERIDO da pessoa
 * (principal; os outros = apoio, via switch que já existe), e o `desafio_texto`
 * vira o desafio do kit. O VÍDEO segue resolvido pelo pipeline de célula
 * (resolverVideoDaSemana) — só preservamos a entrada dele. Aditivo: sem kit, o
 * conteúdo antigo (buildSeason) permanece. Ver docs/KIT-SEMANAL.md.
 */
import { resolverDesafioDoKit } from './desafio-semana';

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
  const { data: conteudos } = await sb.from('micro_conteudos')
    .select('id, formato, url, titulo').eq('kit_id', d.kitId);
  const formatos: Record<string, { id: string; url: string | null; titulo: string }> = {};
  for (const c of conteudos || []) {
    if (c.formato === 'video') continue; // vídeo é do pipeline de célula (resolverVideoDaSemana)
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
export type KitsCache = Map<string, { kitId: string; desafio: any; formatos: Record<string, { id: string; url: string | null; titulo: string }> }>;
const cacheKey = (competencia: string | null, descritor: string | null) => `${competencia || ''} ::: ${descritor || ''}`;

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
    .select('id, brief_id, desafio').in('brief_id', briefs.map((b: any) => b.id)).eq('disc', disc).eq('status', 'published');
  if (errKits) falhou('kits', errKits);
  if (!kitsRows?.length) return out;
  const kitByBrief = new Map(kitsRows.map((k: any) => [k.brief_id, k]));
  const { data: conteudos, error: errConteudos } = await sb.from('micro_conteudos')
    .select('id, kit_id, formato, url, titulo').in('kit_id', kitsRows.map((k: any) => k.id));
  if (errConteudos) falhou('micro_conteudos', errConteudos);
  const conteudosByKit = new Map<string, any[]>();
  for (const c of conteudos || []) { (conteudosByKit.get(c.kit_id) || conteudosByKit.set(c.kit_id, []).get(c.kit_id))!.push(c); }

  // Casa por (comp:::desc) escolhendo o melhor brief: cargo certo (2) + empresa (1).
  const cargoColab = String(args.cargo || '').trim().toLowerCase();
  const best = new Map<string, { kit: any; score: number }>();
  for (const b of briefs) {
    const kit = kitByBrief.get(b.id); if (!kit) continue;
    const key = cacheKey(b.competencia, b.descritor);
    const score = (cargoColab && String(b.cargo || '').toLowerCase() === cargoColab ? 2 : 0) + (b.empresa_id ? 1 : 0);
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { kit, score });
  }
  for (const [key, { kit }] of best) {
    const formatos: Record<string, { id: string; url: string | null; titulo: string }> = {};
    for (const c of conteudosByKit.get(kit.id) || []) {
      if (c.formato === 'video') continue;
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
  return out;
}

/** Aplica o kit num objeto `conteudo` (mutação): formatos + core preferido + desafio. */
async function overlayConteudo(sb: any, conteudo: any, args: { empresaId: string | null; competencia: string | null; descritor: string | null; disc: string | null; cargo?: string | null; formatoPref: Formato; kitsCache?: KitsCache }) {
  if (!conteudo) return;
  // Com cache pré-carregado: consulta em memória (sem query). Sem cache: resolve 1×.
  const kit = args.kitsCache
    ? (args.kitsCache.get(cacheKey(args.competencia, args.descritor)) || null)
    : await resolverKitDaSemana(sb, args).catch(() => null);
  if (!kit) return; // sem kit → mantém o conteúdo antigo
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
  args: { empresaId: string | null; disc: string | null; cargo?: string | null; formatoPref: Formato; competenciaFoco: string | null; kitsCache?: KitsCache },
) {
  if (!semanaPlan || semanaPlan.tipo !== 'conteudo') return;
  if (Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length) {
    for (const e of semanaPlan.conteudos_dia) {
      await overlayConteudo(sb, e.conteudo, { empresaId: args.empresaId, competencia: e.competencia || args.competenciaFoco, descritor: e.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref, kitsCache: args.kitsCache });
    }
  } else {
    await overlayConteudo(sb, semanaPlan.conteudo, { empresaId: args.empresaId, competencia: args.competenciaFoco, descritor: semanaPlan.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref, kitsCache: args.kitsCache });
  }
}
