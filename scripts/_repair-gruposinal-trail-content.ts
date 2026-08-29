/* eslint-disable */
/**
 * Repara o conteúdo da jornada de vitrine da Bruna usando o pipeline normal de
 * Kits Semanais. O reset recria a trilha, mas preserva kit_briefs, kits e
 * micro_conteudos; por isso a correção continua valendo nos próximos resets.
 *
 * Uso:
 *   npx --yes tsx scripts/_repair-gruposinal-trail-content.ts          # dry-run
 *   npx --yes tsx scripts/_repair-gruposinal-trail-content.ts --execute
 *   npx --yes tsx scripts/_repair-gruposinal-trail-content.ts --execute --all
 */
import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import { gerarKitSemanal } from '@/actions/kits';
import {
  formatoPreferido,
  overlayKitNaSemana,
  precarregarKits,
} from '@/lib/season-engine/kit/entrega-semana';
import { normDescritor } from '@/lib/blueprint/to-descriptors';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { assinaturaCurta, briefPreenchido } from '@/lib/escola-brief';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';

const SLUG = 'gruposinal';
const EMAIL = 'bruna.demo@vertho.ai';
const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');
const ALL = process.argv.includes('--all');
const BASE = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.vertho.ai';
const SECRET = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type Tema = {
  competencia: string;
  descritor: string;
  nivelMin: number;
  nivelMax: number;
  semanas: number[];
};

function conteudosDaSemana(semana: any): any[] {
  if (Array.isArray(semana?.conteudos_dia) && semana.conteudos_dia.length > 0) {
    return semana.conteudos_dia.map((item: any) => item?.conteudo).filter(Boolean);
  }
  return semana?.conteudo ? [semana.conteudo] : [];
}

function formatosDaSemana(semana: any): string[] {
  return [...new Set(conteudosDaSemana(semana)
    .flatMap((conteudo: any) => Object.keys(conteudo?.formatos_disponiveis || {})))].sort();
}

async function storageTemArquivo(sb: any, path: string): Promise<boolean> {
  const partes = path.split('/');
  const nome = partes.pop()!;
  const { data, error } = await sb.storage.from('conteudos').list(partes.join('/'), { limit: 20, search: nome });
  if (error) throw new Error(`listar cache ${path}: ${error.message}`);
  return (data || []).some((item: any) => item.name === nome && Number(item.metadata?.size || 0) > 0);
}

async function aquecerAudioBaseEPersonalizado(sb: any, contentId: string, colaboradorId: string) {
  if (!SECRET) throw new Error('INTERNAL_API_KEY/SUPABASE_SERVICE_ROLE_KEY ausente');
  const alvos = [
    { nome: 'base', path: `final/podcast-base/${contentId}.mp3`, body: { id: contentId } },
    { nome: 'personalizado', path: `final/audio-personalizado/${contentId}/${colaboradorId}.mp3`, body: { id: contentId, colaboradorId } },
  ];
  const resultados: string[] = [];
  // Sequencial por conteúdo: duas invocações de TTS longas concorrendo pelo
  // mesmo roteiro podem pressionar a cota e empurrar uma delas até o timeout de
  // 300s da função. O cache mantém re-runs baratos.
  for (const alvo of alvos) {
    if (await storageTemArquivo(sb, alvo.path)) {
      resultados.push(`${alvo.nome}:cache`);
      continue;
    }
    console.log(`AUDIO_START ${contentId} ${alvo.nome}`);
    const response = await fetch(`${BASE}/api/internal/pregerar-podcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify(alvo.body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`prewarm áudio HTTP ${response.status}: ${text.slice(0, 240)}`);
    resultados.push(`${alvo.nome}:gerado`);
  }
  return resultados;
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id,slug,is_demo,sys_config').eq('slug', SLUG).maybeSingle();
  if (empresaError) throw new Error(empresaError.message);
  if (!empresa || empresa.slug !== SLUG || empresa.is_demo !== true) {
    throw new Error('ABORT: o alvo precisa ser exatamente o tenant demo gruposinal');
  }

  const { data: colab, error: colabError } = await sb.from('colaboradores')
    .select('id,nome_completo,email,cargo,empresa_id,perfil_dominante,pref_video_curto,pref_video_longo,pref_texto,pref_audio,pref_estudo_caso')
    .eq('empresa_id', empresa.id).eq('email', EMAIL).maybeSingle();
  if (colabError || !colab) throw new Error(colabError?.message || 'Bruna não encontrada');

  const { data: trilha, error: trilhaError } = await sb.from('trilhas')
    .select('id,competencia_foco,temporada_plano,criado_em').eq('empresa_id', empresa.id)
    .eq('colaborador_id', colab.id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (trilhaError || !trilha) throw new Error(trilhaError?.message || 'trilha da Bruna não encontrada');

  const plano = normalizeTemporadaPlano(trilha.temporada_plano);
  const semanasAlvo = plano.filter((semana: any) => semana?.tipo === 'conteudo' && (ALL || Number(semana.semana) === 1));
  const temas = new Map<string, Tema>();
  for (const semana of semanasAlvo) {
    const itens = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length > 0
      ? semana.conteudos_dia
      : [{ competencia: semana.competencia || trilha.competencia_foco, descritor: semana.descritor, nivel_atual: semana.nivel_atual, conteudo: semana.conteudo }];
    for (const item of itens) {
      const competencia = String(item?.competencia || semana.competencia || trilha.competencia_foco || '').trim();
      const descritor = String(item?.descritor || semana.descritor || '').trim();
      if (!competencia || !descritor) continue;
      const key = `${competencia}|||${descritor}`;
      const atual = temas.get(key) || {
        competencia,
        descritor,
        nivelMin: Number(item?.nivel_atual ?? semana.nivel_atual ?? 1),
        nivelMax: Number(semana.nivel_alvo ?? 3),
        semanas: [],
      };
      atual.semanas.push(Number(semana.semana));
      temas.set(key, atual);
    }
  }

  const disc = String(colab.perfil_dominante || '').charAt(0).toUpperCase();
  const antes = await precarregarKits(sb, { empresaId: empresa.id, disc, cargo: colab.cargo });
  const pendentes = [...temas.values()].filter((tema) =>
    !antes.get(`${tema.competencia} ::: ${normDescritor(tema.descritor)}`)?.kitId,
  );

  console.log(JSON.stringify({
    tenant: empresa.slug,
    colaborador: { id: colab.id, nome: colab.nome_completo, cargo: colab.cargo, disc },
    escopo: ALL ? 'toda a jornada' : 'semana 1',
    temas: [...temas.values()],
    pendentes: pendentes.map((tema) => tema.descritor),
    executar: EXECUTE,
    verificar: VERIFY,
  }, null, 2));
  if (!EXECUTE && !VERIFY) return;
  if (VERIFY && pendentes.length > 0) {
    throw new Error(`kits pendentes: ${pendentes.map((tema) => tema.descritor).join(', ')}`);
  }

  for (const tema of (EXECUTE ? pendentes : [])) {
    const inicio = Date.now();
    const result: any = await gerarKitSemanal({
      competencia: tema.competencia,
      descritor: tema.descritor,
      nivelMin: Math.max(1, Math.min(4, tema.nivelMin)),
      nivelMax: Math.max(1, Math.min(4, tema.nivelMax)),
      cargo: colab.cargo,
      contexto: 'corporativo',
      empresaId: empresa.id,
      discs: [disc] as any,
      formatos: ['audio', 'texto', 'case'],
      renderAudio: false,
      incluirVideo: false,
      useBatch: false,
      sb,
    });
    const kit = result?.kits?.[0];
    if (!result?.success || !kit?.ok) throw new Error(`${tema.descritor}: ${kit?.error || result?.error || 'kit não publicado'}`);
    console.log(`KIT_OK ${tema.descritor} ${Math.round((Date.now() - inicio) / 1000)}s`);
  }

  const kitsCache = await precarregarKits(sb, { empresaId: empresa.id, disc, cargo: colab.cargo });
  const planoComOverlay = structuredClone(plano);
  for (const semana of planoComOverlay.filter((item: any) => item?.tipo === 'conteudo')) {
    await overlayKitNaSemana(sb, semana, {
      empresaId: empresa.id,
      disc,
      cargo: colab.cargo,
      formatoPref: formatoPreferido(colab),
      competenciaFoco: trilha.competencia_foco,
      kitsCache,
    });
  }

  const alvoValidacao = planoComOverlay.filter((semana: any) => semanasAlvo.some((alvo: any) => Number(alvo.semana) === Number(semana.semana)));
  for (const semana of alvoValidacao) {
    const formatos = formatosDaSemana(semana);
    if (!['audio', 'texto', 'case'].every((formato) => formatos.includes(formato))) {
      throw new Error(`semana ${semana.semana} incompleta: ${formatos.join(', ') || 'nenhum formato'}`);
    }
  }

  const audioIds = [...new Set(alvoValidacao.flatMap((semana: any) => conteudosDaSemana(semana))
    .map((conteudo: any) => conteudo?.formatos_disponiveis?.audio?.id)
    .filter(Boolean))] as string[];
  for (const id of audioIds) {
    if (EXECUTE) {
      const aquecidos = await aquecerAudioBaseEPersonalizado(sb, id, colab.id);
      console.log(`AUDIO_OK ${id} ${aquecidos.join('+')}`);
    } else {
      const baseOk = await storageTemArquivo(sb, `final/podcast-base/${id}.mp3`);
      const persoOk = await storageTemArquivo(sb, `final/audio-personalizado/${id}/${colab.id}.mp3`);
      if (!baseOk || !persoOk) throw new Error(`áudio frio ${id}: base=${baseOk} personalizado=${persoOk}`);
      console.log(`AUDIO_OK ${id} base:cache+personalizado:cache`);
    }
  }

  const contentIds = [...new Set(alvoValidacao.flatMap((semana: any) => conteudosDaSemana(semana))
    .flatMap((conteudo: any) => Object.values(conteudo?.formatos_disponiveis || {}).map((item: any) => item?.id))
    .filter(Boolean))] as string[];
  const { data: conteudos, error: conteudosError } = await sb.from('micro_conteudos')
    .select('id,formato,titulo,url,storage_path').in('id', contentIds);
  if (conteudosError) throw new Error(conteudosError.message);
  const pdfsSemArquivo = (conteudos || []).filter((item: any) => ['texto', 'case'].includes(item.formato) && (!item.url || !item.storage_path));
  if (pdfsSemArquivo.length > 0) throw new Error(`PDFs sem arquivo: ${pdfsSemArquivo.map((item: any) => item.id).join(', ')}`);

  // O conteúdo do Kit já nasceu para (Grupo Sinal × Representante Comercial ×
  // DISC C). A rota de PDF, por desenho geral, ainda procura a chave de cache
  // personalizada. Copiar o PDF pronto para essa chave evita uma segunda camada
  // redundante de IA no primeiro clique da demo.
  const manual = (empresa.sys_config as any)?.video_escola || null;
  let contextoAssinatura = 'sem-ppp';
  if (briefPreenchido(manual)) contextoAssinatura = 'brief-manual';
  else {
    const contexto = await resolverContextoEmpresa(sb, empresa.id).catch(() => null);
    if (contexto) contextoAssinatura = assinaturaCurta(contexto);
  }
  const arquetipoSlug = String(colab.perfil_dominante || '').trim().toUpperCase().replace(/[^A-Z]/g, '') || 'NA';
  let pdfsAquecidos = 0;
  let pdfsEmCache = 0;
  for (const item of (conteudos || []).filter((conteudo: any) => ['texto', 'case'].includes(conteudo.formato))) {
    const destino = `final/perso/${item.id}/${empresa.id}/${arquetipoSlug}-${contextoAssinatura}.pdf`;
    if (await storageTemArquivo(sb, destino)) {
      pdfsEmCache++;
      continue;
    }
    if (!EXECUTE) throw new Error(`PDF personalizado frio: ${item.id}`);
    const { error: copyError } = await sb.storage.from('conteudos').copy(item.storage_path, destino);
    if (copyError) throw new Error(`prewarm PDF ${item.id}: ${copyError.message}`);
    if (!(await storageTemArquivo(sb, destino))) throw new Error(`prewarm PDF ${item.id}: arquivo não confirmado`);
    pdfsAquecidos++;
  }

  console.log(JSON.stringify({
    ok: true,
    semanas: alvoValidacao.map((semana: any) => ({ semana: semana.semana, formatos: formatosDaSemana(semana) })),
    conteudos,
    audiosAquecidos: audioIds.length,
    pdfsAquecidos,
    pdfsEmCache,
    pdfCache: `${arquetipoSlug}-${contextoAssinatura}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
