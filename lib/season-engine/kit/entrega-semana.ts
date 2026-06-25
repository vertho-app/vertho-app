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
    // texto/case: url = PDF. áudio: id alimenta /api/conteudo/[id]/podcast (url null ok).
    if (c.formato === 'audio' || c.url) formatos[c.formato] = { id: c.id, url: c.url ?? null, titulo: c.titulo };
  }
  return { kitId: d.kitId, desafio: { desafio_texto: d.desafio_texto, acao_observavel: d.acao_observavel, criterio_de_execucao: d.criterio_de_execucao }, formatos };
}

/** Aplica o kit num objeto `conteudo` (mutação): formatos + core preferido + desafio. */
async function overlayConteudo(sb: any, conteudo: any, args: { empresaId: string | null; competencia: string | null; descritor: string | null; disc: string | null; cargo?: string | null; formatoPref: Formato }) {
  if (!conteudo) return;
  const kit = await resolverKitDaSemana(sb, args).catch(() => null);
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
  args: { empresaId: string | null; disc: string | null; cargo?: string | null; formatoPref: Formato; competenciaFoco: string | null },
) {
  if (!semanaPlan || semanaPlan.tipo !== 'conteudo') return;
  if (Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length) {
    for (const e of semanaPlan.conteudos_dia) {
      await overlayConteudo(sb, e.conteudo, { empresaId: args.empresaId, competencia: e.competencia || args.competenciaFoco, descritor: e.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref });
    }
  } else {
    await overlayConteudo(sb, semanaPlan.conteudo, { empresaId: args.empresaId, competencia: args.competenciaFoco, descritor: semanaPlan.descritor, disc: args.disc, cargo: args.cargo, formatoPref: args.formatoPref });
  }
}
